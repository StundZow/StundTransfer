// StundTransfer: reliable "move without overwrite" used to put received files
// in their final folder. Pure module (no Nest/Prisma) so it can be unit-tested.
import { constants as fsConstants } from "fs";
import * as fsp from "fs/promises";
import * as path from "path";
import {
  assertRealPathInside,
  candidateNames,
  folderCandidates,
  resolveInside,
} from "./paths";

export type MoveFs = Pick<
  typeof fsp,
  "link" | "unlink" | "copyFile" | "stat" | "mkdir" | "utimes" | "rm" | "open"
>;

export class DestinationExistsError extends Error {}

// Errors meaning "hard links are not possible here" -> fall back to copying.
const LINK_UNSUPPORTED = new Set([
  "EXDEV",
  "EPERM",
  "ENOTSUP",
  "EOPNOTSUPP",
  "ENOSYS",
  "EMLINK",
]);

/**
 * Moves `src` to `dest`, never overwriting an existing `dest`.
 *
 * 1. Hard link + delete source: instant, atomic, fails if `dest` exists.
 * 2. If linking is impossible (e.g. EXDEV: different Docker mounts):
 *    exclusive copy -> flush to disk -> size check -> delete source.
 *
 * On failure the source file is always kept.
 */
export async function moveNoOverwrite(
  src: string,
  dest: string,
  expectedSize: number,
  fs: MoveFs = fsp,
): Promise<"link" | "copy"> {
  let linked = false;
  try {
    await fs.link(src, dest);
    linked = true;
  } catch (e) {
    if (e?.code === "EEXIST") {
      // Already linked by a move interrupted by a restart: finish it (no "name (2)")
      if (!(await sameFile(src, dest, fs))) throw new DestinationExistsError(dest);
      linked = true;
    } else if (!LINK_UNSUPPORTED.has(e?.code)) throw e;
  }

  if (linked) {
    try {
      await assertSize(dest, expectedSize, fs);
      await fs.unlink(src);
    } catch (e) {
      // Back to the initial state: only the source exists.
      await fs.unlink(dest).catch(() => undefined);
      throw e;
    }
    return "link";
  }

  try {
    await fs.copyFile(
      src,
      dest,
      fsConstants.COPYFILE_EXCL | fsConstants.COPYFILE_FICLONE,
    );
  } catch (e) {
    if (e?.code === "EEXIST") throw new DestinationExistsError(dest);
    // The exclusive copy created `dest`: remove the partial copy.
    await fs.rm(dest, { force: true });
    throw e;
  }

  try {
    const handle = await fs.open(dest, "r+");
    try {
      await handle.sync();
    } finally {
      await handle.close();
    }
    await assertSize(dest, expectedSize, fs);
  } catch (e) {
    await fs.rm(dest, { force: true });
    throw e;
  }

  try {
    await fs.unlink(src);
  } catch (e) {
    // Never keep the file twice: back to the initial state.
    await fs.rm(dest, { force: true });
    throw e;
  }
  return "copy";
}

async function assertSize(file: string, expectedSize: number, fs: MoveFs) {
  const { size } = await fs.stat(file);
  if (size !== expectedSize)
    throw new Error(
      `Size mismatch for ${path.basename(file)}: expected ${expectedSize} bytes, got ${size}`,
    );
}

/** Whether `a` and `b` are hard links to the same file. */
async function sameFile(a: string, b: string, fs: MoveFs) {
  try {
    const [first, second] = await Promise.all([
      fs.stat(a, { bigint: true }),
      fs.stat(b, { bigint: true }),
    ]);
    return first.ino > 0 && first.ino === second.ino && first.dev === second.dev;
  } catch {
    return false;
  }
}

/**
 * Creates `segments` inside `baseDir` and returns the folder. A name already
 * taken by a file (e.g. a file "Rushes" and a folder "Rushes/" in the same
 * deposit) becomes "Rushes (2)", "Rushes (3)"... The same folder is found
 * again for the next files and when a move is resumed.
 */
export async function ensureFolder(
  root: string,
  baseDir: string,
  segments: string[],
  fs: MoveFs = fsp,
): Promise<string> {
  let dir = resolveInside(root, path.relative(root, baseDir));
  await fs.mkdir(dir, { recursive: true });
  await assertRealPathInside(root, dir);
  for (const segment of segments) {
    let next: string | undefined;
    for (const candidate of folderCandidates(segment)) {
      const child = resolveInside(dir, candidate);
      try {
        await fs.mkdir(child);
      } catch (e) {
        if (e?.code !== "EEXIST") throw e;
        if (!(await fs.stat(child)).isDirectory()) continue;
      }
      next = child;
      break;
    }
    if (!next) throw new Error(`No free folder name for ${segment}`);
    // Checked before creating anything inside it (symlinks)
    await assertRealPathInside(root, next);
    dir = next;
  }
  return dir;
}

/**
 * After a restart in the middle of a move, the staged file may already be in
 * its folder. Moves take the first free name, so the file is the last
 * existing "name", "name (2)"... with the expected size, changed after
 * `notBefore` and not already used by another file of the deposit.
 */
export async function findMovedFile(options: {
  destDir: string;
  fileName: string;
  expectedSize: number;
  notBefore?: Date;
  isUsed: (finalPath: string) => boolean;
  fs?: MoveFs;
}): Promise<string | undefined> {
  const fs = options.fs ?? fsp;
  let found: string | undefined;
  for (const candidate of candidateNames(options.fileName)) {
    const file = path.join(options.destDir, candidate);
    const stat = await fs.stat(file).catch(() => undefined);
    if (!stat) break;
    if (
      stat.isFile() &&
      stat.size === options.expectedSize &&
      (!options.notBefore || stat.ctimeMs >= options.notBefore.getTime()) &&
      !options.isUsed(file)
    )
      found = file;
  }
  return found;
}

/**
 * Flushes a folder's entries to disk, so files moved into it survive a power
 * cut. Best effort: some platforms refuse to open or sync a folder.
 */
export async function syncDir(dir: string, fs: MoveFs = fsp) {
  try {
    const handle = await fs.open(dir, "r");
    try {
      await handle.sync();
    } finally {
      await handle.close();
    }
  } catch {
    // EISDIR, EPERM (Windows), EINVAL...: nothing more can be done
  }
}

/**
 * Moves `src` into `root/relativeDir/fileName`. If the name is taken, uses
 * "name (2).ext", "name (3).ext", ... Returns the final absolute path.
 */
export async function moveIntoFolder(options: {
  root: string;
  src: string;
  destDir: string;
  fileName: string;
  expectedSize: number;
  mtime?: Date;
  fs?: MoveFs;
}): Promise<{ finalPath: string; method: "link" | "copy" }> {
  const fs = options.fs ?? fsp;
  // Checked before creating anything, then again on the real path (symlinks).
  resolveInside(options.root, path.relative(options.root, options.destDir));
  await fs.mkdir(options.destDir, { recursive: true });
  await assertRealPathInside(options.root, options.destDir);

  for (const candidate of candidateNames(options.fileName)) {
    const dest = path.join(options.destDir, candidate);
    try {
      const method = await moveNoOverwrite(
        options.src,
        dest,
        options.expectedSize,
        fs,
      );
      if (options.mtime) {
        // Keep the original "date modified" (handy in Premiere). Not critical.
        await fs.utimes(dest, new Date(), options.mtime).catch(() => undefined);
      }
      return { finalPath: dest, method };
    } catch (e) {
      if (e instanceof DestinationExistsError) continue;
      throw e;
    }
  }
  throw new Error(`No free file name for ${options.fileName}`);
}
