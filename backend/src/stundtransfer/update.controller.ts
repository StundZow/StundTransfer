// StundTransfer: HTTP API of the "Mettre à jour" page (admins only).
import { Controller, Get, Post, UseGuards } from "@nestjs/common";
import { User } from "@prisma/client";
import { GetUser } from "src/auth/decorator/getUser.decorator";
import { AdministratorGuard } from "src/auth/guard/isAdmin.guard";
import { JwtGuard } from "src/auth/guard/jwt.guard";
import { UpdateService } from "./update.service";

@Controller("stundtransfer/admin/update")
@UseGuards(JwtGuard, AdministratorGuard)
export class UpdateController {
  constructor(private update: UpdateService) {}

  @Get()
  status() {
    return this.update.status();
  }

  @Post()
  request(@GetUser() user: User) {
    return this.update.request(user);
  }
}
