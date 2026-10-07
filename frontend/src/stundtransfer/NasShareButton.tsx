// StundTransfer: header button of admins (grey, right of "Dépôts reçus") to
// share files and folders already on the NAS.
import { Button } from "@mantine/core";
import Link from "next/link";
import { TbShare } from "react-icons/tb";
import useTranslate from "../hooks/useTranslate.hook";

const NasShareButton = () => {
  const t = useTranslate();
  return (
    <Button
      component={Link}
      href="/admin/nas"
      size="xs"
      variant="light"
      color="gray"
      leftIcon={<TbShare size="1rem" />}
    >
      {t("stundtransfer.nas.title")}
    </Button>
  );
};

export default NasShareButton;
