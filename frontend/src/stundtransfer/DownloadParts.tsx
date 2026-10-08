// StundTransfer: pieces shared by the download pages (NAS links /d/… and
// share links /share/…), so that both look the same.
import { ActionIcon, Box, Group, Text, Tooltip, UnstyledButton } from "@mantine/core";
import { ReactNode } from "react";
import { TbDownload } from "react-icons/tb";
import useTranslate from "../hooks/useTranslate.hook";

export const badgeStyle = { textTransform: "none" as const, fontWeight: 500 };

/** One line of the content: name on the left, size and a small download icon on the right. */
export const DownloadRow = ({
  icon,
  name,
  size,
  href,
  onOpen,
}: {
  icon: ReactNode;
  name: string;
  size: string;
  href: string;
  onOpen?: () => void;
}) => {
  const t = useTranslate();
  const label = (
    <Group spacing="sm" noWrap sx={{ minWidth: 0 }}>
      {icon}
      <Text size="sm" truncate title={name}>
        {name}
      </Text>
    </Group>
  );
  return (
    <Group
      position="apart"
      noWrap
      spacing="sm"
      px="sm"
      py={6}
      sx={(theme) => ({
        borderRadius: theme.radius.sm,
        "&:hover": {
          backgroundColor:
            theme.colorScheme === "dark" ? theme.colors.dark[5] : theme.colors.gray[1],
        },
      })}
    >
      {onOpen ? (
        <UnstyledButton onClick={onOpen} sx={{ minWidth: 0, flex: 1 }}>
          {label}
        </UnstyledButton>
      ) : (
        <Box sx={{ minWidth: 0, flex: 1 }}>{label}</Box>
      )}
      <Group spacing={4} noWrap>
        <Text size="sm" color="dimmed" sx={{ whiteSpace: "nowrap" }}>
          {size}
        </Text>
        <Tooltip label={t("stundtransfer.nas.download")} withArrow>
          <ActionIcon
            component="a"
            href={href}
            variant="subtle"
            color="gray"
            aria-label={`${t("stundtransfer.nas.download")} ${name}`}
          >
            <TbDownload size="1.1rem" />
          </ActionIcon>
        </Tooltip>
      </Group>
    </Group>
  );
};
