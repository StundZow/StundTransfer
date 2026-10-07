// StundTransfer: share files already on the NAS (admin only, see middleware /admin/*).
// A link downloads the file straight from the NAS, nothing is copied.
import {
  ActionIcon,
  Alert,
  Anchor,
  Breadcrumbs,
  Button,
  Group,
  Paper,
  Select,
  Stack,
  Text,
  Title,
  Tooltip,
  UnstyledButton,
} from "@mantine/core";
import { useEffect, useState } from "react";
import { TbCopy, TbFile, TbFolder, TbInfoCircle, TbLink, TbTrash } from "react-icons/tb";
import { FormattedMessage, useIntl } from "react-intl";
import Meta from "../../components/Meta";
import CenterLoader from "../../components/core/CenterLoader";
import useTranslate from "../../hooks/useTranslate.hook";
import { formatSize } from "../../stundtransfer/depositFiles";
import stundTransferService, {
  NasLink,
  NasListing,
} from "../../stundtransfer/stundtransfer.service";
import toast from "../../utils/toast.util";

const EXPIRY_CHOICES = ["", "7", "30", "90"];

const rowStyle = (theme: any) => ({
  padding: "6px 8px",
  borderRadius: theme.radius.sm,
  "&:hover": {
    backgroundColor:
      theme.colorScheme === "dark" ? theme.colors.dark[5] : theme.colors.gray[1],
  },
});

const NasSharePage = () => {
  const t = useTranslate();
  const intl = useIntl();
  const [rootName, setRootName] = useState<string>();
  const [listing, setListing] = useState<NasListing>();
  const [links, setLinks] = useState<NasLink[]>();
  const [expiry, setExpiry] = useState("");
  const size = (bytes: number) => formatSize(bytes, intl.locale);

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

  const create = (file: string) =>
    stundTransferService
      .createNasLink(
        [...(listing?.path ? [listing.path] : []), file].join("/"),
        expiry ? Number(expiry) : undefined,
      )
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
  const parts = (listing?.path ?? "").split("/").filter(Boolean);

  return (
    <>
      <Meta title={t("stundtransfer.nas.title")} />
      <Title order={3} mb="lg">
        <FormattedMessage id="stundtransfer.nas.title" />
      </Title>
      <Stack>
        <Alert icon={<TbInfoCircle />} variant="light">
          <FormattedMessage id="stundtransfer.nas.help" />
        </Alert>

        <Paper withBorder radius="md" p="md">
          <Group position="apart" mb="sm">
            <Breadcrumbs separator="›">
              {[rootName, ...parts].map((name, i) => (
                <Anchor
                  key={i}
                  component="button"
                  type="button"
                  onClick={() => open(parts.slice(0, i).join("/"))}
                >
                  {name}
                </Anchor>
              ))}
            </Breadcrumbs>
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
          </Group>

          {!listing ? (
            <CenterLoader />
          ) : listing.folders.length + listing.files.length === 0 ? (
            <Text color="dimmed" size="sm" py="md">
              <FormattedMessage id="stundtransfer.nas.empty" />
            </Text>
          ) : (
            <Stack spacing={2} mah={480} sx={{ overflowY: "auto" }}>
              {listing.folders.map((folder) => (
                <UnstyledButton
                  key={`d:${folder}`}
                  onClick={() => open([...parts, folder].join("/"))}
                  sx={rowStyle}
                >
                  <Group spacing="xs" noWrap>
                    <TbFolder />
                    <Text size="sm" truncate>
                      {folder}
                    </Text>
                  </Group>
                </UnstyledButton>
              ))}
              {listing.files.map((file) => (
                <Group key={`f:${file.name}`} position="apart" noWrap sx={rowStyle}>
                  <Group spacing="xs" noWrap sx={{ minWidth: 0 }}>
                    <TbFile />
                    <Text size="sm" truncate>
                      {file.name}
                    </Text>
                  </Group>
                  <Group spacing="xs" noWrap>
                    <Text size="xs" color="dimmed" sx={{ whiteSpace: "nowrap" }}>
                      {size(file.size)}
                    </Text>
                    <Button
                      size="xs"
                      variant="light"
                      leftIcon={<TbLink />}
                      onClick={() => create(file.name)}
                    >
                      <FormattedMessage id="stundtransfer.nas.create" />
                    </Button>
                  </Group>
                </Group>
              ))}
            </Stack>
          )}
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
                  <Stack spacing={0} sx={{ minWidth: 0 }}>
                    <Text size="sm" weight={600} truncate title={link.path}>
                      {link.name}
                    </Text>
                    <Text size="xs" color="dimmed">
                      {link.size === null
                        ? t("stundtransfer.nas.missing")
                        : size(link.size)}
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
