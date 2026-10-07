// StundTransfer: helpers for the deposit page (file selection, resume memory, formatting).
import { getNormalizedFileName } from "../utils/file.util";

export type SelectedFile = {
  file: File;
  // Path as dropped ("Card A/A001.MP4"): identifies the file, also to resume
  path: string;
  // Set when another file already had this path: "path" is then "A001 (2).MP4"
  droppedPath?: string;
  size: number;
  lastModified: number;
  // New name chosen with the pencil (folders stay the same)
  name?: string;
  // The uploader restored the original name: no automatic name
  keepOriginal?: boolean;
};

export const baseName = (path: string) => path.split("/").pop() ?? path;

const splitExtension = (name: string): [string, string] => {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? [name.slice(0, dot), name.slice(dot)] : [name, ""];
};

/**
 * Names without a real title: dates and times ("2026-07-22",
 * "2026-07-22 14-32-10" from OBS, "20260722_143210") and camera or phone
 * numbering ("VID_20260722_143210", "IMG_1234", "DSC01234", "GX010123",
 * "C0001", "PXL_..."). Anything with a real word ("Plan 2", "Interview")
 * is kept.
 */
export function isGenericName(fileName: string) {
  const [base] = splitExtension(fileName);
  return /^(?:[A-Z]{1,4}[_-]?)?\d[\d\s._\-:()]*$/.test(base.trim());
}

/**
 * Automatic names for files without a real title: "Stund - Beamng 1.mkv",
 * "Stund - Beamng 2.mkv"... in chronological (name) order, or
 * "Stund - Beamng.mkv" when there is only one. Empty until both fields
 * are filled. A file numbered because of a same name ("C0001 (2).MP4")
 * comes right after the first one.
 */
export function automaticNames(
  files: SelectedFile[],
  uploaderName: string,
  videoName: string,
): Map<string, string> {
  const names = new Map<string, string>();
  const who = uploaderName.trim().replace(/[\\/]/g, "_");
  const what = videoName.trim().replace(/[\\/]/g, "_");
  if (!who || !what) return names;
  const generic = files
    .filter((f) => !f.name && !f.keepOriginal && isGenericName(baseName(f.path)))
    .sort((a, b) =>
      baseName(a.droppedPath ?? a.path).localeCompare(
        baseName(b.droppedPath ?? b.path),
        undefined,
        { numeric: true },
      ),
    );
  generic.forEach((f, i) => {
    const [, extension] = splitExtension(baseName(f.path));
    const number = generic.length > 1 ? ` ${i + 1}` : "";
    names.set(f.path, `${who} - ${what}${number}${extension}`);
  });
  return names;
}

/** Name used on the NAS: chosen with the pencil, else automatic, else the original. */
export const effectiveName = (f: SelectedFile, automatic: Map<string, string>) =>
  f.name ?? automatic.get(f.path) ?? baseName(f.path);

/** ("Card A/2026-07-22.mkv", "Stund - Beamng 1.mkv") -> "Card A/Stund - Beamng 1.mkv" */
export const renamedPath = (path: string, name: string) =>
  [...path.split("/").slice(0, -1), name].join("/");

/** "Card A/2026-07-22.mkv" -> "Card A/Stund - Beamng 1.mkv" */
export const effectivePath = (f: SelectedFile, automatic: Map<string, string>) =>
  renamedPath(f.path, effectiveName(f, automatic));

/** "Card B/C0001.MP4" -> "Card B/C0001 (2).MP4" */
export const numberedPath = (path: string, n: number) => {
  const [stem, extension] = splitExtension(baseName(path));
  return renamedPath(path, `${stem} (${n})${extension}`);
};

/**
 * Path for a new file: the dropped one, or "C0001 (2).MP4", "C0001 (3).MP4"...
 * when a different file already has it (e.g. C0001.MP4 of a second card).
 */
export function freePath(path: string, taken: Set<string>) {
  let free = path;
  for (let n = 2; taken.has(free); n++) free = numberedPath(path, n);
  return free;
}

/**
 * Resume: paths of the interrupted deposit by dropped path and size, numbered
 * ones included ("C0001 (2).MP4" is found from "C0001.MP4" in any drop order).
 */
export function resumePaths(files: { path: string; size: number }[]) {
  const paths = new Map<string, string[]>();
  const add = (key: string, path: string) => {
    const list = paths.get(key);
    if (list) list.push(path);
    else paths.set(key, [path]);
  };
  for (const f of files) {
    add(fileKey(f.path, f.size), f.path);
    // "C0001 (2).MP4" -> "C0001.MP4"
    const [stem, extension] = splitExtension(baseName(f.path));
    const unnumbered = stem.replace(/ \(\d+\)$/, "");
    if (unnumbered !== stem)
      add(fileKey(renamedPath(f.path, unnumbered + extension), f.size), f.path);
  }
  return paths;
}

