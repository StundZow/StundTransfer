// StundTransfer: buttons of admins in the header bar ("Partager",
// "Partager depuis le NAS"), filled in the site color.
import { Button } from "@mantine/core";
import Link from "next/link";
import { ReactNode } from "react";

const HeaderButton = ({
  href,
  icon,
  label,
}: {
  href: string;
  icon: ReactNode;
  label: string;
}) => (
  <Button component={Link} href={href} size="xs" leftIcon={icon}>
    {label}
  </Button>
);

export default HeaderButton;
