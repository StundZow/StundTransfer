// StundTransfer: public page of a share link, same look as the NAS links
// (/d/…): a card in the middle of the screen, a big download button (the file,
// or the .zip of everything) and the files with their size and a small
// download icon. Buttons are plain links: the browser downloads by itself.
import {
  ActionIcon,
  Badge,
  Button,
  Group,
  Paper,
  Stack,
  Text,
  ThemeIcon,
  Title,
  Tooltip,
} from "@mantine/core";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { TbDownload, TbEdit, TbFile, TbFiles, TbPlusMinus } from "react-icons/tb";
import { useIntl } from "react-intl";
import useTranslate from "../hooks/useTranslate.hook";
import shareService from "../services/share.service";
import { Share } from "../types/share.type";
import { formatSize } from "./depositFiles";
import { DownloadRow, badgeStyle } from "./DownloadParts";

type ShareFile = { id: string; name: string; size: string };

const ShareDownloadCard = ({
  share,
  recipientId,
  canAddFiles,
  onEdit,
}: {
  share: Share;
  recipientId?: string;
  // Owner: add or remove files
  canAddFiles: boolean;
  // Owner or admin: name, description, expiry...
  onEdit?: () => void;
}) => {
  const t = useTranslate();
  const intl = useIntl();
  const files: ShareFile[] = share.files ?? [];
  const single = files.length === 1;

  const url = (fileId: string) =>
    `/api/shares/${share.id}/files/${fileId}${
      recipientId ? `?recipient=${encodeURIComponent(recipientId)}` : ""
    }`;

  // The .zip of several files is made by the server after the upload
  const [zipReady, setZipReady] = useState(false);
  useEffect(() => {
    if (files.length < 2) return;
    let timer: ReturnType<typeof setInterval> | undefined;
    const check = () =>
      shareService
        .getMetaData(share.id)
        .then((meta) => {
          setZipReady(meta.isZipReady);
          if (meta.isZipReady) clearInterval(timer);
        })
        .catch(() => clearInterval(timer));
    check();
    timer = setInterval(check, 5000);
    return () => clearInterval(timer);
  }, [share.id, files.length]);

  const sorted = useMemo(
    () =>
      [...files].sort((a, b) =>
        a.name.localeCompare(b.name, intl.locale, { numeric: true }),
      ),
    [files, intl.locale],
  );
  const total = files.reduce((sum, file) => sum + Number(file.size), 0);
  const expires = share.expiration && new Date(share.expiration).getTime() > 0;
  const title = share.name || (single ? files[0].name : t("stundtransfer.nas.page.files", { count: files.length }));

  return (
    <Paper
      withBorder
      shadow="md"
      radius="lg"
      w="100%"
      maw="48rem"
      pos="relative"
      sx={{ overflow: "hidden" }}
    >
      {(canAddFiles || onEdit) && (
        <Group spacing="xs" pos="absolute" top="1rem" right="1rem">
          {canAddFiles && (
            <Tooltip label={t("account.shares.button.edit")} withArrow>
              <ActionIcon
                component={Link}
                href={`/share/${share.id}/edit`}
                variant="subtle"
                color="gray"
                aria-label={t("account.shares.button.edit")}
              >
                <TbPlusMinus size="1.1rem" />
              </ActionIcon>
            </Tooltip>
          )}
          {onEdit && (
            <Tooltip label={t("common.button.edit")} withArrow>
              <ActionIcon
                variant="subtle"
                color="gray"
                aria-label={t("common.button.edit")}
                onClick={onEdit}
              >
                <TbEdit size="1.1rem" />
              </ActionIcon>
            </Tooltip>
          )}
        </Group>
      )}
      <Stack align="center" spacing="sm" px="xl" pt="2.5rem" pb="xl">
        <ThemeIcon size="4.5rem" radius="xl" variant="light">
          {single ? <TbFile size="2.4rem" /> : <TbFiles size="2.4rem" />}
        </ThemeIcon>
        <Text size="sm" color="dimmed">
          {t(
            single
              ? "stundtransfer.nas.page.received-file"
              : "stundtransfer.share.page.received-files",
          )}
        </Text>
        <Title order={2} align="center" sx={{ wordBreak: "break-word" }}>
          {title}
        </Title>
        {share.description && (
          <Text color="dimmed" align="center" sx={{ whiteSpace: "pre-wrap" }}>
            {share.description}
          </Text>
        )}
        <Group spacing="xs" position="center">
          {!single && (
            <Badge size="lg" radius="sm" color="gray" variant="light" sx={badgeStyle}>
              {t("stundtransfer.nas.page.files", { count: files.length })}
            </Badge>
          )}
          <Badge size="lg" radius="sm" color="gray" variant="light" sx={badgeStyle}>
            {formatSize(total, intl.locale)}
          </Badge>
          {expires && (
            <Badge size="lg" radius="sm" color="orange" variant="light" sx={badgeStyle}>
              {t("stundtransfer.nas.until", {
                date: intl.formatDate(share.expiration),
              })}
            </Badge>
          )}
        </Group>
        {files.length > 0 &&
          (single || zipReady ? (
            <Button
              component="a"
              href={url(single ? files[0].id : "zip")}
              size="xl"
              radius="md"
              mt="md"
              miw="18rem"
              leftIcon={<TbDownload size="1.5rem" />}
            >
              {t(single ? "stundtransfer.nas.download" : "stundtransfer.nas.page.download-all")}
            </Button>
          ) : (
            // Not a link yet: the .zip is still being made
            <Button size="xl" radius="md" mt="md" miw="18rem" loading>
              {t("stundtransfer.share.page.zip-preparing")}
            </Button>
          ))}
      </Stack>
      {!single && files.length > 0 && (
        <Stack
          spacing={2}
          px="lg"
          py="md"
          mah="45vh"
          sx={(theme) => ({
            overflowY: "auto",
            borderTop: `1px solid ${
              theme.colorScheme === "dark" ? theme.colors.dark[4] : theme.colors.gray[2]
            }`,
            backgroundColor:
              theme.colorScheme === "dark" ? theme.colors.dark[7] : theme.colors.gray[0],
          })}
        >
          {sorted.map((file) => (
            <DownloadRow
              key={file.id}
              icon={<TbFile size="1.2rem" />}
              name={file.name}
              size={formatSize(Number(file.size), intl.locale)}
              href={url(file.id)}
            />
          ))}
        </Stack>
      )}
    </Paper>
  );
};

export default ShareDownloadCard;
