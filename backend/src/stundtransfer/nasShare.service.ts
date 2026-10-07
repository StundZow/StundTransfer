// StundTransfer: links to files and folders already on the NAS. The admin
// picks one in the mounted folder; anyone with the link downloads it over
// HTTPS, read straight from the NAS (nothing is copied). Files are sent with
// HTTP ranges so browsers and download managers can resume; a folder can be
// browsed, its files downloaded one by one, or all at once as a zip.
import { HttpStatus, Injectable, Logger } from "@nestjs/common";
import { StundNasLink, User } from "@prisma/client";
import * as archiver from "archiver";
import * as crypto from "crypto";
import { createReadStream } from "fs";
import * as fs from "fs/promises";
import * as path from "path";
import { PrismaService } from "src/prisma/prisma.service";
import { stundError } from "./deposit.service";
import { assertRealPathInside, relativeParts, resolveInside } from "./paths";
import { STUND_ROOT_DIR, isStundTransferEnabled } from "./stundtransfer.config";

// Entries shown per folder
const MAX_LISTED = 2000;
const TOKEN_REGEX = /^[A-Za-z0-9_-]{16,64}$/;
// Big reads: the disks and the network both prefer them
const READ_BLOCK_BYTES = 1024 * 1024;
// Hidden files and DSM folders (#recycle, @eaDir) are never shown nor sent
const isHidden = (name: string) => /^[.@#]/.test(name);
// Folder sizes of the download page come from walking the tree: a giant tree
// stops early (the size shown is then a lower bound)
const MAX_WALKED = 20_000;

/** Total size and number of files of a folder, sub-folders included. */
async function folderTotals(absolute: string, budget = { left: MAX_WALKED }) {
  let size = 0;
  let files = 0;
  let complete = true;
  const walk = async (dir: string) => {
    let entries: import("fs").Dirent[];
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    const folders: string[] = [];
    const sizes: Promise<void>[] = [];
    for (const entry of entries) {
      if (isHidden(entry.name)) continue;
      if (budget.left-- <= 0) {
        complete = false;
        break;
      }
      const child = path.join(dir, entry.name);
      if (entry.isDirectory()) folders.push(child);
      else if (entry.isFile())
        sizes.push(
          fs.stat(child).then(
            (stats) => {
              size += stats.size;
              files++;
            },
            () => undefined,
          ),
        );
    }
    await Promise.all(sizes);
    for (const folder of folders) if (complete) await walk(folder);
  };
  await walk(absolute);
  return { size, files, complete };
}

const notFound = () =>
  stundError(HttpStatus.NOT_FOUND, "stund_link_invalid", "This link does not exist or has expired");

export type NasFileDownload =
  | { unsatisfiable: true; size: number }
  | {
      unsatisfiable: false;
      name: string;
      size: number;
      start: number;
      end: number;
      partial: boolean;
      stream: NodeJS.ReadableStream & { destroy(): void };
    };

@Injectable()
export class NasShareService {
  private readonly logger = new Logger("StundTransfer");

  constructor(private prisma: PrismaService) {}

  private assertEnabled() {
    if (!isStundTransferEnabled())
      throw stundError(
        HttpStatus.SERVICE_UNAVAILABLE,
        "stund_storage_unavailable",
        "No NAS folder is mounted",
      );
  }

  /** An entry given relative to `base`, checked to stay inside it (symlinks too). */
  private async resolveIn(base: string, relative: string) {
    let parts: string[];
    try {
      parts = relativeParts(relative);
    } catch {
      throw stundError(HttpStatus.BAD_REQUEST, "stund_bad_path", "Invalid path");
    }
    const absolute = parts.length ? resolveInside(base, ...parts) : base;
    try {
      await assertRealPathInside(base, absolute);
      return { parts, absolute, stats: await fs.stat(absolute) };
    } catch {
      throw stundError(HttpStatus.NOT_FOUND, "stund_not_found", "Not found");
    }
  }

  /** Folders and files of a folder, with sizes and modification dates. */
  private async listFolder(absolute: string) {
    const entries = (await fs.readdir(absolute, { withFileTypes: true }))
      .filter((entry) => !isHidden(entry.name) && (entry.isDirectory() || entry.isFile()))
      .slice(0, MAX_LISTED);
    const described = await Promise.all(
      entries.map(async (entry) => {
        const stats = await fs.stat(path.join(absolute, entry.name)).catch(() => null);
        return {
          name: entry.name,
          folder: entry.isDirectory(),
          size: stats?.size ?? 0,
          modifiedAt: stats?.mtime.toISOString() ?? null,
        };
      }),
    );
    return {
      folders: described
        .filter((entry) => entry.folder)
        .map(({ name, modifiedAt }) => ({ name, modifiedAt })),
      files: described
        .filter((entry) => !entry.folder)
        .map(({ name, size, modifiedAt }) => ({ name, size, modifiedAt })),
    };
  }

  // Admin

  async list(relative?: string) {
    this.assertEnabled();
    const { parts, absolute, stats } = await this.resolveIn(STUND_ROOT_DIR, relative ?? "");
    if (!stats.isDirectory())
      throw stundError(HttpStatus.NOT_FOUND, "stund_not_found", "Not a folder");
    return { path: parts.join("/"), ...(await this.listFolder(absolute)) };
  }

  async createLink(relative: string, expiresInDays: number | undefined, user: User) {
    this.assertEnabled();
    const { parts, stats } = await this.resolveIn(STUND_ROOT_DIR, relative);
    // The whole mounted folder is never shared
    if (parts.length === 0 || !(stats.isFile() || stats.isDirectory()))
      throw stundError(HttpStatus.BAD_REQUEST, "stund_bad_path", "This cannot be shared");
    const link = await this.prisma.stundNasLink.create({
      data: {
        token: crypto.randomBytes(18).toString("base64url"),
        path: parts.join("/"),
        expiresAt: expiresInDays ? new Date(Date.now() + expiresInDays * 86_400_000) : null,
        createdById: user.id,
      },
    });
    this.logger.log(`NAS link created for "${link.path}" by ${user.username}`);
    return this.adminView(link);
  }

  private async adminView(link: StundNasLink) {
    const stats = await this.resolveIn(STUND_ROOT_DIR, link.path)
      .then((entry) => entry.stats)
      .catch(() => null);
    return {
      id: link.id,
      token: link.token,
      path: link.path,
      name: path.posix.basename(link.path),
      folder: !!stats?.isDirectory(),
      // null: moved or deleted since (or a folder)
      size: stats?.isFile() ? stats.size : null,
      missing: !stats,
      createdAt: link.createdAt,
      expiresAt: link.expiresAt,
      downloads: link.downloads,
    };
  }

  async listLinks() {
    const links = await this.prisma.stundNasLink.findMany({ orderBy: { createdAt: "desc" } });
    return Promise.all(links.map((link) => this.adminView(link)));
  }

  async deleteLink(id: string) {
    const { count } = await this.prisma.stundNasLink.deleteMany({ where: { id } });
    if (!count) throw notFound();
  }

  // Public (anyone with the link)

  private async findLink(token: string) {
    if (!TOKEN_REGEX.test(token ?? "")) throw notFound();
    const link = await this.prisma.stundNasLink.findUnique({ where: { token } });
    if (!link || (link.expiresAt && link.expiresAt < new Date())) throw notFound();
    return link;
  }

  /** What a link points to, still on the NAS. */
  private async linked(token: string) {
    this.assertEnabled();
    const link = await this.findLink(token);
    const entry = await this.resolveIn(STUND_ROOT_DIR, link.path).catch(() => {
      throw notFound();
    });
    if (!entry.stats.isFile() && !entry.stats.isDirectory()) throw notFound();
    return { link, ...entry, name: path.posix.basename(link.path) };
  }

  /** An entry inside a folder link ("" = the folder itself). */
  private async inside(token: string, relative?: string) {
    const linked = await this.linked(token);
    if (!linked.stats.isDirectory()) {
      if (relative) throw notFound();
      return { ...linked, inner: linked };
    }
    return { ...linked, inner: await this.resolveIn(linked.absolute, relative ?? "") };
  }

  async getPublic(token: string) {
    const { name, stats, link, absolute } = await this.linked(token);
    const totals = stats.isDirectory()
      ? await folderTotals(absolute)
      : { size: stats.size, files: 1, complete: true };
    return {
      name,
      folder: stats.isDirectory(),
      size: totals.size,
      fileCount: totals.files,
      // false: a giant folder, the size and count are lower bounds
      complete: totals.complete,
      expiresAt: link.expiresAt,
    };
  }

  /** Content of a folder link (or of one of its sub-folders), with folder sizes. */
  async listPublic(token: string, relative?: string) {
    const { inner } = await this.inside(token, relative);
    if (!inner.stats.isDirectory()) throw notFound();
    const { folders, files } = await this.listFolder(inner.absolute);
    const budget = { left: MAX_WALKED };
    const sized: { name: string; size: number; files: number; complete: boolean }[] = [];
    for (const folder of folders)
      sized.push({
        name: folder.name,
        ...(await folderTotals(path.join(inner.absolute, folder.name), budget)),
      });
    return {
      path: inner.parts.join("/"),
      folders: sized,
      files: files.map(({ name, size }) => ({ name, size })),
    };
  }

  private async countDownload(link: StundNasLink) {
    await this.prisma.stundNasLink
      .update({ where: { id: link.id }, data: { downloads: { increment: 1 } } })
      .catch(() => undefined);
  }

  /** Opens a file of a link, honouring a single "Range: bytes=start-end". */
  async openFile(token: string, relative: string | undefined, range?: string): Promise<NasFileDownload> {
    const { link, inner } = await this.inside(token, relative);
    if (!inner.stats.isFile()) throw notFound();
    const size = inner.stats.size;
    let start = 0;
    let end = size - 1;
    let partial = false;
    // Several ranges ("0-1,5-9") or an odd header: the whole file is sent (allowed by HTTP)
    const match = /^bytes=(\d*)-(\d*)$/.exec(range?.trim() ?? "");
    if (match && (match[1] !== "" || match[2] !== "")) {
      if (match[1] === "") start = Math.max(0, size - Number(match[2]));
      else {
        start = Number(match[1]);
        if (match[2] !== "") end = Math.min(Number(match[2]), size - 1);
      }
      if (start >= size || start > end) return { unsatisfiable: true, size };
      partial = true;
    }
    // Counted once per download, not for every resumed or parallel part
    if (start === 0) await this.countDownload(link);
    const stream =
      size === 0
        ? createReadStream(inner.absolute)
        : createReadStream(inner.absolute, { start, end, highWaterMark: READ_BLOCK_BYTES });
    return {
      unsatisfiable: false,
      name: path.basename(inner.absolute),
      size,
      start,
      end,
      partial,
      stream,
    };
  }

  /** A folder of a link as a zip, written while it is sent (no compression: rushes are already compressed). */
  async openZip(token: string, relative?: string) {
    const { link, inner, name } = await this.inside(token, relative);
    if (!inner.stats.isDirectory()) throw notFound();
    const folderName = inner.parts.length ? inner.parts[inner.parts.length - 1] : name;
    const archive = archiver("zip", { store: true });
    const addFolder = async (absolute: string, prefix: string) => {
      for (const entry of await fs.readdir(absolute, { withFileTypes: true })) {
        if (isHidden(entry.name)) continue;
        const child = path.join(absolute, entry.name);
        if (entry.isDirectory()) await addFolder(child, `${prefix}${entry.name}/`);
        else if (entry.isFile()) archive.file(child, { name: `${prefix}${entry.name}` });
      }
    };
    // Not awaited: the counter must not delay the start of the zip
    void this.countDownload(link);
    addFolder(inner.absolute, `${folderName}/`)
      .then(() => archive.finalize())
      .catch((e) => {
        this.logger.warn(`NAS zip of link ${token.slice(0, 6)}…: ${e?.message ?? e}`);
        archive.abort();
      });
    return { name: `${folderName}.zip`, archive };
  }
}
