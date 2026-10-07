// StundTransfer: public page of a link to a file or a folder on the NAS. A
// card in the middle of the screen: what was received, a big download button
// and, for a folder, its content with the size of each item. Buttons are plain
// links: the browser downloads by itself (files can resume, no memory used).
import {
  ActionIcon,
  Anchor,
  Badge,
  Box,
  Breadcrumbs,
  Button,
  Center,
  Group,
  Paper,
  Stack,
  Text,
  ThemeIcon,
  Title,
  Tooltip,
  UnstyledButton,
} from "@mantine/core";
import { GetServerSidePropsContext } from "next";
import { ReactNode, useEffect, useMemo, useState } from "react";
import {
  TbAlertTriangle,
  TbArrowLeft,
  TbDownload,
  TbFile,
  TbFolder,
} from "react-icons/tb";
import { useIntl } from "react-intl";
import Meta from "../../components/Meta";
import CenterLoader from "../../components/core/CenterLoader";
import useTranslate from "../../hooks/useTranslate.hook";
import { formatSize } from "../../stundtransfer/depositFiles";
import stundTransferService, {
  NasPublicLink,
  NasPublicListing,
  nasDownloadUrl,
  nasZipUrl,
} from "../../stundtransfer/stundtransfer.service";
import toast from "../../utils/toast.util";

export function getServerSideProps(context: GetServerSidePropsContext) {
  return { props: { token: String(context.params?.token ?? "") } };
}

const badgeStyle = { textTransform: "none" as const, fontWeight: 500 };

