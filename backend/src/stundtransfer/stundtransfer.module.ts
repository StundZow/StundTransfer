// StundTransfer: deposit mode for reverse share links (see STUNDTRANSFER.md).
import { Module } from "@nestjs/common";
import { ReverseShareModule } from "src/reverseShare/reverseShare.module";
import { DepositController } from "./deposit.controller";
import { DepositService } from "./deposit.service";
import { NasShareController } from "./nasShare.controller";
import { NasShareService } from "./nasShare.service";

@Module({
  imports: [ReverseShareModule],
  controllers: [DepositController, NasShareController],
  providers: [DepositService, NasShareService],
})
export class StundTransferModule {}
