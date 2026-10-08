// StundTransfer: preview of a file on the download pages (eye icon), like on
// Drive or the NAS: videos and sounds are read straight from the server (the
// browser asks for the parts it needs, so it starts at once and can jump
// anywhere, even in a 60 GB rush), pictures are shown, texts are read.
import {
  ActionIcon,
  Box,
  Center,
  Loader,
  Modal,
  Stack,
  Text,
  ThemeIcon,
  Tooltip,
} from "@mantine/core";
import { useEffect, useState } from "react";
import { TbAlertTriangle, TbEye } from "react-icons/tb";
import useTranslate from "../hooks/useTranslate.hook";

export type PreviewKind = "video" | "audio" | "image" | "text";
export type PreviewFile = { name: string; url: string };

const KINDS: Record<PreviewKind, string[]> = {
  video: ["mp4", "m4v", "mov", "webm", "mkv", "ogv"],
  audio: ["mp3", "wav", "m4a", "aac", "ogg", "oga", "opus", "flac", "weba"],
  image: ["jpg", "jpeg", "png", "gif", "webp", "avif", "bmp"],
  text: [
    "txt",
    "md",
    "srt",
    "vtt",
    "ass",
    "csv",
    "json",
    "log",
    "xml",
    "yml",
    "yaml",
    "ini",
    "nfo",
    "lrc",
  ],
};

/** What the browser can show for this name, or null (no eye). */
export function previewKind(name: string): PreviewKind | null {
  const extension = name.split(".").pop()?.toLowerCase() ?? "";
  for (const kind of Object.keys(KINDS) as PreviewKind[])
    if (KINDS[kind].includes(extension)) return kind;
  return null;
}

// Texts: the beginning is enough to see what it is
const TEXT_BYTES = 1024 * 1024;

const TextContent = ({ url }: { url: string }) => {
  const t = useTranslate();
  const [text, setText] = useState<string | null>();
  const [cut, setCut] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    fetch(url, {
      headers: { Range: `bytes=0-${TEXT_BYTES - 1}` },
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error(String(response.status));
        const total = Number(
          response.headers.get("Content-Range")?.split("/")[1],
        );
        setCut(total > TEXT_BYTES);
        setText(await response.text());
      })
      .catch(() => !controller.signal.aborted && setText(null));
    return () => controller.abort();
  }, [url]);

  if (text === undefined)
    return (
      <Center py="xl">
        <Loader />
      </Center>
    );
  if (text === null) return <Unreadable />;
  return (
    <Stack spacing="xs">
      <Box
        component="pre"
        m={0}
        p="md"
        mah="65vh"
        sx={(theme) => ({
          overflowY: "auto",
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
          fontSize: theme.fontSizes.sm,
          borderRadius: theme.radius.md,
          backgroundColor:
            theme.colorScheme === "dark"
              ? theme.colors.dark[7]
              : theme.colors.gray[0],
        })}
      >
        {text}
      </Box>
      {cut && (
        <Text size="sm" color="dimmed" align="center">
          {t("stundtransfer.preview.text-cut")}
        </Text>
      )}
    </Stack>
  );
};

const Unreadable = () => {
  const t = useTranslate();
  return (
    <Stack align="center" spacing="sm" py="xl">
      <ThemeIcon size="3rem" radius="xl" variant="light" color="orange">
        <TbAlertTriangle size="1.6rem" />
      </ThemeIcon>
      <Text align="center">{t("stundtransfer.preview.unreadable")}</Text>
    </Stack>
  );
};

const MediaContent = ({
  kind,
  file,
}: {
  kind: PreviewKind;
  file: PreviewFile;
}) => {
  const [failed, setFailed] = useState(false);
  if (failed) return <Unreadable />;
  if (kind === "video")
    return (
      <video
        src={file.url}
        controls
        autoPlay
        playsInline
        onError={() => setFailed(true)}
        style={{
          display: "block",
          width: "100%",
          maxHeight: "75vh",
          background: "#000",
          borderRadius: 8,
        }}
      />
    );
  if (kind === "audio")
    return (
      <audio
        src={file.url}
        controls
        autoPlay
        onError={() => setFailed(true)}
        style={{ width: "100%" }}
      />
    );
  return (
    <Center>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={file.url}
        alt={file.name}
        onError={() => setFailed(true)}
        style={{ maxWidth: "100%", maxHeight: "75vh", borderRadius: 8 }}
      />
    </Center>
  );
};

/** Window of the preview; closing it stops the reading. */
export const PreviewModal = ({
  file,
  onClose,
}: {
  file?: PreviewFile;
  onClose: () => void;
}) => {
  const kind = file ? previewKind(file.name) : null;
  return (
    <Modal
      opened={!!file && !!kind}
      onClose={onClose}
      title={
        <Text weight={600} sx={{ wordBreak: "break-word" }}>
          {file?.name}
        </Text>
      }
      size={kind === "audio" ? "lg" : "70rem"}
      centered
      // Above the download card, the page blurred behind
      overlayProps={{ blur: 6, opacity: 0.45 }}
    >
      {file &&
        kind &&
        (kind === "text" ? (
          <TextContent url={file.url} />
        ) : (
          <MediaContent kind={kind} file={file} />
        ))}
    </Modal>
  );
};

/** Small grey eye, shown only for files the browser can show. */
export const PreviewButton = ({
  name,
  onClick,
}: {
  name: string;
  onClick: () => void;
}) => {
  const t = useTranslate();
  if (!previewKind(name)) return null;
  return (
    <Tooltip label={t("stundtransfer.preview.open")} withArrow>
      <ActionIcon
        variant="subtle"
        color="gray"
        aria-label={`${t("stundtransfer.preview.open")} ${name}`}
        onClick={onClick}
      >
        <TbEye size="1.1rem" />
      </ActionIcon>
    </Tooltip>
  );
};
