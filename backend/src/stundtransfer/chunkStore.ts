// StundTransfer: writes each uploaded chunk directly at its offset in the
// staging file, so chunks can arrive in any order and in parallel. A small
// append-only log of received chunk indexes makes uploads resumable.
// Pure module (no Nest/Prisma) so it can be unit-tested.
import { Stats, constants as fsConstants } from "fs";
import * as fs from "fs/promises";
import * as path from "path";
import { allocatedBytes } from "./freeSpace";

export function totalChunks(size: number, chunkSize: number) {
  // A 0-byte file is still sent as one (empty) chunk
  return Math.max(1, Math.ceil(size / chunkSize));
}

export function expectedChunkLength(
  size: number,
  chunkSize: number,
  index: number,
) {
  return Math.max(0, Math.min(chunkSize, size - index * chunkSize));
}

const WRITE_BLOCK_BYTES = 8 * 1024 * 1024;
// Removed deposits remembered (chunks in flight can last up to 2 h)
const MAX_REMOVED_REMEMBERED = 10_000;

/** The chunk received does not have the expected length. */
export class ChunkLengthError extends Error {
  constructor() {
    super("Chunk length does not match");
  }
}

/** The .part file was deleted or replaced while this chunk was written: it must be sent again. */
export class StagingFileChangedError extends Error {
  constructor() {
    super("The staging file was deleted or replaced while a chunk was written");
  }
}

/** The deposit was removed (cancelled, stored, cleaned up) while this chunk was received. */
export class DepositRemovedError extends Error {
  constructor() {
    super("The deposit was removed while a chunk was written");
  }
}

type FileState = {
  // Chunks written (durable or about to be flushed)
  received: Set<number>;
  // Chunks written but not yet flushed to disk and logged
  unflushed: Set<number>;
  // Inode of the .part file the chunks above were written to
  ino?: bigint;
  // Chunks of a deleted .part being forgotten
  resetting?: Promise<void>;
  timer?: ReturnType<typeof setTimeout>;
  flushing?: Promise<void>;
};

/**
 * Durability: a chunk is logged as received only after the data is flushed
 * to disk (fdatasync). Flushing after every chunk makes hard disks stall, so
 * flushes are grouped: every `flushDelayMs`, and always before a file is
 * reported complete. After a crash, unlogged chunks are simply sent again.
 */
export class ChunkStore {
  // "<depositId>/<fileId>" -> state (loaded once from the log)
  private files = new Map<string, Promise<FileState>>();
  // Chunks still in flight for these deposits never create their folder again
  private removed = new Set<string>();

  constructor(
    private readonly root: string,
    private readonly flushDelayMs = 2000,
  ) {}

  depositDir(depositId: string) {
    return path.join(this.root, depositId);
  }

  dataPath(depositId: string, fileId: string) {
    return path.join(this.depositDir(depositId), `${fileId}.part`);
  }

  private logPath(depositId: string, fileId: string) {
    return path.join(this.depositDir(depositId), `${fileId}.chunks`);
  }

  async prepareDeposit(depositId: string) {
    this.removed.delete(depositId);
    await fs.mkdir(this.depositDir(depositId), { recursive: true });
  }

  private state(depositId: string, fileId: string): Promise<FileState> {
    const key = `${depositId}/${fileId}`;
    let state = this.files.get(key);
    if (!state) {
      state = this.loadLog(depositId, fileId).then((received) => ({
        received,
        unflushed: new Set<number>(),
      }));
      // Not kept for a removed deposit (late chunks, flush timers)
      if (this.removed.has(depositId)) return state;
      this.files.set(key, state);
      state.catch(() => this.files.delete(key));
    }
    return state;
  }

  private async loadLog(depositId: string, fileId: string) {
    try {
      const log = await fs.readFile(this.logPath(depositId, fileId), "utf8");
      return new Set(
        log
          .split("\n")
          .filter((line) => /^\d+$/.test(line))
          .map((line) => parseInt(line, 10)),
      );
    } catch (e) {
      if (e?.code === "ENOENT") return new Set<number>();
      throw e;
    }
  }

  async receivedChunks(depositId: string, fileId: string) {
    return (await this.state(depositId, fileId)).received;
  }

  /** Ids of the files that have a .part in the staging folder of a deposit. */
  async stagedFileIds(depositId: string): Promise<Set<string>> {
    try {
      const names = await fs.readdir(this.depositDir(depositId));
      return new Set(
        names.filter((name) => name.endsWith(".part")).map((name) => name.slice(0, -5)),
      );
    } catch (e) {
      if (e?.code === "ENOENT") return new Set();
      throw e;
    }
  }

