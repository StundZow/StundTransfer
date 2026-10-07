// StundTransfer: HTTP API of the links to files and folders already on the NAS.
import {
  Body,
  Controller,
  Delete,
  Get,
  Logger,
  Param,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { User } from "@prisma/client";
import * as contentDisposition from "content-disposition";
import { Request, Response } from "express";
import * as mime from "mime-types";
import { GetUser } from "src/auth/decorator/getUser.decorator";
import { AdministratorGuard } from "src/auth/guard/isAdmin.guard";
import { JwtGuard } from "src/auth/guard/jwt.guard";
import { CreateNasLinkDTO } from "./dto/nasLink.dto";
import { NasFileDownload, NasShareService } from "./nasShare.service";

// Sent straight through: DSM's reverse proxy (nginx) would otherwise first
// copy big downloads to a temporary file on the NAS
const NO_PROXY_BUFFERING = { "X-Accel-Buffering": "no" };

@Controller("stundtransfer")
export class NasShareController {
  private readonly logger = new Logger("StundTransfer");

  constructor(private nasShare: NasShareService) {}

  // Admin: browse the NAS and manage the links

  @Get("admin/nas")
  @UseGuards(JwtGuard, AdministratorGuard)
  list(@Query("path") path?: string) {
    return this.nasShare.list(path);
  }

  @Get("admin/nas-links")
  @UseGuards(JwtGuard, AdministratorGuard)
  listLinks() {
    return this.nasShare.listLinks();
  }

  @Post("admin/nas-links")
  @UseGuards(JwtGuard, AdministratorGuard)
  createLink(@Body() body: CreateNasLinkDTO, @GetUser() user: User) {
    return this.nasShare.createLink(body.path, body.expiresInDays, user);
  }

  @Delete("admin/nas-links/:id")
  @UseGuards(JwtGuard, AdministratorGuard)
  deleteLink(@Param("id") id: string) {
    return this.nasShare.deleteLink(id);
  }

  // Public: anyone with the link

  @Get("nas/:token")
  @Throttle({ default: { limit: 30, ttl: 60 * 1000 } })
  getLink(@Param("token") token: string) {
    return this.nasShare.getPublic(token);
  }

  @Get("nas/:token/list")
  @Throttle({ default: { limit: 60, ttl: 60 * 1000 } })
  listLink(@Param("token") token: string, @Query("path") path?: string) {
    return this.nasShare.listPublic(token, path);
  }

  // Download managers open several ranges at once and resume: a higher limit
  @Get("nas/:token/download")
  @Throttle({ default: { limit: 120, ttl: 60 * 1000 } })
  async download(
    @Param("token") token: string,
    @Query("path") path: string | undefined,
    @Req() request: Request,
    @Res() response: Response,
  ) {
    const download = await this.nasShare.openFile(token, path, request.headers.range);
    if (download.unsatisfiable) {
      response.status(416).set("Content-Range", `bytes */${download.size}`).end();
      return;
    }
    const { name, size, start, end, partial, stream } = download as Extract<
      NasFileDownload,
      { unsatisfiable: false }
    >;
    response.status(partial ? 206 : 200).set({
      "Content-Type": mime.lookup(name) || "application/octet-stream",
      "Content-Length": String(size === 0 ? 0 : end - start + 1),
      "Content-Disposition": contentDisposition(name),
      "Accept-Ranges": "bytes",
      "Cache-Control": "private, no-store",
      ...NO_PROXY_BUFFERING,
      ...(partial ? { "Content-Range": `bytes ${start}-${end}/${size}` } : {}),
    });
    stream.on("error", (e) => {
      this.logger.warn(`NAS link ${token.slice(0, 6)}…: read error (${e.message})`);
      response.destroy(e);
    });
    // Download cancelled: stop reading the disk
    response.on("close", () => stream.destroy());
    stream.pipe(response);
  }

  @Get("nas/:token/zip")
  @Throttle({ default: { limit: 10, ttl: 60 * 1000 } })
  async zip(
    @Param("token") token: string,
    @Query("path") path: string | undefined,
    @Res() response: Response,
  ) {
    const { name, zip } = await this.nasShare.openZip(token, path);
    response.status(200).set({
      "Content-Type": "application/zip",
      // Known in advance: the browser shows the total and the time left
      "Content-Length": String(zip.size),
      "Content-Disposition": contentDisposition(name),
      "Cache-Control": "private, no-store",
      ...NO_PROXY_BUFFERING,
    });
    zip.writeTo(response).catch((e) => {
      this.logger.warn(`NAS zip of link ${token.slice(0, 6)}…: ${e.message}`);
      response.destroy(e);
    });
  }
}