/**
 * Cleans a new name typed by the uploader. Returns undefined when it is
 * empty or unchanged. The extension is put back if it was removed.
 */
export function cleanNewName(path: string, typed: string): string | undefined {
  const original = baseName(path);
  let name = typed.trim().replace(/[\\/]/g, "_");
  if (!name) return undefined;
  const dot = original.lastIndexOf(".");
  const extension = dot > 0 ? original.slice(dot) : "";
  if (extension && !name.toLowerCase().endsWith(extension.toLowerCase()))
    name += extension;
  return name === original ? undefined : name;
}

// OS clutter nobody wants on the NAS
const JUNK_FILE = /^(\.DS_Store|Thumbs\.db|desktop\.ini|\._.*)$/i;

/** Normalises dropped files; returns the kept files and how many junk files were skipped. */
export function selectFiles(files: File[]) {
  const kept: SelectedFile[] = [];
  let ignored = 0;
  for (const file of files) {
    const path = getNormalizedFileName(file);
    if (JUNK_FILE.test(path.split("/").pop() ?? "")) {
      ignored++;
      continue;
    }
    kept.push({ file, path, size: file.size, lastModified: file.lastModified });
  }
  return { kept, ignored };
}

/** "A/B" shown as "Root › A › B" */
export const displayFolder = (rootName: string, path: string) =>
  [rootName, ...path.split("/").filter(Boolean)].join(" › ");

// Size first: it only contains digits, so the key is unambiguous
export const fileKey = (path: string, size: number) => `${size}:${path}`;

/**
 * Splits files to register into batches of at most `count` files and about
 * `maxBytes` of JSON (the server refuses bodies over 100 KB: long paths).
 */
export function batches<T>(items: T[], count: number, maxBytes: number) {
  const encoder = new TextEncoder();
  const result: T[][] = [];
  let batch: T[] = [];
  let bytes = 0;
  for (const item of items) {
    const itemBytes = encoder.encode(JSON.stringify(item)).length + 1;
    if (batch.length > 0 && (batch.length >= count || bytes + itemBytes > maxBytes)) {
      result.push(batch);
      batch = [];
      bytes = 0;
    }
    batch.push(item);
    bytes += itemBytes;
  }
  if (batch.length > 0) result.push(batch);
  return result;
}

const SIZE_UNITS: Record<string, string[]> = {
  fr: ["o", "Ko", "Mo", "Go", "To"],
  en: ["B", "KB", "MB", "GB", "TB"],
};

/** "1,5 Go" in French, "1.5 GB" in English */
export function formatSize(bytes: number, locale: string) {
  const units = SIZE_UNITS[locale.split("-")[0]] ?? SIZE_UNITS.en;
  let value = bytes;
  let unit = 0;
  while (value >= 1000 && unit < units.length - 1) {
    value /= 1000;
    unit++;
  }
  const number = new Intl.NumberFormat(locale, {
    maximumFractionDigits: unit === 0 ? 0 : 1,
  }).format(value);
  return `${number} ${units[unit]}`;
}

/** "2 h 05 min", "12 min", "45 s" */
export function formatDuration(seconds?: number) {
  if (seconds === undefined || !isFinite(seconds)) return "…";
  const s = Math.max(0, Math.round(seconds));
  if (s < 60) return `${s} s`;
  const minutes = Math.round(s / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  return `${hours} h ${String(minutes % 60).padStart(2, "0")} min`;
}

// ------------------------------------------------------------------ resume

export type SavedDeposit = {
  depositId: string;
  secret: string;
  savedAt: number;
  // New names (chosen or automatic) by path, shown on "Reçu" after a resume
  names?: Record<string, string>;
};

const storageKey = (token: string) => `stundtransfer:deposit:${token}`;

export const resumeMemory = {
  save(token: string, deposit: SavedDeposit) {
    try {
      localStorage.setItem(storageKey(token), JSON.stringify(deposit));
    } catch {
      try {
        // Too many new names for the browser storage: resume without them
        localStorage.setItem(
          storageKey(token),
          JSON.stringify({ ...deposit, names: undefined }),
        );
      } catch {
        // Private browsing: resuming after a reload is just not available
      }
    }
  },
  load(token: string): SavedDeposit | undefined {
    try {
      const raw = localStorage.getItem(storageKey(token));
      return raw ? JSON.parse(raw) : undefined;
    } catch {
      return undefined;
    }
  },
  clear(token: string) {
    try {
      localStorage.removeItem(storageKey(token));
    } catch {
      // ignore
    }
  },
};
