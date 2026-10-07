// StundTransfer: on a deposit link, shows the deposit page instead of
// Pingvin's reverse share upload page (used by pages/upload/[reverseShareToken].tsx).
import { ComponentType } from "react";
import DepositPage from "./DepositPage";
import stundTransferService from "./stundtransfer.service";
import { DepositInfoLoading, useDepositInfo } from "./useDepositInfo";

export default function withDepositMode<P extends { reverseShareToken: string }>(
  ReverseSharePage: ComponentType<P>,
) {
  const DepositOrReverseShare = (props: P) => {
    // null: not a deposit link (or invalid: Pingvin shows its error). Only a
    // definite answer shows the classic page: files sent there do not reach
    // the NAS.
    const { info, unreachable } = useDepositInfo(
      () => stundTransferService.getLink(props.reverseShareToken),
      props.reverseShareToken,
    );

    if (info === undefined) return <DepositInfoLoading unreachable={unreachable} />;
    if (info) return <DepositPage token={props.reverseShareToken} info={info} />;
    return <ReverseSharePage {...props} />;
  };
  return DepositOrReverseShare;
}
