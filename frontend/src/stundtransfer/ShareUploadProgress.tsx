// StundTransfer: big progress bar of the share upload page, like the deposit
// page: percent of everything, sent / total, speed and time left for all the
// files (speed measured over the last seconds).
import { Alert, Group, Progress, Stack, Text, Title } from "@mantine/core";
import { useEffect, useRef, useState } from "react";
import { TbInfoCircle, TbPlugConnectedX } from "react-icons/tb";
import { useIntl } from "react-intl";
import useTranslate from "../hooks/useTranslate.hook";
import { FileUpload } from "../types/File.type";
import { formatDuration, formatSize } from "./depositFiles";

// Speed over this window: steady, but follows a change of connection
const SPEED_WINDOW_MS = 10_000;

const ShareUploadProgress = ({ files }: { files: FileUpload[] }) => {
  const t = useTranslate();
  const intl = useIntl();
  const size = (bytes: number) => formatSize(bytes, intl.locale);

  const total = files.reduce((sum, file) => sum + file.size, 0);
  // uploadingProgress: percent of each file, -1 while it is retried
  const sent = files.reduce(
    (sum, file) => sum + (file.size * Math.min(100, Math.max(0, file.uploadingProgress))) / 100,
    0,
  );
  const done = files.filter((file) => file.uploadingProgress >= 100).length;
  const retrying = files.some((file) => file.uploadingProgress === -1);
  const percent = total > 0 ? (sent / total) * 100 : 100;

  const samples = useRef<{ at: number; sent: number }[]>([]);
  const [speed, setSpeed] = useState(0);
  useEffect(() => {
    const now = Date.now();
    const list = samples.current;
    // A file started again from the beginning: measure afresh
    if (list.length > 0 && sent < list[list.length - 1].sent) list.length = 0;
    list.push({ at: now, sent });
    while (list.length > 2 && now - list[0].at > SPEED_WINDOW_MS) list.shift();
    const span = now - list[0].at;
    if (span >= 1000) setSpeed(Math.max(0, ((sent - list[0].sent) / span) * 1000));
  }, [sent]);

  const secondsLeft = speed > 0 ? (total - sent) / speed : undefined;

  return (
    <Stack spacing="sm" my="xl">
      <Title order={3}>{t("stundtransfer.upload.title")}</Title>
      <Progress value={percent} size="xl" radius="xl" striped animate={percent < 100} />
      <Group position="apart">
        <Text weight={700} size="lg">
          {Math.floor(percent)} %
        </Text>
        <Text size="sm" color="dimmed">
          {t("stundtransfer.upload.progress", { sent: size(sent), total: size(total) })}
          {" · "}
          {t("stundtransfer.upload.speed", { speed: size(speed) })}
          {" · "}
          {t("stundtransfer.upload.eta", { eta: formatDuration(secondsLeft) })}
        </Text>
      </Group>
      {files.length > 1 && (
        <Text size="sm">
          {t("stundtransfer.upload.files", { done, total: files.length })}
        </Text>
      )}
      {retrying && (
        <Alert color="orange" icon={<TbPlugConnectedX />}>
          {t("stundtransfer.upload.reconnecting")}
        </Alert>
      )}
      <Alert color="blue" variant="light" icon={<TbInfoCircle />}>
        {t("stundtransfer.upload.keep-open")}
      </Alert>
    </Stack>
  );
};

export default ShareUploadProgress;
