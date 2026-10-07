// StundTransfer: deposit logic. Uploaders send their rushes through a reverse
// share link; files are written in the staging folder then moved to
// "<transfer>/<Nom> - <Vidéo>/". No Pingvin share (and no download link) is
// ever created for a deposit.
import {
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  OnModuleInit,
} from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { StundDeposit, StundDepositFile, User } from "@prisma/client";
import * as crypto from "crypto";
import * as fs from "fs/promises";
import * as moment from "moment";
import * as path from "path";
import { validate as isValidUUID } from "uuid";
import { ConfigService } from "src/config/config.service";
import { PrismaService } from "src/prisma/prisma.service";
import { ReverseShareService } from "src/reverseShare/reverseShare.service";
import {
  ChunkLengthError,
  ChunkStore,
  DepositRemovedError,
  expectedChunkLength,
  totalChunks,
} from "./chunkStore";
import { AddDepositFilesDTO, CreateDepositDTO } from "./dto/deposit.dto";
import { FreeSpaceGuard, freeBytes, spaceStillNeeded } from "./freeSpace";
import {
  assertRealPathInside,
  depositFolderName,
  existingFolderNamesLowercase,
  findExistingFolderName,
  folderCandidates,
  resolveInside,
  sanitizeRelativePath,
  sanitizeSegment,
} from "./paths";
import { ensureFolder, findMovedFile, moveIntoFolder, syncDir } from "./safeMove";
import {
  STUND_CHUNK_BYTES,
  STUND_DESTINATION_KEY,
  STUND_ROOT_DIR,
  STUND_ROOT_NAME,
  STUND_STAGING_DIR,
  isStundTransferEnabled,
} from "./stundtransfer.config";

const ACTIVITY_WRITE_INTERVAL_MS = 60 * 1000;
const TOKEN_REGEX = /^[a-zA-Z0-9_-]{1,200}$/;
// Deposit folders not usable: checked again at most this often
const STORAGE_RECHECK_MS = 30 * 1000;
// Cancelled and abandoned deposits are removed from the history after this
const PURGE_ABANDONED_AFTER_MS = 30 * 24 * 3600 * 1000;
// Only deposits active this recently reserve free space (lastActivityAt is
// written at least every minute while chunks arrive)
const RESERVATION_ACTIVE_MS = 15 * 60 * 1000;
// Clock margin when looking for a file moved before a restart
const MOVED_FILE_CLOCK_SLACK_MS = 60 * 1000;
// Files of a deposit looked up on disk at the same time (up to 100,000 files)
const CHECK_CONCURRENCY = 32;
// Write errors meaning "no more room" (EDQUOT: Synology quota of the account or shared folder)
const OUT_OF_SPACE_CODES = new Set(["ENOSPC", "EDQUOT", "EFBIG"]);

// Errors carry a stable "error" code the frontend translates.
export function stundError(
  status: HttpStatus,
  error: string,
  message: string,
  extra: Record<string, unknown> = {},
) {
  return new HttpException(
    { statusCode: status, error, message, ...extra },
    status,
  );
}

function sha256(value: string) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

/** Runs `task` on every item, CHECK_CONCURRENCY at a time, results in order. */
async function inSlices<T, R>(items: T[], task: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = [];
  for (let i = 0; i < items.length; i += CHECK_CONCURRENCY)
    results.push(...(await Promise.all(items.slice(i, i + CHECK_CONCURRENCY).map(task))));
  return results;
}

function notEnoughSpace(message = "Not enough free space on the server for these files") {
  return stundError(HttpStatus.INSUFFICIENT_STORAGE, "stund_not_enough_space", message);
}

const exists = (file: string) =>
  fs.access(file).then(
    () => true,
    () => false,
  );

function formatBytes(bytes: number) {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1000 && unit < units.length - 1) {
    value /= 1000;
    unit++;
  }
  return `${value.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`;
}

const ADMIN_DEPOSIT_FIELDS = {
  id: true,
  createdAt: true,
  lastActivityAt: true,
  completedAt: true,
  uploaderName: true,
  videoName: true,
  folderName: true,
  finalFolder: true,
  status: true,
  error: true,
  totalSize: true,
  fileCount: true,
  reverseShareId: true,
} as const;

