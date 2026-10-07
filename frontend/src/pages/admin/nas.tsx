// StundTransfer: share files and folders already on the NAS (admin only, see
// middleware /admin/*). A link downloads straight from the NAS, nothing is copied.
import {
  ActionIcon,
  Button,
  Group,
  Paper,
  Select,
  Stack,
  Text,
  Title,
  Tooltip,
} from "@mantine/core";
import { useEffect, useState } from "react";
import {
  TbCopy,
  TbFile,
  TbFolder,
  TbFolderShare,
  TbLink,
  TbTrash,
} from "react-icons/tb";
import { FormattedMessage, useIntl } from "react-intl";
import Meta from "../../components/Meta";
import CenterLoader from "../../components/core/CenterLoader";
import useTranslate from "../../hooks/useTranslate.hook";
import NasBrowser from "../../stundtransfer/NasBrowser";
import { formatSize } from "../../stundtransfer/depositFiles";
import stundTransferService, {
  NasLink,
  NasListing,
} from "../../stundtransfer/stundtransfer.service";
import toast from "../../utils/toast.util";

const EXPIRY_CHOICES = ["", "7", "30", "90"];

const NasSharePage = () => {
  const t = useTranslate();
  const intl = useIntl();
  const [rootName, setRootName] = useState<string>();
  const [listing, setListing] = useState<NasListing>();
  const [links, setLinks] = useState<NasLink[]>();
  const [expiry, setExpiry] = useState("");

  const open = (target: string) =>
    stundTransferService.listNas(target).then(setListing).catch(toast.axiosError);
  const refreshLinks = () =>
    stundTransferService.listNasLinks().then(setLinks).catch(toast.axiosError);

  useEffect(() => {
    stundTransferService
      .getDestination()
      .then((current) => {
        setRootName(current.rootName);
        if (current.enabled) open("");
      })
      .catch(toast.axiosError);
    refreshLinks();
  }, []);

  const linkUrl = (link: NasLink) => `${window.location.origin}/d/${link.token}`;
  const copy = (link: NasLink, message = t("stundtransfer.nas.copied")) =>
    navigator.clipboard
      .writeText(linkUrl(link))
      .then(() => toast.success(message))
      .catch(() => toast.success(linkUrl(link)));

  // `path`: file or folder relative to the mounted folder
  const create = (path: string) =>
    stundTransferService
      .createNasLink(path, expiry ? Number(expiry) : undefined)
      .then((link) => {
        copy(link, t("stundtransfer.nas.created"));
        refreshLinks();
      })
      .catch(toast.axiosError);

  const remove = (link: NasLink) =>
    stundTransferService
      .deleteNasLink(link.id)
      .then(() => {
        toast.success(t("stundtransfer.nas.deleted"));
        refreshLinks();
      })
      .catch(toast.axiosError);

  if (!rootName) return <CenterLoader />;
  const currentFolder = listing?.path ?? "";

  return (
    <>
      <Meta title={t("stundtransfer.nas.title")} />
      <Title order={3} mb="lg">
        <FormattedMessage id="stundtransfer.nas.title" />
      </Title>
      <Stack>
        <Paper withBorder radius="md" p="md">
          <NasBrowser
            rootLabel={rootName}
            listing={listing}
            onOpen={open}
            nameSortAtRoot
            headerActions={
              <>
                <Select
                  size="xs"
                  w={160}
                  label={t("stundtransfer.nas.expires")}
                  value={expiry}
                  onChange={(value) => setExpiry(value ?? "")}
                  data={EXPIRY_CHOICES.map((days) => ({
                    value: days,
                    label: days
                      ? t("stundtransfer.nas.expires.days", { days })
                      : t("stundtransfer.nas.expires.never"),
                  }))}
                />
                {/* The whole mounted folder is never shared */}
                <Button
                  size="xs"
                  leftIcon={<TbFolderShare />}
                  disabled={!currentFolder}
                  onClick={() => create(currentFolder)}
                >
                  <FormattedMessage id="stundtransfer.nas.link-folder" />
                </Button>
              </>
            }
            fileActions={(_file, path) => (
              <Button
                size="xs"
                variant="light"
                leftIcon={<TbLink />}
                onClick={() => create(path)}
              >
                <FormattedMessage id="stundtransfer.nas.create" />
              </Button>
            )}
          />
        </Paper>

        <Title order={4}>
          <FormattedMessage id="stundtransfer.nas.links" />
        </Title>
        {!links ? (
          <CenterLoader />
        ) : links.length === 0 ? (
          <Text color="dimmed" size="sm">
            <FormattedMessage id="stundtransfer.nas.no-links" />
          </Text>
        ) : (
          <Stack spacing="xs">
            {links.map((link) => (
              <Paper key={link.id} withBorder radius="md" p="sm">
                <Group position="apart" noWrap>
                  <Group spacing="sm" noWrap sx={{ minWidth: 0 }}>
                    {link.folder ? <TbFolder /> : <TbFile />}
                    <Stack spacing={0} sx={{ minWidth: 0 }}>
                      <Text size="sm" weight={600} truncate title={link.path}>
                        {link.name}
                      </Text>
                      <Text size="xs" color="dimmed">
                        {link.missing
                          ? t("stundtransfer.nas.missing")
                          : link.folder
                            ? t("stundtransfer.nas.folder")
                            : formatSize(link.size ?? 0, intl.locale)}
                        {" · "}
                        {t("stundtransfer.nas.downloads", { count: link.downloads })}
                        {" · "}
                        {link.expiresAt
                          ? t("stundtransfer.nas.until", {
                              date: intl.formatDate(link.expiresAt),
                            })
                          : t("stundtransfer.nas.expires.never")}
                      </Text>
                    </Stack>
                  </Group>
                  <Group spacing={4} noWrap>
                    <Tooltip label={t("stundtransfer.nas.copy")} withArrow>
                      <ActionIcon
                        variant="light"
                        aria-label={t("stundtransfer.nas.copy")}
                        onClick={() => copy(link)}
                      >
                        <TbCopy />
                      </ActionIcon>
                    </Tooltip>
                    <Tooltip label={t("stundtransfer.nas.delete")} withArrow>
                      <ActionIcon
                        color="red"
                        variant="light"
                        aria-label={t("stundtransfer.nas.delete")}
                        onClick={() => remove(link)}
                      >
                        <TbTrash />
                      </ActionIcon>
                    </Tooltip>
                  </Group>
                </Group>
              </Paper>
            ))}
          </Stack>
        )}
      </Stack>
    </>
  );
};

export default NasSharePage;