  /**
   * Bytes already on disk for a file being sent, as the free space of the
   * volume counts them: the space allocated to its .part (chunks arrive in
   * any order, so it can have holes), else the chunks received by this process.
   */
  async writtenBytes(depositId: string, fileId: string, size: number, chunkSize: number) {
    let stats: Stats;
    try {
      stats = await fs.stat(this.dataPath(depositId, fileId));
    } catch (e) {
      if (e?.code === "ENOENT") return 0;
      throw e;
    }
    const allocated = allocatedBytes(stats);
    if (allocated !== undefined) return allocated;
    const state = await this.files.get(`${depositId}/${fileId}`)?.catch(() => undefined);
    let bytes = 0;
    state?.received.forEach((index) => (bytes += expectedChunkLength(size, chunkSize, index)));
    return bytes;
  }

  /** Whether the .part file is on disk with the expected size. */
  async isStaged(depositId: string, fileId: string, size: number) {
    try {
      return (await fs.stat(this.dataPath(depositId, fileId))).size === size;
    } catch (e) {
      if (e?.code === "ENOENT") return false;
      throw e;
    }
  }

  /** Forgets everything received for a file (its data was lost): it will be sent again. */
  async resetFile(depositId: string, fileId: string) {
    const state = await this.state(depositId, fileId);
    await fs.rm(this.dataPath(depositId, fileId), { force: true });
    // Chunks still being written to the deleted file are not recorded
    state.ino = undefined;
    await this.forgetChunks(depositId, fileId, state);
  }

  /** Forgets the chunks received for a file. New chunks wait until it is done. */
  private forgetChunks(depositId: string, fileId: string, state: FileState) {
    state.resetting ??= (async () => {
      // A flush in progress must not log its chunks after the log is deleted
      while (state.flushing) await state.flushing.catch(() => undefined);
      clearTimeout(state.timer);
      state.timer = undefined;
      state.received.clear();
      state.unflushed.clear();
      await fs.rm(this.logPath(depositId, fileId), { force: true });
    })().finally(() => {
      state.resetting = undefined;
    });
    return state.resetting;
  }

  /**
   * Opens the .part file. If it was deleted behind our back (e.g. someone
   * tidying the NAS by hand), the folder is created again and the chunks
   * recorded for the old file are forgotten, so they are sent again instead
   * of leaving zeros in the file. Never for a removed deposit.
   */
  private async openPart(depositId: string, fileId: string, state: FileState) {
    const file = this.dataPath(depositId, fileId);
    let created = false;
    let handle: fs.FileHandle;
    try {
      handle = await fs.open(file, fsConstants.O_WRONLY);
    } catch (e) {
      if (e?.code !== "ENOENT") throw e;
      if (this.removed.has(depositId)) throw new DepositRemovedError();
      await fs.mkdir(this.depositDir(depositId), { recursive: true });
      // O_EXCL: only the chunk that really creates it says so (parallel chunks
      // race here); never O_TRUNC, so they never erase each other
      try {
        handle = await fs.open(
          file,
          fsConstants.O_WRONLY | fsConstants.O_CREAT | fsConstants.O_EXCL,
          0o644,
        );
        created = true;
      } catch (e) {
        if (e?.code !== "EEXIST") throw e;
        handle = await fs.open(file, fsConstants.O_WRONLY);
      }
      if (this.removed.has(depositId)) {
        // Removed meanwhile: what was just created goes too
        await handle.close();
        await fs.rm(this.depositDir(depositId), { recursive: true, force: true });
        throw new DepositRemovedError();
      }
    }
    let ino: bigint;
    try {
      ({ ino } = await handle.stat({ bigint: true }));
      // Created again: the chunks recorded before are lost, even if Linux gave
      // the new file the same inode number as the deleted one
      const recreated = created && (state.ino !== undefined || state.received.size > 0);
      if (state.ino !== ino || recreated) {
        // After a restart the log is trusted if its .part file is still there
        const stale = recreated || state.ino !== undefined;
        // Set first: chunks still being written to the old file are not recorded
        state.ino = ino;
        if (stale) this.forgetChunks(depositId, fileId, state);
      }
      await state.resetting;
    } catch (e) {
      await handle.close();
      throw e;
    }
    return { handle, ino };
  }