@Injectable()
export class DepositService implements OnModuleInit {
  private readonly logger = new Logger("StundTransfer");
  private readonly chunks = new ChunkStore(STUND_STAGING_DIR);
  // Free space of the staging volume while chunks are written
  private readonly freeSpace = new FreeSpaceGuard(() => freeBytes(STUND_STAGING_DIR));
  private moveQueue: Promise<void> = Promise.resolve();
  // New deposits are checked against the free space one at a time
  private createQueue: Promise<unknown> = Promise.resolve();
  private lastActivityWrite = new Map<string, number>();
  private storageReady = false;
  private storageCheckedAt = 0;
  private storageCheck?: Promise<boolean>;

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
    private reverseShareService: ReverseShareService,
  ) {}

  async onModuleInit() {
    if (!isStundTransferEnabled()) {
      this.logger.log(
        "Deposit mode disabled (STUNDTRANSFER_TRANSFER_DIR is not set)",
      );
      return;
    }
    await this.ensureStorage();
  }

  /**
   * Whether the deposit folders are usable. While they are not (NAS share not
   * ready at startup, permissions...), they are checked again at most every
   * 30 s when someone needs them, so no container restart is needed.
   */
  private async ensureStorage(): Promise<boolean> {
    if (this.storageReady) return true;
    if (!this.storageCheck) {
      if (Date.now() - this.storageCheckedAt < STORAGE_RECHECK_MS) return false;
      this.storageCheckedAt = Date.now();
      this.storageCheck = this.startStorage().finally(() => {
        this.storageCheck = undefined;
      });
    }
    return this.storageCheck;
  }

  private async startStorage(): Promise<boolean> {
    try {
      const instantMoves = await this.checkStorage();
      this.logger.log(
        `Deposit mode enabled. Mounted folder: ${STUND_ROOT_DIR} | destination: /${this.destinationRelative()} | uploads in progress: ${STUND_STAGING_DIR}`,
      );
      if (!instantMoves)
        this.logger.warn(
          "The transfer and staging folders are not on the same Docker mount: each file will be copied at the end of a deposit (slower, needs free space). Mount their parent folder once to get instant moves.",
        );
    } catch (e) {
      this.logger.error(
        `Deposit folders are not usable (${e.message}). Check the Docker volume and the folder permissions on the NAS (checked again at the next deposit, at most every ${STORAGE_RECHECK_MS / 1000} s).`,
      );
      return false;
    }
    this.storageReady = true;

    // Moves interrupted by a restart are resumed, in their original order.
    const interrupted = await this.prisma.stundDeposit.findMany({
      where: { status: "MOVING" },
      select: { id: true },
      orderBy: { completedAt: "asc" },
    });
    interrupted.forEach(({ id }) => this.scheduleMove(id));
    return true;
  }

  /** Creates both folders, checks they are writable and whether moves between them are instant. */
  private async checkStorage(): Promise<boolean> {
    await fs.mkdir(STUND_ROOT_DIR, { recursive: true });
    await fs.mkdir(STUND_STAGING_DIR, { recursive: true });

    const suffix = crypto.randomBytes(6).toString("hex");
    const probe = path.join(STUND_STAGING_DIR, `.probe-${suffix}`);
    const linked = path.join(STUND_ROOT_DIR, `.stundtransfer-probe-${suffix}`);
    await fs.writeFile(probe, "");
    try {
      await fs.writeFile(linked, "");
      await fs.rm(linked);
      await fs.link(probe, linked);
      await fs.rm(linked);
      return true;
    } catch (e) {
      if (["EXDEV", "EPERM", "ENOTSUP", "EOPNOTSUPP", "ENOSYS"].includes(e?.code))
        return false;
      throw e;
    } finally {
      await fs.rm(probe, { force: true });
      await fs.rm(linked, { force: true });
    }
  }

  // Settings from Admin > Configuration > StundTransfer (read on each use: no restart needed)
  private publicDepositEnabled(): boolean {
    return this.config.get("stundtransfer.publicDeposit");
  }

  private parallelUploads(): number {
    return Math.min(16, Math.max(1, this.config.get("stundtransfer.parallelUploads") || 6));
  }

  private abandonAfterHours(): number {
    const { value, unit } = this.config.get("stundtransfer.abandonAfter");
    return Math.max(1, moment.duration(value, unit).asHours() || 72);
  }

  private chunkSize(requested?: number): number {
    return requested || STUND_CHUNK_BYTES || this.config.get("share.chunkSize");
  }

  private async assertReady() {
    if (!isStundTransferEnabled())
      throw stundError(HttpStatus.NOT_FOUND, "stund_disabled", "Deposit mode is disabled");
    if (!(await this.ensureStorage()))
      throw stundError(
        HttpStatus.SERVICE_UNAVAILABLE,
        "stund_storage_unavailable",
        "The deposit folder is not available on the server",
      );
  }

  private async validLink(token: string) {
    if (
      !TOKEN_REGEX.test(token ?? "") ||
      !(await this.reverseShareService.isValid(token))
    )
      throw stundError(
        HttpStatus.NOT_FOUND,
        "stund_link_invalid",
        "This deposit link is invalid, expired or already used",
      );
    return this.reverseShareService.getByToken(token);
  }

  private async authorize(depositId: string, secret?: string) {
    const deposit = isValidUUID(depositId)
      ? await this.prisma.stundDeposit.findUnique({ where: { id: depositId } })
      : null;
    if (!deposit)
      throw stundError(HttpStatus.NOT_FOUND, "stund_not_found", "Deposit not found");

    const given = Buffer.from(sha256(secret ?? ""), "hex");
    const expected = Buffer.from(deposit.secretHash, "hex");
    if (
      !secret ||
      given.length !== expected.length ||
      !crypto.timingSafeEqual(given, expected)
    )
      throw stundError(HttpStatus.FORBIDDEN, "stund_forbidden", "Invalid deposit key");
    return deposit;
  }

  private assertUploading(deposit: Pick<StundDeposit, "status">) {
    if (deposit.status !== "UPLOADING")
      throw stundError(
        HttpStatus.CONFLICT,
        "stund_not_uploading",
        "This deposit is not accepting files anymore",
        { status: deposit.status },
      );
  }

  /** Status changed by another request since it was read (e.g. finished and cancelled at the same time). */
  private async currentStatus(depositId: string) {
    const deposit = await this.prisma.stundDeposit.findUnique({
      where: { id: depositId },
      select: { status: true },
    });
    // Deleted meanwhile: same as cancelled for the uploader
    return { status: deposit?.status ?? "ABANDONED" };
  }

  private cancelledError() {
    return stundError(HttpStatus.CONFLICT, "stund_cancelled", "This deposit was cancelled", {
      status: "ABANDONED",
    });
  }

  private async touch(depositId: string) {
    const now = Date.now();
    if (now - (this.lastActivityWrite.get(depositId) ?? 0) < ACTIVITY_WRITE_INTERVAL_MS)
      return;
    this.lastActivityWrite.set(depositId, now);
    await this.prisma.stundDeposit.update({
      where: { id: depositId },
      data: { lastActivityAt: new Date() },
    });
  }

  private async fileState(
    deposit: StundDeposit,
    file: Pick<StundDepositFile, "id" | "originalPath" | "size" | "status">,
    // Files with a .part on disk (undefined: unknown)
    staged?: Set<string>,
  ) {
    const size = Number(file.size);
    const state = {
      id: file.id,
      path: file.originalPath,
      size,
      status: file.status,
      totalChunks: totalChunks(size, deposit.chunkSize),
      receivedChunks: undefined as number[] | undefined,
    };
    if (file.status === "UPLOADING" && deposit.status === "UPLOADING") {
      // No .part (e.g. deleted while the server was down): the chunks of its
      // log are lost, they are asked again at once
      const received =
        !staged || staged.has(file.id)
          ? await this.chunks.receivedChunks(deposit.id, file.id)
          : [];
      state.receivedChunks = [...received].sort((a, b) => a - b);
    }
    return state;
  }

  /** States of the files of a deposit, read from disk a few at a time. */
  private async fileStates(
    deposit: StundDeposit,
    files: Pick<StundDepositFile, "id" | "originalPath" | "size" | "status">[],
  ) {
    const staged =
      deposit.status === "UPLOADING"
        ? await this.chunks.stagedFileIds(deposit.id).catch(() => undefined)
        : undefined;
    return inSlices(files, (f) => this.fileState(deposit, f, staged));
  }

  // ---------------------------------------------------------------- uploader

  async getLinkInfo(token: string) {
    if (!isStundTransferEnabled()) return { depositMode: false };
    const reverseShare = await this.validLink(token);
    return {
      depositMode: true,
      maxSize: parseInt(reverseShare.maxShareSize),
      chunkSize: this.chunkSize(),
      parallelUploads: this.parallelUploads(),
    };
  }

  /** Public deposit on the home page (no link needed), if enabled by an admin. */
  async getPublicInfo() {
    if (!isStundTransferEnabled() || !this.publicDepositEnabled())
      return { depositMode: false };
    return {
      depositMode: true,
      maxSize: this.config.get("stundtransfer.maxDepositSize"),
      chunkSize: this.chunkSize(),
      parallelUploads: this.parallelUploads(),
    };
  }

  async createDeposit(dto: CreateDepositDTO) {
    await this.assertReady();
    // With a deposit link: its limits apply. Without: the public deposit settings.
    let reverseShare: Awaited<ReturnType<DepositService["validLink"]>> | null = null;
    let maxSize: number;
    if (dto.token) {
      reverseShare = await this.validLink(dto.token);
      maxSize = parseInt(reverseShare.maxShareSize);
    } else if (this.publicDepositEnabled()) {
      maxSize = this.config.get("stundtransfer.maxDepositSize");
    } else {
      throw stundError(
        HttpStatus.NOT_FOUND,
        "stund_public_disabled",
        "Public deposit is disabled",
      );
    }

    let folderName: string;
    try {
      folderName = depositFolderName(dto.uploaderName, dto.videoName);
    } catch {
      throw stundError(
        HttpStatus.BAD_REQUEST,
        "stund_invalid_names",
        "Please fill in who you are and which video it is for",
      );
    }

    if (dto.totalSize > maxSize)
      throw stundError(
        HttpStatus.PAYLOAD_TOO_LARGE,
        "stund_too_large",
        `The files exceed the maximum size (${formatBytes(maxSize)})`,
        { maxSize },
      );

    // Recreated if someone deleted it (e.g. while tidying the NAS by hand)
    await fs.mkdir(STUND_STAGING_DIR, { recursive: true });

    const secret = crypto.randomBytes(32).toString("base64url");
    // Checked and created one at a time: two deposits never count on the same space
    const deposit = await this.oneDepositAtATime(async () => {
      const free = await freeBytes(STUND_STAGING_DIR);
      const reserved = await this.reservedBytes();
      if (free - reserved - dto.totalSize < this.config.get("stundtransfer.minFreeSpace"))
        throw notEnoughSpace();
      return this.prisma.stundDeposit.create({
        data: {
          uploaderName: dto.uploaderName.trim(),
          videoName: dto.videoName.trim(),
          folderName,
          secretHash: sha256(secret),
          totalSize: String(dto.totalSize),
          fileCount: dto.fileCount,
          chunkSize: this.chunkSize(dto.chunkSize),
          reverseShareId: reverseShare?.id ?? null,
          reverseShareOwnerId: reverseShare?.creatorId ?? null,
        },
      });
    });
    await this.chunks.prepareDeposit(deposit.id);

    this.logger.log(
      `Deposit ${deposit.id} started: "${folderName}", ${dto.fileCount} file(s), ${formatBytes(dto.totalSize)}`,
    );

    return {
      depositId: deposit.id,
      secret,
      chunkSize: deposit.chunkSize,
      parallelUploads: this.parallelUploads(),
    };
  }

  private oneDepositAtATime<T>(task: () => Promise<T>): Promise<T> {
    const result = this.createQueue.then(task);
    this.createQueue = result.catch(() => undefined);
    return result;
  }

  /**
   * Space still needed by the deposits being uploaded: announced size minus
   * what is already on disk (files received, and the part already written of
   * the files being sent), since the free space of the volume already counts
   * it. MOVING deposits are already on disk. Inactive deposits (tab closed,
   * or big deposits announced but never sent) reserve nothing, so they cannot
   * block everyone else until the cleanup; the free space check while writing
   * still protects the volume.
   */
  private async reservedBytes(): Promise<number> {
    const activeSince = Date.now() - RESERVATION_ACTIVE_MS;
    const deposits = await this.prisma.$queryRaw<
      {
        id: string;
        totalSize: string;
        chunkSize: bigint | number;
        received: bigint | number | null;
      }[]
    >`SELECT d.id AS id, d.totalSize AS totalSize, d.chunkSize AS chunkSize, SUM(CASE WHEN f.status != 'UPLOADING' THEN CAST(f.size AS INTEGER) ELSE 0 END) AS received FROM StundDeposit d LEFT JOIN StundDepositFile f ON f.depositId = d.id WHERE d.status = 'UPLOADING' AND d.lastActivityAt >= ${activeSince} GROUP BY d.id`;
    const usage: { totalSize: number; onDisk: number }[] = [];
    for (const d of deposits)
      usage.push({
        totalSize: Number(d.totalSize),
        onDisk:
          Number(d.received ?? 0) + (await this.bytesBeingSent(d.id, Number(d.chunkSize))),
      });
    return spaceStillNeeded(usage);
  }

  /** Bytes already written for the files of a deposit still being sent. */
  private async bytesBeingSent(depositId: string, chunkSize: number) {
    try {
      // Only files with a .part have started (usually a few)
      const staged = await this.chunks.stagedFileIds(depositId);
      if (staged.size === 0) return 0;
      const files = await this.prisma.stundDepositFile.findMany({
        where: { depositId, status: "UPLOADING" },
        select: { id: true, size: true },
      });
      const written = await inSlices(
        files.filter((f) => staged.has(f.id)),
        (f) => this.chunks.writtenBytes(depositId, f.id, Number(f.size), chunkSize),
      );
      return written.reduce((sum, bytes) => sum + bytes, 0);
    } catch (e) {
      // Counted as not started: a little more space is kept
      this.logger.warn(
        `Deposit ${depositId}: cannot measure what was already written (${e?.message ?? e})`,
      );
      return 0;
    }
  }

  /** Largest chunk size given to deposits still being sent (read once at startup by main.ts). */
  async largestChunkSizeInUse(): Promise<number> {
    const { _max } = await this.prisma.stundDeposit.aggregate({
      where: { status: "UPLOADING" },
      _max: { chunkSize: true },
    });
    return _max.chunkSize ?? 0;
  }

  async addFiles(depositId: string, secret: string, dto: AddDepositFilesDTO) {
    await this.assertReady();
    const deposit = await this.authorize(depositId, secret);
    this.assertUploading(deposit);

    const paths = dto.files.map((f) => f.path);
    if (new Set(paths).size !== paths.length)
      throw stundError(
        HttpStatus.BAD_REQUEST,
        "stund_duplicate_path",
        "The same file was sent twice",
      );

    // Batches can be re-sent after a network error: known files are kept.
    const known = new Map(
      (
        await this.prisma.stundDepositFile.findMany({
          where: { depositId, originalPath: { in: paths } },
          select: { originalPath: true, size: true },
        })
      ).map((f) => [f.originalPath, f.size]),
    );
    for (const file of dto.files) {
      if (known.has(file.path) && known.get(file.path) !== String(file.size))
        throw stundError(
          HttpStatus.CONFLICT,
          "stund_duplicate_path",
          `"${file.path}" was already registered with another size`,
        );
    }
    const newFiles = dto.files.filter((f) => !known.has(f.path));

    const [totals] = await this.prisma.$queryRaw<
      { count: bigint | number; size: bigint | number | null }[]
    >`SELECT COUNT(*) AS count, SUM(CAST(size AS INTEGER)) AS size FROM StundDepositFile WHERE depositId = ${depositId}`;
    const registeredCount = Number(totals?.count ?? 0);
    const registeredSize = Number(totals?.size ?? 0);

    if (registeredCount + newFiles.length > deposit.fileCount)
      throw stundError(
        HttpStatus.BAD_REQUEST,
        "stund_too_many_files",
        "More files than announced",
      );
    const newSize = newFiles.reduce((sum, f) => sum + f.size, 0);
    if (registeredSize + newSize > Number(deposit.totalSize))
      throw stundError(
        HttpStatus.PAYLOAD_TOO_LARGE,
        "stund_too_large",
        "More data than announced",
      );

    if (newFiles.length > 0) {
      await this.prisma.stundDepositFile.createMany({
        data: newFiles.map((f) => {
          // Before 1970 (broken camera clock): 1970
          const lastModified =
            f.lastModified !== undefined ? new Date(Math.max(0, f.lastModified)) : null;
          return {
            depositId,
            originalPath: f.path,
            targetName: f.name?.trim() || null,
            size: String(f.size),
            lastModified:
              lastModified && !isNaN(lastModified.getTime()) ? lastModified : null,
          };
        }),
      });
    }
    await this.touch(depositId);

    const files = await this.prisma.stundDepositFile.findMany({
      where: { depositId, originalPath: { in: paths } },
      select: { id: true, originalPath: true, size: true, status: true },
    });
    return { files: await this.fileStates(deposit, files) };
  }

  /** State of a deposit, used by the uploader's browser to resume. */
  async getDeposit(depositId: string, secret: string) {
    const deposit = await this.authorize(depositId, secret);
    const files = await this.prisma.stundDepositFile.findMany({
      where: { depositId },
      select: { id: true, originalPath: true, size: true, status: true },
      orderBy: { createdAt: "asc" },
    });
    return {
      depositId: deposit.id,
      // The uploader only needs to know whether the upload is over, and how
      status:
        deposit.status === "UPLOADING"
          ? "UPLOADING"
          : deposit.status === "ABANDONED"
            ? "CANCELLED"
            : "RECEIVED",
      uploaderName: deposit.uploaderName,
      videoName: deposit.videoName,
      fileCount: deposit.fileCount,
      totalSize: Number(deposit.totalSize),
      chunkSize: deposit.chunkSize,
      parallelUploads: this.parallelUploads(),
      files: await this.fileStates(deposit, files),
    };
  }

  async writeChunk(
    depositId: string,
    fileId: string,
    index: number,
    secret: string,
    // A buffer, or the request stream (written to disk as it arrives)
    data: Buffer | AsyncIterable<Buffer>,
    declaredLength?: number,
  ) {
    await this.assertReady();
    const deposit = await this.authorize(depositId, secret);
    this.assertUploading(deposit);

    const file = isValidUUID(fileId)
      ? await this.prisma.stundDepositFile.findFirst({
          where: { id: fileId, depositId },
        })
      : null;
    if (!file)
      throw stundError(HttpStatus.NOT_FOUND, "stund_not_found", "File not found");

    const size = Number(file.size);
    const total = totalChunks(size, deposit.chunkSize);
    const expectedLength = expectedChunkLength(size, deposit.chunkSize, index);
    if (
      !Number.isInteger(index) ||
      index < 0 ||
      index >= total ||
      (Buffer.isBuffer(data) ? data.length : declaredLength) !== expectedLength
    )
      throw stundError(HttpStatus.BAD_REQUEST, "stund_bad_chunk", "Invalid chunk", {
        expectedLength,
      });

    if (file.status !== "UPLOADING") return { fileComplete: true };

    // The volume (which may also hold the database) never fills up, even if
    // something else uses the space promised to deposits. Half of the margin
    // is kept here: the full margin is checked when a deposit starts, and
    // refusing the last chunks of a deposit that fitted would be worse.
    if (
      !(await this.freeSpace.take(
        expectedLength,
        this.config.get("stundtransfer.minFreeSpace") / 2,
      ))
    )
      throw notEnoughSpace("The server is out of space");

    let received: Set<number>;
    try {
      received = await this.chunks.writeChunk(
        depositId,
        fileId,
        index,
        index * deposit.chunkSize,
        data,
        total,
        expectedLength,
      );
    } catch (e) {
      // Wrong length or connection cut during the chunk: it will be sent again
      if (
        e instanceof ChunkLengthError ||
        e?.code === "ECONNRESET" ||
        e?.code === "ERR_STREAM_PREMATURE_CLOSE" ||
        e?.message === "aborted"
      )
        throw stundError(HttpStatus.BAD_REQUEST, "stund_bad_chunk", "Incomplete chunk", {
          expectedLength,
        });
      if (OUT_OF_SPACE_CODES.has(e?.code)) throw notEnoughSpace("The server is out of space");
      if (e instanceof DepositRemovedError) {
        // Cancelled (or stored) while this chunk was received
        const { status } = await this.currentStatus(depositId);
        if (status === "ABANDONED") throw this.cancelledError();
        this.assertUploading({ status });
      }
      this.logger.error(`Deposit ${depositId}: cannot write chunk: ${e.message}`);
      throw stundError(
        HttpStatus.INTERNAL_SERVER_ERROR,
        "stund_storage_error",
        "The server could not save this part of the file",
      );
    }

    const fileComplete = received.size >= total;
    if (fileComplete)
      await this.prisma.stundDepositFile.updateMany({
        where: { id: fileId, status: "UPLOADING" },
        data: { status: "UPLOADED" },
      });
    await this.touch(depositId);
    return { fileComplete };
  }

  async complete(depositId: string, secret: string) {
    const deposit = await this.authorize(depositId, secret);
    if (deposit.status === "ABANDONED") throw this.cancelledError();
    // Retried request: the uploader only needs to know it is received.
    if (["MOVING", "DONE", "ERROR"].includes(deposit.status))
      return { status: "RECEIVED" };
    await this.assertReady();
    this.assertUploading(deposit);

    const files = await this.prisma.stundDepositFile.findMany({
      where: { depositId },
      select: { id: true, status: true, size: true },
    });
    await this.checkStagedFiles(deposit, files);
    const missingFiles = files
      .filter((f) => f.status !== "UPLOADED")
      .map((f) => f.id);
    if (files.length !== deposit.fileCount || missingFiles.length > 0) {
      // Files deleted by a cancel made meanwhile
      if ((await this.currentStatus(depositId)).status === "ABANDONED")
        throw this.cancelledError();
      throw stundError(
        HttpStatus.CONFLICT,
        "stund_incomplete",
        "Some files are not completely uploaded yet",
        { missingFiles, registered: files.length, expected: deposit.fileCount },
      );
    }

    const { count } = await this.prisma.stundDeposit.updateMany({
      where: { id: depositId, status: "UPLOADING" },
      data: { status: "MOVING", completedAt: new Date() },
    });
    if (count === 0) {
      // Cancelled meanwhile (uploader, admin, cleanup), or finished by a retried request
      if ((await this.currentStatus(depositId)).status === "ABANDONED")
        throw this.cancelledError();
      return { status: "RECEIVED" };
    }
    if (deposit.reverseShareId)
      await this.prisma.reverseShare.updateMany({
        where: { id: deposit.reverseShareId, remainingUses: { gt: 0 } },
        data: { remainingUses: { decrement: 1 } },
      });
    this.logger.log(
      `Deposit ${depositId} fully received (${files.length} file(s), ${formatBytes(Number(deposit.totalSize))})`,
    );
    this.scheduleMove(depositId);
    return { status: "RECEIVED" };
  }

  /**
   * Before finishing: a file whose chunks are all logged counts as uploaded
   * (crash between its last chunk and the database update), and a file whose
   * data disappeared from the staging folder (deleted by hand) must be sent
   * again instead of being stored with missing parts.
   */
  private async checkStagedFiles(
    deposit: StundDeposit,
    files: Pick<StundDepositFile, "id" | "status" | "size">[],
  ) {
    let lost = 0;
    const check = async (file: (typeof files)[number]) => {
      if (file.status !== "UPLOADING" && file.status !== "UPLOADED") return;
      const size = Number(file.size);
      if (file.status === "UPLOADING") {
        await this.chunks.flush(deposit.id, file.id).catch(() => undefined);
        const received = await this.chunks.receivedChunks(deposit.id, file.id);
        if (received.size < totalChunks(size, deposit.chunkSize)) return;
      }
      if (await this.chunks.isStaged(deposit.id, file.id, size)) {
        if (file.status === "UPLOADING") {
          await this.prisma.stundDepositFile.updateMany({
            where: { id: file.id, status: "UPLOADING" },
            data: { status: "UPLOADED" },
          });
          file.status = "UPLOADED";
        }
        return;
      }
      lost++;
      await this.chunks.resetFile(deposit.id, file.id);
      await this.prisma.stundDepositFile.updateMany({
        where: { id: file.id, status: { in: ["UPLOADING", "UPLOADED"] } },
        data: { status: "UPLOADING" },
      });
      file.status = "UPLOADING";
    };
    await inSlices(files, check);
    if (lost > 0)
      this.logger.warn(
        `Deposit ${deposit.id}: ${lost} file(s) missing from the staging folder (deleted by hand?), they will be sent again`,
      );
  }

  /** The uploader cancels: files already sent are deleted from the staging folder. */
  async cancelByUploader(depositId: string, secret: string) {
    const deposit = await this.authorize(depositId, secret);
    this.assertUploading(deposit);
    // Only if still uploading: a deposit received meanwhile is kept
    const { count } = await this.prisma.stundDeposit.updateMany({
      where: { id: depositId, status: "UPLOADING" },
      data: { status: "ABANDONED", error: "Cancelled by the uploader" },
    });
    if (count === 0) this.assertUploading(await this.currentStatus(depositId));
    await this.chunks.removeDeposit(depositId);
    this.lastActivityWrite.delete(depositId);
    this.logger.log(`Deposit ${depositId} cancelled by the uploader`);
  }

  // ------------------------------------------------------------- final move

  /** Moves run one at a time, so two deposits never race for the same names. */
  private scheduleMove(depositId: string) {
    this.moveQueue = this.moveQueue
      .then(() => this.moveDeposit(depositId))
      .catch(async (e) => {
        this.logger.error(`Deposit ${depositId}: move failed: ${e?.stack ?? e}`);
        await this.prisma.stundDeposit
          .update({
            where: { id: depositId },
            data: { status: "ERROR", error: String(e?.message ?? e).slice(0, 2000) },
          })
          .catch(() => undefined);
      });
  }

  /**
   * One new folder per deposit: "Litsu - Beamng", then "Litsu - Beamng (2)"...
   * (names compared without case, like Windows and SMB do). With the
   * "groupDeposits" setting, the existing folder is reused instead.
   */
  private async chooseFolder(folderName: string): Promise<string> {
    const destination = this.destinationRelative();
    const parent = this.folderPath(destination);
    await fs.mkdir(parent, { recursive: true });
    await assertRealPathInside(STUND_ROOT_DIR, parent);
    const relative = (name: string) => [destination, name].filter(Boolean).join("/");

    if (this.config.get("stundtransfer.groupDeposits"))
      return relative(
        // Shortened like the other folder names (long emoji names exceed 255 bytes)
        await findExistingFolderName(parent, folderCandidates(folderName).next().value as string),
      );

    const taken = await existingFolderNamesLowercase(parent);
    for (const candidate of folderCandidates(folderName)) {
      if (taken.has(candidate.normalize("NFC").toLowerCase())) continue;
      try {
        // Not recursive: fails if the folder appeared meanwhile
        await fs.mkdir(resolveInside(parent, candidate));
        return relative(candidate);
      } catch (e) {
        if (e?.code !== "EEXIST") throw e;
      }
    }
    throw new Error(`No free folder name for "${folderName}"`);
  }

  // ------------------------------------------------- destination (admin)

  /** "A/B" -> ["A", "B"]; refuses "..", hidden and Synology system folders. */
  private folderParts(relative?: string): string[] {
    const parts = (relative ?? "")
      .split(/[\\/]+/)
      .filter((part) => part !== "" && part !== ".");
    if (parts.some((part) => part === ".." || /^[.@#]/.test(part)))
      throw stundError(HttpStatus.BAD_REQUEST, "stund_bad_folder", "Invalid folder");
    return parts;
  }

  /** Absolute path of a folder given relative to the mounted folder ("" = the mounted folder). */
  private folderPath(relative: string) {
    const parts = this.folderParts(relative);
    return parts.length ? resolveInside(STUND_ROOT_DIR, ...parts) : STUND_ROOT_DIR;
  }

  /** Destination chosen with the folder picker, relative to the mounted folder. */
  private destinationRelative(): string {
    try {
      return this.folderParts(this.config.get(STUND_DESTINATION_KEY) ?? "").join("/");
    } catch {
      this.logger.error("Invalid destination setting, using the mounted folder");
      return "";
    }
  }

  getDestination() {
    return {
      enabled: isStundTransferEnabled(),
      rootName: STUND_ROOT_NAME,
      destination: this.destinationRelative(),
    };
  }

  async listFolders(relative?: string) {
    await this.assertReady();
    const parts = this.folderParts(relative);
    const dir = this.folderPath(parts.join("/"));
    let entries: import("fs").Dirent[];
    try {
      await assertRealPathInside(STUND_ROOT_DIR, dir);
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      throw stundError(HttpStatus.NOT_FOUND, "stund_folder_not_found", "Folder not found");
    }
    return {
      path: parts.join("/"),
      folders: entries
        .filter((e) => e.isDirectory() && !/^[.@#]/.test(e.name))
        .map((e) => e.name)
        .sort((a, b) => a.localeCompare(b, "fr", { numeric: true })),
    };
  }

  async createFolder(relative: string | undefined, name: string) {
    await this.assertReady();
    const parts = this.folderParts(relative);
    const clean = sanitizeSegment(name);
    if (!clean || /^[.@#]/.test(clean))
      throw stundError(HttpStatus.BAD_REQUEST, "stund_bad_folder", "Invalid folder name");
    const parent = this.folderPath(parts.join("/"));
    await assertRealPathInside(STUND_ROOT_DIR, parent);
    await fs.mkdir(resolveInside(parent, clean), { recursive: true });
    return { path: [...parts, clean].join("/") };
  }

  async setDestination(relative: string | undefined, user: User) {
    await this.assertReady();
    const parts = this.folderParts(relative);
    const dir = this.folderPath(parts.join("/"));
    try {
      await assertRealPathInside(STUND_ROOT_DIR, dir);
      if (!(await fs.stat(dir)).isDirectory()) throw new Error("not a folder");
    } catch {
      throw stundError(HttpStatus.NOT_FOUND, "stund_folder_not_found", "Folder not found");
    }
    await this.config.update(STUND_DESTINATION_KEY, parts.join("/"));
    this.logger.log(`Destination set to "/${parts.join("/")}" by ${user.username}`);
    return this.getDestination();
  }

  private async moveDeposit(depositId: string) {
    const deposit = await this.prisma.stundDeposit.findUnique({
      where: { id: depositId },
      include: { files: { orderBy: { createdAt: "asc" } } },
    });
    if (!deposit || deposit.status !== "MOVING") return;

    // The folder is chosen once, then reused if the move is retried or resumed
    let folder = deposit.finalFolder;
    if (!folder) {
      folder = await this.chooseFolder(deposit.folderName);
      await this.prisma.stundDeposit.update({
        where: { id: depositId },
        data: { finalFolder: folder },
      });
    }

    const depositDir = resolveInside(STUND_ROOT_DIR, ...folder.split("/"));
    const relative = (file: string) =>
      path.relative(STUND_ROOT_DIR, file).split(path.sep).join("/");
    // Final paths already taken by files of this deposit
    const used = new Set(
      deposit.files.filter((f) => f.status === "DONE" && f.finalPath).map((f) => f.finalPath),
    );
    // Sub-folders, created once ("Card A/CLIP" -> absolute path)
    const folders = new Map<string, string>();
    const failures: string[] = [];
    let copies = 0;
    for (const file of deposit.files) {
      const src = this.chunks.dataPath(depositId, file.id);
      // Already moved, unless a power cut undid it (the staged file is back)
      if (file.status === "DONE" && !(await exists(src))) continue;
      try {
        const segments = sanitizeRelativePath(file.originalPath);
        const originalName = segments.pop();
        // Renamed by the uploader: same folders, new name
        const fileName = (file.targetName && sanitizeSegment(file.targetName)) || originalName;
        const key = segments.join("/");
        if (!folders.has(key))
          folders.set(key, await ensureFolder(STUND_ROOT_DIR, depositDir, segments));
        const destDir = folders.get(key);
        if (file.finalPath) used.delete(file.finalPath);

        let finalPath: string;
        try {
          let method: "link" | "copy";
          ({ finalPath, method } = await moveIntoFolder({
            root: STUND_ROOT_DIR,
            src,
            destDir,
            fileName,
            expectedSize: Number(file.size),
            mtime: file.lastModified ?? undefined,
          }));
          if (method === "copy") copies++;
        } catch (e) {
          // Restart in the middle of this file's move: it may already be in its folder
          if (e?.code !== "ENOENT" || (await exists(src))) throw e;
          finalPath = await findMovedFile({
            destDir,
            fileName,
            expectedSize: Number(file.size),
            notBefore: deposit.completedAt
              ? new Date(deposit.completedAt.getTime() - MOVED_FILE_CLOCK_SLACK_MS)
              : undefined,
            isUsed: (candidate) => used.has(relative(candidate)),
          });
          if (!finalPath) throw e;
          if (file.lastModified)
            await fs.utimes(finalPath, new Date(), file.lastModified).catch(() => undefined);
        }
        used.add(relative(finalPath));
        await this.prisma.stundDepositFile.update({
          where: { id: file.id },
          data: { status: "DONE", error: null, finalPath: relative(finalPath) },
        });
      } catch (e) {
        const message = String(e?.message ?? e).slice(0, 1000);
        failures.push(`${file.originalPath}: ${message}`);
        this.logger.error(
          `Deposit ${depositId}: could not move "${file.originalPath}": ${message}`,
        );
        await this.prisma.stundDepositFile.update({
          where: { id: file.id },
          data: { status: "ERROR", error: message },
        });
      }
    }

    // Moved files survive a power cut before the deposit is marked as stored
    // (the folder holding the deposit folder, then every folder used)
    const synced = new Set([path.dirname(depositDir)]);
    for (let dir of folders.values())
      while (!synced.has(dir)) {
        synced.add(dir);
        dir = path.dirname(dir);
      }
    await Promise.all([...synced].map((dir) => syncDir(dir)));

    if (failures.length === 0) {
      await this.prisma.stundDeposit.update({
        where: { id: depositId },
        data: { status: "DONE", error: null },
      });
      await this.chunks.removeDeposit(depositId);
      this.lastActivityWrite.delete(depositId);
      this.logger.log(
        `Deposit ${depositId} stored in "${folder}" (${deposit.files.length} file(s)${copies ? `, ${copies} copied` : ""})`,
      );
    } else {
      await this.prisma.stundDeposit.update({
        where: { id: depositId },
        data: {
          status: "ERROR",
          error: `${failures.length} file(s) not moved. First error: ${failures[0]}`.slice(
            0,
            2000,
          ),
        },
      });
    }
  }

  // ------------------------------------------------------------------ admin

  private async getForAdmin(depositId: string, user: User) {
    const deposit = isValidUUID(depositId)
      ? await this.prisma.stundDeposit.findUnique({ where: { id: depositId } })
      : null;
    if (
      !deposit ||
      (!user.isAdmin && deposit.reverseShareOwnerId !== user.id)
    )
      throw stundError(HttpStatus.NOT_FOUND, "stund_not_found", "Deposit not found");
    return deposit;
  }

  async listForAdmin(user: User) {
    const deposits = await this.prisma.stundDeposit.findMany({
      where: user.isAdmin ? {} : { reverseShareOwnerId: user.id },
      orderBy: { createdAt: "desc" },
      take: 500,
      select: ADMIN_DEPOSIT_FIELDS,
    });
    return deposits.map((d) => ({ ...d, totalSize: Number(d.totalSize) }));
  }

  async getForAdminWithFiles(depositId: string, user: User) {
    await this.getForAdmin(depositId, user);
    const deposit = await this.prisma.stundDeposit.findUnique({
      where: { id: depositId },
      select: {
        ...ADMIN_DEPOSIT_FIELDS,
        files: {
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            originalPath: true,
            size: true,
            status: true,
            finalPath: true,
            error: true,
          },
        },
      },
    });
    return {
      ...deposit,
      totalSize: Number(deposit.totalSize),
      files: deposit.files.map((f) => ({ ...f, size: Number(f.size) })),
    };
  }

  async retry(depositId: string, user: User) {
    await this.assertReady();
    const deposit = await this.getForAdmin(depositId, user);
    if (deposit.status !== "ERROR")
      throw stundError(
        HttpStatus.CONFLICT,
        "stund_not_retryable",
        "Only deposits in error can be retried",
      );
    await this.prisma.stundDeposit.update({
      where: { id: depositId },
      data: { status: "MOVING", error: null },
    });
    this.scheduleMove(depositId);
  }

  /**
   * Unfinished or failed deposit: deletes its files waiting in the staging
   * folder. Finished deposit: removes it from the history. Files already in
   * the transfer folder are never touched.
   */
  async remove(depositId: string, user: User) {
    const deposit = await this.getForAdmin(depositId, user);
    if (deposit.status === "MOVING")
      throw stundError(
        HttpStatus.CONFLICT,
        "stund_busy",
        "This deposit is being moved, try again in a moment",
      );
    if (["UPLOADING", "ERROR"].includes(deposit.status)) {
      // Only if unchanged: a deposit received or retried meanwhile is kept
      const { count } = await this.prisma.stundDeposit.updateMany({
        where: { id: depositId, status: { in: ["UPLOADING", "ERROR"] } },
        data: { status: "ABANDONED", error: "Cancelled by the administrator" },
      });
      if (count === 0)
        throw stundError(
          HttpStatus.CONFLICT,
          "stund_busy",
          "This deposit is being moved, try again in a moment",
        );
      await this.chunks.removeDeposit(depositId);
      this.lastActivityWrite.delete(depositId);
    } else {
      await this.chunks.removeDeposit(depositId);
      await this.prisma.stundDeposit.delete({ where: { id: depositId } });
    }
  }

  // ---------------------------------------------------------------- cleanup

  @Cron("*/30 * * * *")
  async cleanupAbandonedDeposits() {
    if (!isStundTransferEnabled() || !(await this.ensureStorage())) return;
    const abandonAfterHours = this.abandonAfterHours();
    const cutoff = new Date(Date.now() - abandonAfterHours * 3600 * 1000);

    const stale = await this.prisma.stundDeposit.findMany({
      where: { status: "UPLOADING", lastActivityAt: { lt: cutoff } },
      select: { id: true },
    });
    let abandoned = 0;
    for (const { id } of stale) {
      // Only if still inactive: a deposit finished or resumed meanwhile is kept
      const { count } = await this.prisma.stundDeposit.updateMany({
        where: { id, status: "UPLOADING", lastActivityAt: { lt: cutoff } },
        data: {
          status: "ABANDONED",
          error: `No activity for ${Math.round(abandonAfterHours)} hours`,
        },
      });
      if (count === 0) continue;
      await this.chunks.removeDeposit(id);
      this.lastActivityWrite.delete(id);
      abandoned++;
    }

    // Leftover folders without an active deposit (e.g. manual database restore)
    let orphans = 0;
    const entries = await fs
      .readdir(STUND_STAGING_DIR, { withFileTypes: true })
      .catch(() => [] as import("fs").Dirent[]);
    for (const entry of entries) {
      if (!entry.isDirectory() || !isValidUUID(entry.name)) continue;
      const deposit = await this.prisma.stundDeposit.findUnique({
        where: { id: entry.name },
        select: { status: true },
      });
      if (deposit && ["UPLOADING", "MOVING", "ERROR"].includes(deposit.status))
        continue;
      const { mtime } = await fs.stat(path.join(STUND_STAGING_DIR, entry.name));
      if (mtime < cutoff) {
        await this.chunks.removeDeposit(entry.name);
        orphans++;
      }
    }

    // Cancelled and abandoned deposits leave the history after a while, with
    // their list of files (keeps the database small)
    const { count: purged } = await this.prisma.stundDeposit.deleteMany({
      where: {
        status: "ABANDONED",
        lastActivityAt: { lt: new Date(Date.now() - PURGE_ABANDONED_AFTER_MS) },
      },
    });

    if (abandoned + orphans + purged > 0)
      this.logger.log(
        `Cleaned ${abandoned} abandoned deposit(s) and ${orphans} leftover folder(s), removed ${purged} old cancelled deposit(s) from the history`,
      );
  }
}