/** One line of the content: name on the left, size and a small download icon on the right. */
const Row = ({
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

/** Content of a folder link: sub-folders (opened in place) then files, by name. */
const FolderContent = ({ token, rootName }: { token: string; rootName: string }) => {
  const t = useTranslate();
  const intl = useIntl();
  const [listing, setListing] = useState<NasPublicListing>();
  const open = (path: string) =>
    stundTransferService.listNasPublic(token, path).then(setListing).catch(toast.axiosError);
  useEffect(() => {
    open("");
  }, [token]);

  const sorted = useMemo(() => {
    const byName = (a: { name: string }, b: { name: string }) =>
      a.name.localeCompare(b.name, intl.locale, { numeric: true });
    return {
      folders: [...(listing?.folders ?? [])].sort(byName),
      files: [...(listing?.files ?? [])].sort(byName),
    };
  }, [listing, intl.locale]);

  const parts = (listing?.path ?? "").split("/").filter(Boolean);
  const size = (bytes: number, complete = true) =>
    `${complete ? "" : "≥ "}${formatSize(bytes, intl.locale)}`;

  return (
    <Box
      px="lg"
      py="md"
      sx={(theme) => ({
        borderTop: `1px solid ${
          theme.colorScheme === "dark" ? theme.colors.dark[4] : theme.colors.gray[2]
        }`,
        backgroundColor:
          theme.colorScheme === "dark" ? theme.colors.dark[7] : theme.colors.gray[0],
      })}
    >
      <Group spacing={6} mb="xs" noWrap>
        {parts.length > 0 && (
          <ActionIcon
            variant="subtle"
            aria-label={t("stundtransfer.nas.page.back")}
            onClick={() => open(parts.slice(0, -1).join("/"))}
          >
            <TbArrowLeft />
          </ActionIcon>
        )}
        <Breadcrumbs separator="›" sx={{ flexWrap: "wrap", minWidth: 0 }}>
          {[rootName, ...parts].map((name, i) => (
            <Anchor
              key={i}
              component="button"
              type="button"
              size="sm"
              weight={600}
              color={i === parts.length ? "dimmed" : undefined}
              onClick={() => open(parts.slice(0, i).join("/"))}
            >
              {name}
            </Anchor>
          ))}
        </Breadcrumbs>
      </Group>

      {!listing ? (
        <CenterLoader />
      ) : sorted.folders.length + sorted.files.length === 0 ? (
        <Text color="dimmed" size="sm" align="center" py="sm">
          {t("stundtransfer.nas.empty")}
        </Text>
      ) : (
        <Stack spacing={2} mah="45vh" sx={{ overflowY: "auto" }}>
          {sorted.folders.map((folder) => {
            const path = [...parts, folder.name].join("/");
            return (
              <Row
                key={`d:${folder.name}`}
                icon={<TbFolder size="1.2rem" />}
                name={folder.name}
                size={size(folder.size, folder.complete)}
                href={nasZipUrl(token, path)}
                onOpen={() => open(path)}
              />
            );
          })}
          {sorted.files.map((file) => (
            <Row
              key={`f:${file.name}`}
              icon={<TbFile size="1.2rem" />}
              name={file.name}
              size={size(file.size)}
              href={nasDownloadUrl(token, [...parts, file.name].join("/"))}
            />
          ))}
        </Stack>
      )}
    </Box>
  );
};

const DownloadCard = ({ token, link }: { token: string; link: NasPublicLink }) => {
  const t = useTranslate();
  const intl = useIntl();
  return (
    <Paper withBorder shadow="md" radius="lg" w="100%" maw="48rem" sx={{ overflow: "hidden" }}>
      <Stack align="center" spacing="sm" px="xl" pt="2.5rem" pb="xl">
        <ThemeIcon size="4.5rem" radius="xl" variant="light">
          {link.folder ? <TbFolder size="2.4rem" /> : <TbFile size="2.4rem" />}
        </ThemeIcon>
        <Text size="sm" color="dimmed">
          {t(
            link.folder
              ? "stundtransfer.nas.page.received-folder"
              : "stundtransfer.nas.page.received-file",
          )}
        </Text>
        <Title order={2} align="center" sx={{ wordBreak: "break-word" }}>
          {link.name}
        </Title>
        <Group spacing="xs" position="center">
          {link.folder && (
            <Badge size="lg" radius="sm" color="gray" variant="light" sx={badgeStyle}>
              {t("stundtransfer.nas.page.files", { count: link.fileCount })}
            </Badge>
          )}
          <Badge size="lg" radius="sm" color="gray" variant="light" sx={badgeStyle}>
            {`${link.complete ? "" : "≥ "}${formatSize(link.size, intl.locale)}`}
          </Badge>
          {link.expiresAt && (
            <Badge size="lg" radius="sm" color="orange" variant="light" sx={badgeStyle}>
              {t("stundtransfer.nas.until", { date: intl.formatDate(link.expiresAt) })}
            </Badge>
          )}
        </Group>
        <Button
          component="a"
          href={link.folder ? nasZipUrl(token) : nasDownloadUrl(token)}
          size="xl"
          radius="md"
          mt="md"
          miw="18rem"
          leftIcon={<TbDownload size="1.5rem" />}
        >
          {t(link.folder ? "stundtransfer.nas.page.download-all" : "stundtransfer.nas.download")}
        </Button>
      </Stack>
      {link.folder && <FolderContent token={token} rootName={link.name} />}
    </Paper>
  );
};

const NasDownloadPage = ({ token }: { token: string }) => {
  const t = useTranslate();
  const [link, setLink] = useState<NasPublicLink | null>();

  useEffect(() => {
    stundTransferService
      .getNasLink(token)
      .then(setLink)
      .catch(() => setLink(null));
  }, [token]);

  return (
    <>
      <Meta title={link?.name ?? t("stundtransfer.nas.page.title")} />
      {/* Centred in the free height of the screen (header and footer apart) */}
      <Center py="xl" sx={{ minHeight: "calc(100vh - 11rem)" }}>
        {link === undefined ? (
          <CenterLoader />
        ) : link === null ? (
          <Paper withBorder shadow="md" radius="lg" p="xl" w="100%" maw="32rem">
            <Stack align="center" spacing="sm">
              <ThemeIcon size="3.5rem" radius="xl" variant="light" color="orange">
                <TbAlertTriangle size="1.8rem" />
              </ThemeIcon>
              <Text align="center">{t("stundtransfer.nas.page.invalid")}</Text>
            </Stack>
          </Paper>
        ) : (
          <DownloadCard token={token} link={link} />
        )}
      </Center>
    </>
  );
};

export default NasDownloadPage;
