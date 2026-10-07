// StundTransfer: free space checks while deposits are written.
// Pure module (no Nest/Prisma) so it can be unit-tested.
import * as fs from "fs/promises";

/** Free space for this process on the volume holding `dir`, in bytes. */
export async function freeBytes(dir: string) {
  const { bavail, bsize } = await fs.statfs(dir);
  return bavail * bsize;
}

/**
 * Bytes a file takes on its volume, never more than its length (a file
 * written in any order can have holes). Undefined when the platform does not
 * give a block count.
 */
export function allocatedBytes(stats: { size: number; blocks?: number }) {
  if (typeof stats.blocks !== "number" || !Number.isFinite(stats.blocks)) return undefined;
  return Math.min(stats.size, stats.blocks * 512);
}

/**
 * Space still needed by the deposits being sent: what each one announced
 * minus what it already has on disk (the free space of the volume already
 * counts that part).
 */
export function spaceStillNeeded(deposits: { totalSize: number; onDisk: number }[]) {
  return deposits.reduce((sum, d) => sum + Math.max(0, d.totalSize - d.onDisk), 0);
}

/**
 * Free space measured at most every `maxAgeMs` (chunks are many), minus what
 * was written since. Refuses to write below a floor, so the volume (which may
 * also hold the database) never fills up.
 */
export class FreeSpaceGuard {
  private measuredAt = -Infinity;
  private bytes = Infinity;

  constructor(
    private readonly measure: () => Promise<number>,
    private readonly maxAgeMs = 5000,
    private readonly now = () => Date.now(),
  ) {}

  /** Counts `length` bytes as written if at least `floor` bytes stay free. */
  async take(length: number, floor: number): Promise<boolean> {
    if (this.now() - this.measuredAt >= this.maxAgeMs) {
      try {
        this.bytes = await this.measure();
        this.measuredAt = this.now();
      } catch {
        // Unknown (e.g. staging folder deleted): writing will tell
      }
    }
    if (this.bytes - length < floor) return false;
    this.bytes -= length;
    return true;
  }
}
