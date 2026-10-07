// StundTransfer: loads the deposit info of a page (public deposit or deposit
// link). A short error (429, 5xx, network) is retried: taken as "no deposit",
// it would show "Aucun dépôt ouvert" or Pingvin's classic upload page.
import { Center, Loader, LoadingOverlay, Stack, Text } from "@mantine/core";
import { AxiosError } from "axios";
import { useEffect, useState } from "react";
import { FormattedMessage } from "react-intl";
import Meta from "../components/Meta";
import useTranslate from "../hooks/useTranslate.hook";
import { LinkInfo } from "./stundtransfer.service";

// Then every 15 s
const RETRY_DELAYS_MS = [2000, 5000, 10000];
const LAST_RETRY_DELAY_MS = 15000;

/**
 * info: undefined while loading, null when there is no deposit (depositMode
 * false, or 404: invalid link). unreachable: the last try failed.
 */
export function useDepositInfo(load: () => Promise<LinkInfo>, key: string) {
  const [info, setInfo] = useState<LinkInfo | null>();
  const [unreachable, setUnreachable] = useState(false);

  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const attempt = (n: number) =>
      load()
        .then((result) => {
          if (stopped) return;
          setUnreachable(false);
          setInfo(result.depositMode ? result : null);
        })
        .catch((e: AxiosError) => {
          if (stopped) return;
          if (e?.response?.status === 404) return setInfo(null);
          setUnreachable(true);
          timer = setTimeout(
            () => attempt(n + 1),
            RETRY_DELAYS_MS[n] ?? LAST_RETRY_DELAY_MS,
          );
        });
    setInfo(undefined);
    setUnreachable(false);
    attempt(0);
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return { info, unreachable };
}

/** Shown while loading; says so when the server cannot be reached */
export const DepositInfoLoading = ({ unreachable }: { unreachable: boolean }) => {
  const t = useTranslate();
  return unreachable ? (
    <>
      {/* Retries can last: the tab gets a title instead of the address */}
      <Meta title={t("stundtransfer.page.title")} />
      <Center py="xl">
        <Stack align="center" spacing="xs">
          <Loader />
          <Text color="dimmed" size="sm">
            <FormattedMessage id="stundtransfer.connecting.retry" />
          </Text>
        </Stack>
      </Center>
    </>
  ) : (
    <LoadingOverlay visible />
  );
};
