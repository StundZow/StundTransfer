// StundTransfer: helpers for the deposit page (file selection, resume memory, formatting).
import { getNormalizedFileName } from "../utils/file.util";

export type SelectedFile = {
  file: File;
  // Path as dropped ("Card A/A001.MP4"): identifies the file, also to resume
  path: string;
  size: number;
  lastModified: number;
  // New name chosen with the pencil (folders stay the same)
  name?: string;
};

const baseName = (path: string) => path.split("/").pop() ?? path;

/** Name shown and used on the NAS: the new name if renamed. */
export const displayName = (f: SelectedFile) => f.name ?? baseName(f.path);

/** "Card A/A001.MP4" renamed "Plan drone.MP4" -> "Card A/Plan drone.MP4" */
export const displayPath = (f: SelectedFile) =>
  [...f.path.split("/").slice(0, -1), displayName(f)].join("/");

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
};

const storageKey = (token: string) => `stundtransfer:deposit:${token}`;

export const resumeMemory = {
  save(token: string, deposit: SavedDeposit) {
    try {
      localStorage.setItem(storageKey(token), JSON.stringify(deposit));
    } catch {
      // Private browsing: resuming after a reload is just not available
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
