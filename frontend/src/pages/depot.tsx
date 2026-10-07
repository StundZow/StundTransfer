// StundTransfer: home page for visitors (the middleware shows it on "/").
// Public deposit (Admin > Configuration > StundTransfer): no account, no link.
import { Alert } from "@mantine/core";
import { TbInfoCircle } from "react-icons/tb";
import { FormattedMessage } from "react-intl";
import Meta from "../components/Meta";
import useTranslate from "../hooks/useTranslate.hook";
import DepositPage from "../stundtransfer/DepositPage";
import stundTransferService from "../stundtransfer/stundtransfer.service";
import { DepositInfoLoading, useDepositInfo } from "../stundtransfer/useDepositInfo";

const Depot = () => {
  const t = useTranslate();
  // null: public deposit closed (a short error is retried, not taken as closed)
  const { info, unreachable } = useDepositInfo(
    stundTransferService.getPublicInfo,
    "public",
  );

  if (info === undefined) return <DepositInfoLoading unreachable={unreachable} />;
  if (info) return <DepositPage info={info} />;
  return (
    <>
      <Meta title={t("stundtransfer.page.title")} />
      <Alert
        icon={<TbInfoCircle />}
        title={t("stundtransfer.guest.closed.title")}
        style={{ maxWidth: "50rem", margin: "0 auto" }}
      >
        <FormattedMessage id="stundtransfer.guest.closed.description" />
      </Alert>
    </>
  );
};

export default Depot;
