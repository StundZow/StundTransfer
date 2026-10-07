// StundTransfer: install the newest StundTransfer image in one click (admin
// only, see middleware /admin/*). The button drops a request that a DSM
// scheduled task picks up within a minute; this page then waits until the
// new version answers.
import { Alert, Badge, Button, Group, Loader, Paper, Stack, Text, Title } from "@mantine/core";
import { useEffect, useRef, useState } from "react";
import { TbAlertTriangle, TbCheck, TbCloudDownload, TbRefresh } from "react-icons/tb";
import { useIntl } from "react-intl";
import Meta from "../../components/Meta";
import CenterLoader from "../../components/core/CenterLoader";
import useTranslate from "../../hooks/useTranslate.hook";
import stundTransferService, { UpdateStatus } from "../../stundtransfer/stundtransfer.service";
import toast from "../../utils/toast.util";

// Waiting longer than this: the DSM task is probably missing or disabled
const GIVE_UP_MS = 5 * 60 * 1000;

const UpdatePage = () => {
  const t = useTranslate();
  const intl = useIntl();
  const [status, setStatus] = useState<UpdateStatus>();
  const [phase, setPhase] = useState<"idle" | "waiting" | "done" | "timeout">("idle");
  const target = useRef<string>();

  const [checking, setChecking] = useState(false);
  // Asks GitHub again now (otherwise the server checks at most every few minutes)
  const check = (fresh: boolean) => {
    setChecking(true);
    return stundTransferService
      .getUpdateStatus(fresh)
      .then(setStatus)
      .catch(toast.axiosError)
      .finally(() => setChecking(false));
  };

  useEffect(() => {
    check(false);
  }, []);

  // After the click: the server restarts in between, so errors are expected
  useEffect(() => {
    if (phase !== "waiting") return;
    const started = Date.now();
    const timer = setInterval(() => {
      stundTransferService
        .getUpdateStatus()
        .then((current) => {
          setStatus(current);
          if (current.current?.sha && current.current.sha === target.current) setPhase("done");
        })
        .catch(() => undefined);
      if (Date.now() - started > GIVE_UP_MS) setPhase((p) => (p === "waiting" ? "timeout" : p));
    }, 5000);
    return () => clearInterval(timer);
  }, [phase]);

  const update = () => {
    target.current = status?.latest?.sha;
    stundTransferService
      .requestUpdate()
      .then((current) => {
        setStatus(current);
        setPhase("waiting");
      })
      .catch((e) =>
        e?.response?.data?.error === "stund_updater_unreachable"
          ? toast.error(t("stundtransfer.update.unreachable"))
          : toast.axiosError(e),
      );
  };

  if (!status) return <CenterLoader />;

  const version = (v: { sha: string; date: string | null } | null) =>
    v
      ? `${v.date ? intl.formatDate(v.date, { dateStyle: "medium", timeStyle: "short" }) : ""} (${v.sha.slice(0, 7)})`.trim()
      : "?";

  return (
    <>
      <Meta title={t("stundtransfer.update.title")} />
      <Title order={3} mb="lg">
        {t("stundtransfer.update.title")}
      </Title>
      <Paper withBorder radius="md" p="xl" maw="40rem">
        <Stack spacing="md">
          <Group position="apart">
            {!status.current ? (
              <Badge color="gray" size="lg" sx={{ textTransform: "none" }}>
                {t("stundtransfer.update.unknown")}
              </Badge>
            ) : status.available ? (
              <Badge color="orange" size="lg" sx={{ textTransform: "none" }}>
                {t("stundtransfer.update.available")}
              </Badge>
            ) : (
              <Badge color="green" size="lg" sx={{ textTransform: "none" }}>
                {t("stundtransfer.update.up-to-date")}
              </Badge>
            )}
            <Button
              size="xs"
              variant="light"
              leftIcon={<TbRefresh />}
              loading={checking}
              disabled={phase === "waiting"}
              onClick={() => check(true)}
            >
              {t("stundtransfer.update.check")}
            </Button>
          </Group>
          <Stack spacing={4}>
            <Text>{t("stundtransfer.update.installed", { version: version(status.current) })}</Text>
            <Text>{t("stundtransfer.update.latest", { version: version(status.latest) })}</Text>
          </Stack>

          {phase === "idle" && (
            <Group>
              <Button
                size="md"
                leftIcon={<TbCloudDownload />}
                disabled={!status.available}
                onClick={update}
              >
                {t("stundtransfer.update.button")}
              </Button>
            </Group>
          )}
          {phase === "waiting" && (
            <Alert icon={<Loader size="sm" />} variant="light">
              {t("stundtransfer.update.waiting")}
            </Alert>
          )}
          {phase === "done" && (
            <Alert icon={<TbCheck />} color="green" variant="light">
              <Stack spacing="xs" align="flex-start">
                <Text>{t("stundtransfer.update.done")}</Text>
                <Button size="xs" leftIcon={<TbRefresh />} onClick={() => window.location.reload()}>
                  {t("stundtransfer.update.reload")}
                </Button>
              </Stack>
            </Alert>
          )}
          {phase === "timeout" && (
            <Alert icon={<TbAlertTriangle />} color="orange" variant="light">
              {t("stundtransfer.update.timeout")}
            </Alert>
          )}

          {status.checkFailed && (
            <Text size="sm" color="dimmed">
              {t("stundtransfer.update.check-failed")}
            </Text>
          )}
          {status.lastLog && (
            <Text size="sm" color="dimmed">
              {t("stundtransfer.update.last", { log: status.lastLog })}
            </Text>
          )}
        </Stack>
      </Paper>
    </>
  );
};

export default UpdatePage;
