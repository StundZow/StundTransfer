import { ExecutionContext, Injectable } from "@nestjs/common";
import { JwtGuard } from "src/auth/guard/jwt.guard";
import { ConfigService } from "src/config/config.service";
import { ReverseShareService } from "src/reverseShare/reverseShare.service";
import { isStundTransferEnabled } from "src/stundtransfer/stundtransfer.config"; // StundTransfer

@Injectable()
export class CreateShareGuard extends JwtGuard {
  constructor(
    configService: ConfigService,
    private reverseShareService: ReverseShareService,
  ) {
    super(configService);
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const reverseShareTokenId = context.switchToHttp().getRequest()
      .cookies.reverse_share_token;
    // StundTransfer: in deposit mode every link is a deposit link: its files
    // go through /api/stundtransfer only, never into a classic share
    const isDepositLink = !!reverseShareTokenId && isStundTransferEnabled();

    if (await super.canActivate(context)) {
      // StundTransfer: only administrators create share links
      const user = context.switchToHttp().getRequest().user;
      return user ? user.isAdmin : !isDepositLink;
    }

    if (!reverseShareTokenId || isDepositLink) return false;

    const isReverseShareTokenValid =
      await this.reverseShareService.isValid(reverseShareTokenId);

    return isReverseShareTokenValid;
  }
}