  /**
   * Writes `data` at `position`. Writing the same chunk twice (network retry)
   * is harmless. When the last missing chunk arrives, everything is flushed
   * before returning, so a complete file is always on disk.
   */
  async writeChunk(
    depositId: string,
    fileId: string,
    index: number,
    position: number,
    // A buffer, or a stream written to disk as it arrives (low memory use)
    data: Buffer | AsyncIterable<Buffer>,
    totalChunks: number,
    expectedLength: number = Buffer.isBuffer(data) ? data.length : 0,
  ): Promise<Set<number>> {
    if (this.removed.has(depositId)) throw new DepositRemovedError();
    const state = await this.state(depositId, fileId);
    const { handle, ino } = await this.openPart(depositId, fileId, state);
    const writeAt = async (block: Buffer, at: number) => {
      let offset = 0;
      while (offset < block.length) {
        const { bytesWritten } = await handle.write(
          block,
          offset,
          block.length - offset,
          at + offset,
        );
        offset += bytesWritten;
      }
    };

    let received = 0;
    // Streamed data is grouped in large blocks (hard disks hate small writes),
    // and the next block is received while the previous one is written.
    let pending: Buffer[] = [];
    let pendingBytes = 0;
    let dispatched = 0;
    let writing: Promise<void> = Promise.resolve();
    const dispatch = async () => {
      const block = Buffer.concat(pending, pendingBytes);
      const at = position + dispatched;
      dispatched += pendingBytes;
      pending = [];
      pendingBytes = 0;
      await writing;
      writing = writeAt(block, at);
    };

    try {
      if (Buffer.isBuffer(data)) {
        received = data.length;
        if (received > expectedLength) throw new ChunkLengthError();
        await writeAt(data, position);
      } else {
        for await (const piece of data) {
          received += piece.length;
          if (received > expectedLength) throw new ChunkLengthError();
          pending.push(piece);
          pendingBytes += piece.length;
          if (pendingBytes >= WRITE_BLOCK_BYTES) await dispatch();
        }
        if (pendingBytes > 0) await dispatch();
        await writing;
      }
    } finally {
      await writing.catch(() => undefined);
      await handle.close();
    }
    // Incomplete chunk (connection cut): not recorded, it will be sent again
    if (received !== expectedLength) throw new ChunkLengthError();
    // Written to a .part deleted with its deposit: never recorded
    if (this.removed.has(depositId)) throw new DepositRemovedError();
    if (state.ino !== ino) throw new StagingFileChangedError();

    if (!state.received.has(index)) {
      state.received.add(index);
      state.unflushed.add(index);
    }

    if (state.received.size >= totalChunks) {
      await this.flush(depositId, fileId);
    } else if (!state.timer) {
      state.timer = setTimeout(() => {
        state.timer = undefined;
        this.flush(depositId, fileId).catch(() => undefined);
      }, this.flushDelayMs);
      // Never keeps the process alive (unflushed chunks are simply sent again)
      state.timer.unref?.();
    }
    return state.received;
  }

  /** Flushes written chunks to disk, then logs them as received. */
  async flush(depositId: string, fileId: string) {
    if (this.removed.has(depositId)) return;
    const state = await this.state(depositId, fileId);
    // One flush at a time per file
    while (state.flushing) await state.flushing.catch(() => undefined);
    if (state.unflushed.size === 0) return;

    const indexes = [...state.unflushed];
    state.unflushed.clear();
    state.flushing = (async () => {
      try {
        const handle = await fs.open(this.dataPath(depositId, fileId), "r+");
        try {
          await handle.datasync();
        } finally {
          await handle.close();
        }
        await fs.appendFile(
          this.logPath(depositId, fileId),
          indexes.map((i) => `${i}\n`).join(""),
        );
      } catch (e) {
        // Not durable: forget these chunks so they are sent again
        indexes.forEach((i) => state.received.delete(i));
        throw e;
      } finally {
        state.flushing = undefined;
      }
    })();
    return state.flushing;
  }

  forgetDeposit(depositId: string) {
    for (const [key, state] of this.files) {
      if (!key.startsWith(`${depositId}/`)) continue;
      state.then((s) => clearTimeout(s.timer)).catch(() => undefined);
      this.files.delete(key);
    }
  }

  async removeDeposit(depositId: string) {
    // Moved to the end: the oldest are forgotten first (a Set keeps the order)
    this.removed.delete(depositId);
    this.removed.add(depositId);
    if (this.removed.size > MAX_REMOVED_REMEMBERED)
      this.removed.delete(this.removed.values().next().value);
    this.forgetDeposit(depositId);
    await fs.rm(this.depositDir(depositId), { recursive: true, force: true });
  }
}
