// StundTransfer: public page of a link to a file on the NAS. The button is a
// plain link: the browser downloads the file itself (resumable, no memory used).
import { Button, Center, Paper, Stack, Text, Title } from "@mantine/core";
import { GetServerSidePropsContext } from "next";
import { useEffect, useState } from "react";
import { TbAlertTriangle, TbDownload, TbFile } from "react-icons/tb";
import { FormattedMessage, useIntl } from "react-intl";
import Meta from "../../components/Meta";
import CenterLoader from "../../components/core/CenterLoader";
import useTranslate from "../../hooks/useTranslate.hook";
import { formatSize } from "../../stundtransfer/depositFiles";
import stundTransferService, {
  NasPublicLink,
  nasDownloadUrl,
} from "../../stundtransfer/stundtransfer.service";

export function getServerSideProps(context: GetServerSidePropsContext) {
  return { props: { token: String(context.params?.token ?? "") } };
}

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
      <Meta title={t("stundtransfer.nas.page.title")} />
      <Center mt="xl">
        {link === undefined ? (
          <CenterLoader />
        ) : (
          <Paper withBorder radius="md" p="xl" w="100%" maw={560}>
            {link === null ? (
              <Stack align="center" spacing="sm">
                <TbAlertTriangle size={36} />
                <Text align="center">
                  <FormattedMessage id="stundtransfer.nas.page.invalid" />
                </Text>
              </Stack>
            ) : (
              <Stack align="center" spacing="md">
                <TbFile size={40} />
                <Title order={3} align="center" sx={{ wordBreak: "break-word" }}>
                  {link.name}
                </Title>
                <Text color="dimmed">{formatSize(link.size, intl.locale)}</Text>
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
            )}
          </Paper>
        )}
      </Center>
    </>
  );
};

export default NasDownloadPage;
