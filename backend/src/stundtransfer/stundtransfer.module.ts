// StundTransfer: deposit mode for reverse share links (see STUNDTRANSFER.md).
import { Module } from "@nestjs/common";
import { ReverseShareModule } from "src/reverseShare/reverseShare.module";
import { DepositController } from "./deposit.controller";
import { DepositService } from "./deposit.service";
import { NasShareController } from "./nasShare.controller";
import { NasShareService } from "./nasShare.service";
import { UpdateController } from "./update.controller";
import { UpdateService } from "./update.service";

@Module({
  imports: [ReverseShareModule],
  controllers: [DepositController, NasShareController, UpdateController],
  providers: [DepositService, NasShareService, UpdateService],
})
export class StundTransferModule {}
