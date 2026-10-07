// StundTransfer: public page of a link to a file or a folder on the NAS. The
// buttons are plain links: the browser downloads by itself (files can resume,
// no memory used).
import { Button, Center, Paper, Stack, Text, Title } from "@mantine/core";
import { GetServerSidePropsContext } from "next";
import { useEffect, useState } from "react";
import { TbAlertTriangle, TbDownload, TbFile, TbFileZip } from "react-icons/tb";
import { FormattedMessage, useIntl } from "react-intl";
import Meta from "../../components/Meta";
import CenterLoader from "../../components/core/CenterLoader";
import useTranslate from "../../hooks/useTranslate.hook";
import NasBrowser from "../../stundtransfer/NasBrowser";
import { formatSize } from "../../stundtransfer/depositFiles";
import stundTransferService, {
  NasListing,
  NasPublicLink,
  nasDownloadUrl,
  nasZipUrl,
} from "../../stundtransfer/stundtransfer.service";
import toast from "../../utils/toast.util";

export function getServerSideProps(context: GetServerSidePropsContext) {
  return { props: { token: String(context.params?.token ?? "") } };
}

const FolderLink = ({ token, name }: { token: string; name: string }) => {
  const t = useTranslate();
  const [listing, setListing] = useState<NasListing>();
  const open = (path: string) =>
    stundTransferService.listNasPublic(token, path).then(setListing).catch(toast.axiosError);
  useEffect(() => {
    open("");
  }, [token]);

  return (
    <Paper withBorder radius="md" p="md" w="100%">
      <NasBrowser
        rootLabel={name}
        listing={listing}
        onOpen={open}
        headerActions={
          <Button
            size="xs"
            component="a"
            href={nasZipUrl(token, listing?.path)}
            leftIcon={<TbFileZip />}
          >
            <FormattedMessage id="stundtransfer.nas.download-all" />
          </Button>
        }
        fileActions={(_file, path) => (
          <Button
            size="xs"
            variant="light"
            component="a"
            href={nasDownloadUrl(token, path)}
            leftIcon={<TbDownload />}
            aria-label={t("stundtransfer.nas.download")}
          >
            <FormattedMessage id="stundtransfer.nas.download" />
          </Button>
        )}
      />
      <Text size="xs" color="dimmed" mt="md">
        <FormattedMessage id="stundtransfer.nas.page.folder-help" />
      </Text>
    </Paper>
  );
};

const NasDownloadPage = ({ token }: { token: string }) => {
  const t = useTranslate();
  const intl = useIntl();
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
      <Center mt="xl">
        {link === undefined ? (
          <CenterLoader />
        ) : link === null ? (
          <Paper withBorder radius="md" p="xl" w="100%" maw={560}>
            <Stack align="center" spacing="sm">
              <TbAlertTriangle size={36} />
              <Text align="center">
                <FormattedMessage id="stundtransfer.nas.page.invalid" />
              </Text>
            </Stack>
          </Paper>
        ) : link.folder ? (
          <FolderLink token={token} name={link.name} />
        ) : (
          <Paper withBorder radius="md" p="xl" w="100%" maw={560}>
            <Stack align="center" spacing="md">
              <TbFile size={40} />
              <Title order={3} align="center" sx={{ wordBreak: "break-word" }}>
                {link.name}
              </Title>
              <Text color="dimmed">{formatSize(link.size ?? 0, intl.locale)}</Text>
              <Button
                component="a"
                href={nasDownloadUrl(token)}
                size="lg"
                leftIcon={<TbDownload />}
              >
                <FormattedMessage id="stundtransfer.nas.download" />
              </Button>
              {link.expiresAt && (
                <Text size="sm" color="dimmed">
                  {t("stundtransfer.nas.until", {
                    date: intl.formatDate(link.expiresAt),
                  })}
                </Text>
              )}
              <Text size="xs" color="dimmed" align="center">
                <FormattedMessage id="stundtransfer.nas.page.resume" />
              </Text>
            </Stack>
          </Paper>
        )}
      </Center>
    </>
  );
};

export default NasDownloadPage;
