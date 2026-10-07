// StundTransfer: links to files already on the NAS. The admin picks a file in
// the mounted folder; anyone with the link downloads it over HTTPS, read
// straight from the NAS (nothing is copied), with HTTP ranges so that
// browsers and download managers can resume.
import { HttpStatus, Injectable, Logger } from "@nestjs/common";
import { StundNasLink, User } from "@prisma/client";
import * as crypto from "crypto";
import { createReadStream } from "fs";
import * as fs from "fs/promises";
import * as path from "path";
import { PrismaService } from "src/prisma/prisma.service";
import { stundError } from "./deposit.service";
import { assertRealPathInside, relativeParts, resolveInside } from "./paths";
import { STUND_ROOT_DIR, isStundTransferEnabled } from "./stundtransfer.config";

// Files shown per folder in the picker
const MAX_LISTED_FILES = 2000;
const TOKEN_REGEX = /^[A-Za-z0-9_-]{16,64}$/;
// Big reads: the disks and the network both prefer them
const READ_BLOCK_BYTES = 1024 * 1024;

const byName = (a: string, b: string) => a.localeCompare(b, "fr", { numeric: true });

const notFound = () =>
  stundError(HttpStatus.NOT_FOUND, "stund_link_invalid", "This link does not exist or has expired");

export type NasDownload =
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

  /** An entry given relative to the mounted folder, checked to stay inside it (symlinks too). */
  private async resolve(relative: string) {
    let parts: string[];
    try {
      parts = relativeParts(relative);
    } catch {
      throw stundError(HttpStatus.BAD_REQUEST, "stund_bad_path", "Invalid path");
    }
    const absolute = parts.length ? resolveInside(STUND_ROOT_DIR, ...parts) : STUND_ROOT_DIR;
    try {
      await assertRealPathInside(STUND_ROOT_DIR, absolute);
      return { parts, absolute, stats: await fs.stat(absolute) };
    } catch {
      throw stundError(HttpStatus.NOT_FOUND, "stund_not_found", "Not found");
    }
  }

  /** Folders and files of a folder of the NAS (hidden and DSM folders left out). */
  async list(relative?: string) {
    this.assertEnabled();
    const { parts, absolute, stats } = await this.resolve(relative ?? "");
    if (!stats.isDirectory())
      throw stundError(HttpStatus.NOT_FOUND, "stund_not_found", "Not a folder");
    const entries = (await fs.readdir(absolute, { withFileTypes: true })).filter(
      (entry) => !/^[.@#]/.test(entry.name),
    );
    const files = await Promise.all(
      entries
        .filter((entry) => entry.isFile())
        .slice(0, MAX_LISTED_FILES)
        .map(async (entry) => ({
          name: entry.name,
          size: (await fs.stat(path.join(absolute, entry.name)).catch(() => null))?.size ?? 0,
        })),
    );
    return {
      path: parts.join("/"),
      folders: entries
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
        .sort(byName),
      files: files.sort((a, b) => byName(a.name, b.name)),
    };
  }

  async createLink(relative: string, expiresInDays: number | undefined, user: User) {
    this.assertEnabled();
    const { parts, stats } = await this.resolve(relative);
    if (parts.length === 0 || !stats.isFile())
      throw stundError(HttpStatus.BAD_REQUEST, "stund_not_a_file", "Only files can be shared");
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
    const stats = await this.resolve(link.path)
      .then((entry) => entry.stats)
      .catch(() => null);
    return {
      id: link.id,
      token: link.token,
      path: link.path,
      name: path.posix.basename(link.path),
      // null: the file was moved or deleted since
      size: stats?.isFile() ? stats.size : null,
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

  private async findLink(token: string) {
    if (!TOKEN_REGEX.test(token ?? "")) throw notFound();
    const link = await this.prisma.stundNasLink.findUnique({ where: { token } });
    if (!link || (link.expiresAt && link.expiresAt < new Date())) throw notFound();
    return link;
  }

  /** The file of a link, still on the NAS. */
  private async linkedFile(token: string) {
    this.assertEnabled();
    const link = await this.findLink(token);
    const { absolute, stats } = await this.resolve(link.path).catch(() => {
      throw notFound();
    });
    if (!stats.isFile()) throw notFound();
    return { link, absolute, size: stats.size, name: path.posix.basename(link.path) };
  }

  async getPublic(token: string) {
    const { name, size, link } = await this.linkedFile(token);
    return { name, size, expiresAt: link.expiresAt };
  }

  /** Opens the file of a link, honouring a single "Range: bytes=start-end". */
  async openDownload(token: string, range?: string): Promise<NasDownload> {
    const { link, absolute, size, name } = await this.linkedFile(token);
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
    if (start === 0)
      await this.prisma.stundNasLink
        .update({ where: { id: link.id }, data: { downloads: { increment: 1 } } })
        .catch(() => undefined);
    const stream =
      size === 0
        ? createReadStream(absolute)
        : createReadStream(absolute, { start, end, highWaterMark: READ_BLOCK_BYTES });
    return { unsatisfiable: false, name, size, start, end, partial, stream };
  }
}
