// StundTransfer: deposit page. The uploader says who they are and which video
// it is for, drops files or folders, and gets "Reçu, merci !". No account,
// no share link, no download page.
import {
  Alert,
  Button,
  Center,
  Group,
  Loader,
  Paper,
  Progress,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
  ThemeIcon,
  Title,
} from "@mantine/core";
import { useModals } from "@mantine/modals";
import { showNotification } from "@mantine/notifications";
import { AxiosError } from "axios";
import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  TbAlertTriangle,
  TbCircleCheck,
  TbInfoCircle,
  TbPlugConnectedX,
  TbRefresh,
  TbX,
} from "react-icons/tb";
import { FormattedMessage, useIntl } from "react-intl";
import Meta from "../components/Meta";
import useConfig from "../hooks/config.hook";
import useConfirmLeave from "../hooks/confirm-leave.hook";
import useTranslate from "../hooks/useTranslate.hook";
import toast from "../utils/toast.util";
import DepositDropzone from "./DepositDropzone";
import SelectedFileRow from "./SelectedFileRow";
import {
  SelectedFile,
  automaticNames,
  baseName,
  batches,
  effectiveName,
  effectivePath,
  fileKey,
  formatDuration,
  formatSize,
  freePath,
  renamedPath,
  resumeMemory,
  resumePaths,
  selectFiles,
} from "./depositFiles";
import stundTransferService, {
  DepositFileState,
  DepositSession,
  DepositState,
  LinkInfo,
} from "./stundtransfer.service";
import {
  DepositUploader,
  UploadItem,
  UploadProgress,
  chunkLength,
  toFatalError,
} from "./uploader";

const BATCH_SIZE = 250;
// Well under the server's 100 KB limit for a JSON body, even with long paths
const BATCH_MAX_BYTES = 64 * 1000;
// Server limit per deposit
const MAX_FILES = 100000;
const FILE_PREVIEW_COUNT = 300;
const DONE_PREVIEW_COUNT = 20;

type Phase =
  | { name: "checking" }
  // notice: what happened to the previous upload (text id)
  | { name: "form"; notice?: string }
  | {
      name: "resume";
      state: DepositState;
      session: DepositSession;
      // New names saved before the interruption, by path
      names?: Record<string, string>;
    }
  | { name: "preparing" }
  | { name: "uploading" }
  | { name: "finishing" }
  | { name: "done"; paths: string[]; totalSize: number }
  | { name: "error"; code: string; values?: Record<string, string> };

// The upload can be cancelled in these phases
const CANCELLABLE: Phase["name"][] = ["preparing", "uploading"];

const total = (values: number[]) => values.reduce((a, b) => a + b, 0);

const showInfo = (message: string) =>
  showNotification({
    icon: <TbInfoCircle />,
    color: "blue",
    radius: "md",
    message,
    autoClose: 10000,
  });

/**
 * Retries calls failing because of the network; errors that will not go away
 * are thrown. `onWait` shows "connection lost" between tries, `stopped` ends
 * the tries (upload cancelled).
 */
async function withNetworkRetry<T>(
  call: () => Promise<T>,
  { onWait, stopped }: { onWait: (waiting: boolean) => void; stopped: () => boolean },
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    if (stopped()) throw new Error("Upload cancelled");
    try {
      const result = await call();
      onWait(false);
      return result;
    } catch (e) {
      if (toFatalError(e) || attempt >= 30) {
        onWait(false);
        throw e;
      }
      onWait(true);
      await new Promise((resolve) =>
        setTimeout(resolve, Math.min(30000, 1000 * 2 ** Math.min(attempt, 5))),
      );
    }
  }
}

// token: deposit link; undefined for the public deposit of the home page
const DepositPage = ({ token, info }: { token?: string; info: LinkInfo }) => {
  const memoryKey = token ?? "public";
  const t = useTranslate();
  const intl = useIntl();
  const humanSize = (bytes: number) => formatSize(bytes, intl.locale);
  const config = useConfig();
  // Examples of the two fields (Paramètres > StundTransfer), translated text otherwise
  const placeholder = (key: string, fallback: string) => {
    try {
      return config.get(key) || t(fallback);
    } catch {
      return t(fallback);
    }
  };
  const [phase, setPhaseState] = useState<Phase>({ name: "checking" });
  // Read by the cancel window, which can stay open while the upload goes on
  const phaseRef = useRef(phase);
  const setPhase = (next: Phase) => {
    phaseRef.current = next;
    setPhaseState(next);
  };
  const [uploaderName, setUploaderName] = useState("");
  const [videoName, setVideoName] = useState("");
  const [selected, setSelected] = useState<SelectedFile[]>([]);
  const [ignored, setIgnored] = useState(0);
  const [progress, setProgress] = useState<UploadProgress>();
  // A call before or after the chunks is being retried (network or server down)
  const [retrying, setRetrying] = useState(false);
  const modals = useModals();
  const cancelModal = useRef<string>();
  const uploader = useRef<DepositUploader>();
  // Deposit being uploaded
  const currentSession = useRef<DepositSession>();
  // Each send or resume gets a number: a cancelled one stops quietly
  const runId = useRef(0);
  const wakeLock = useRef<{ release: () => Promise<void> }>();

  const busy = ["preparing", "uploading", "finishing"].includes(phase.name);
  useConfirmLeave({
    message: t("stundtransfer.upload.confirm-leave"),
    enabled: busy,
  });

  const maxSize = info.maxSize ?? 0;
  const selectedSize = useMemo(() => total(selected.map((f) => f.size)), [selected]);
  const selectedByKey = useMemo(
    () => new Map(selected.map((f) => [fileKey(f.path, f.size), f])),
    [selected],
  );
  const fieldsFilled = uploaderName.trim() !== "" && videoName.trim() !== "";
  // "2026-07-22 14-32-10.mkv" -> "Stund - Beamng 1.mkv", updated while typing
  // but after the fields: typing stays fluid with hundreds of files
  const namingUploader = useDeferredValue(uploaderName);
  const namingVideo = useDeferredValue(videoName);
  const autoNames = useMemo(
    () => automaticNames(selected, namingUploader, namingVideo),
    [selected, namingUploader, namingVideo],
  );

  useEffect(() => {
    checkInterruptedUpload();
    return () => {
      runId.current++;
      uploader.current?.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Nothing to cancel anymore (received, failed): close the cancel window
  useEffect(() => {
    if (CANCELLABLE.includes(phase.name) || !cancelModal.current) return;
    modals.closeModal(cancelModal.current);
    cancelModal.current = undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase.name]);

  // Keep the screen awake while uploading (the lock is lost when the tab is hidden)
  useEffect(() => {
    const acquire = async () => {
      try {
        wakeLock.current = await (navigator as any).wakeLock?.request("screen");
      } catch {
        // Not supported or refused: the upload works anyway
      }
    };
    const release = () => {
      wakeLock.current?.release().catch(() => undefined);
      wakeLock.current = undefined;
    };
    if (!busy) return release();
    acquire();
    const onVisible = () => document.visibilityState === "visible" && acquire();
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [busy]);

  // An upload interrupted by a reload or a closed tab can be resumed
  const checkInterruptedUpload = async () => {
    setPhase({ name: "checking" });
    const saved = resumeMemory.load(memoryKey);
    if (!saved) return setPhase({ name: "form" });
    try {
      const state = await stundTransferService.getDeposit(saved);
      if (state.status !== "UPLOADING") {
        resumeMemory.clear(memoryKey);
        return setPhase({
          name: "form",
          // Cancelled by the uploader, an administrator or for inactivity
          notice:
            state.status === "CANCELLED" ? "stundtransfer.resume.cancelled" : undefined,
        });
      }
      if (state.files.length < state.fileCount) {
        // Cut while the file list was being sent (reload, closed tab): no chunk
        // was sent yet, and it could never be completed
        stundTransferService.cancelDeposit(saved).catch(() => undefined);
        resumeMemory.clear(memoryKey);
        return setPhase({ name: "form", notice: "stundtransfer.resume.incomplete" });
      }
      setUploaderName(state.uploaderName);
      setVideoName(state.videoName);
      setPhase({
        name: "resume",
        state,
        session: {
          depositId: state.depositId,
          secret: saved.secret,
          chunkSize: state.chunkSize,
          parallelUploads: state.parallelUploads,
        },
        names: saved.names,
      });
    } catch (e) {
      // Deposit deleted or key refused: nothing to resume (kept if the server is down)
      const status = (e as AxiosError)?.response?.status;
      if (status === 403 || status === 404) resumeMemory.clear(memoryKey);
      setPhase({ name: "form" });
    }
  };

  const addFiles = (files: File[]) => {
    const { kept, ignored: skipped } = selectFiles(files);
    // Same path, size and date: the same file added twice
    const identity = (f: SelectedFile) =>
      `${f.size}:${f.lastModified}:${f.droppedPath ?? f.path}`;
    const known = new Set(selected.map(identity));
    const taken = new Set(selected.map((f) => f.path));
    // Resume: only the files of the interrupted deposit, with their paths there
    const expected = phase.name === "resume" ? resumePaths(phase.state.files) : undefined;
    const fresh: SelectedFile[] = [];
    const duplicates: string[] = [];
    const renamed: SelectedFile[] = [];
    const extra: string[] = [];
    for (const file of kept) {
      if (known.has(identity(file))) {
        duplicates.push(file.path);
        continue;
      }
      // Another file with the same path (e.g. C0001.MP4 of a second card): both are kept
      const path = expected
        ? expected.get(fileKey(file.path, file.size))?.find((p) => !taken.has(p))
        : freePath(file.path, taken);
      if (!path) {
        extra.push(file.path);
        continue;
      }
      known.add(identity(file));
      taken.add(path);
      if (path === file.path) fresh.push(file);
      else {
        const numbered = { ...file, path, droppedPath: file.path };
        fresh.push(numbered);
        if (!expected) renamed.push(numbered);
      }
    }
    if (duplicates.length > 0)
      toast.error(
        t("stundtransfer.files.duplicate", {
          name:
            duplicates.length > 1
              ? `${duplicates[0]} (+${duplicates.length - 1})`
              : duplicates[0],
        }),
      );
    if (selected.length + fresh.length > MAX_FILES) {
      toast.error(t("stundtransfer.files.too-many", { max: MAX_FILES }));
      return;
    }
    if (
      phase.name === "form" &&
      maxSize > 0 &&
      selectedSize + total(fresh.map((f) => f.size)) > maxSize
    ) {
      toast.error(t("stundtransfer.files.too-big", { maxSize: humanSize(maxSize) }));
      return;
    }
    if (renamed.length > 0)
      showInfo(
        t("stundtransfer.files.renamed", {
          count: renamed.length,
          name: renamed[0].droppedPath,
          newName: renamed[0].path,
        }),
      );
    if (extra.length > 0)
      showInfo(t("stundtransfer.resume.extra", { count: extra.length, name: extra[0] }));
    setIgnored((count) => count + skipped);
    setSelected((current) => [...current, ...fresh]);
  };

  // Same callbacks for every row: the rows not changed are not drawn again
  const renameFile = useCallback(
    (path: string, name: string | undefined) =>
      setSelected((current) =>
        current.map((c) =>
          // Same as the original name: keep it, no automatic name
          c.path === path ? { ...c, name, keepOriginal: !name } : c,
        ),
      ),
    [],
  );
  const revertFile = useCallback(
    (path: string) =>
      setSelected((current) =>
        current.map((c) =>
          c.path === path ? { ...c, name: undefined, keepOriginal: true } : c,
        ),
      ),
    [],
  );
  const removeFile = useCallback(
    (path: string) => setSelected((current) => current.filter((c) => c.path !== path)),
    [],
  );

  // Server files still missing chunks, matched with the files picked in the browser
  const toUploadItems = (files: DepositFileState[]): UploadItem[] =>
    files
      .filter((f) => f.status === "UPLOADING")
      .map((f) => ({
        id: f.id,
        file: selectedByKey.get(fileKey(f.path, f.size))!.file,
        path: f.path,
        size: f.size,
        totalChunks: f.totalChunks,
        received: new Set(f.receivedChunks ?? []),
      }));

  const fail = (e: unknown, run: number) => {
    // Cancelled (or replaced by another upload): nothing to show
    if (runId.current !== run) return;
    uploader.current?.stop();
    setRetrying(false);
    const fatal = toFatalError(e);
    if (!fatal) console.error(e);
    setPhase({ name: "error", code: fatal?.code ?? "unknown", values: fatal?.values });
  };

  // Network retries of an upload: they end when it is cancelled
  const retry = <T,>(run: number, call: () => Promise<T>) =>
    withNetworkRetry(call, {
      onWait: (waiting) => runId.current === run && setRetrying(waiting),
      stopped: () => runId.current !== run,
    });

  const upload = async (
    run: number,
    session: DepositSession,
    items: UploadItem[],
    paths: string[],
    totalSize: number,
  ) => {
    currentSession.current = session;
    setPhase({ name: "uploading" });
    // Chunks refused by the server's body parser: the next rounds send them streamed
    let streamed = false;
    for (let round = 0; ; round++) {
      const sending: DepositUploader = new DepositUploader(
        session,
        items,
        setProgress,
        streamed,
      );
      uploader.current = sending;
      await sending.run();
      streamed = sending.streamed;
      if (runId.current !== run) return;
      setPhase({ name: "finishing" });
      try {
        await retry(run, () => stundTransferService.complete(session));
        break;
      } catch (e) {
        if (toFatalError(e)?.code !== "stund_incomplete" || round >= 2) throw e;
        // The server is missing some chunks: send them again
        const state = await retry(run, () => stundTransferService.getDeposit(session));
        items = toUploadItems(state.files);
        setPhase({ name: "uploading" });
      }
    }
    resumeMemory.clear(memoryKey);
    setPhase({ name: "done", paths, totalSize });
  };

  const send = async () => {
    const run = ++runId.current;
    currentSession.current = undefined;
    setProgress(undefined);
    setRetrying(false);
    setPhase({ name: "preparing" });
    // Names of now, not the ones of the list (updated a bit later)
    const names = automaticNames(selected, uploaderName, videoName);
    const entries = selected.map((f) => {
      const name = effectiveName(f, names);
      return {
        path: f.path,
        size: f.size,
        // Dated before 1970 (wrong clock): 1970
        lastModified: Math.max(0, f.lastModified),
        name: name !== baseName(f.path) ? name : undefined,
      };
    });
    let created: DepositSession | undefined;
    let uploading = false;
    try {
      const session = await retry(run, () =>
        stundTransferService.createDeposit({
          token,
          uploaderName: uploaderName.trim(),
          videoName: videoName.trim(),
          fileCount: selected.length,
          totalSize: selectedSize,
        }),
      );
      created = session;
      if (runId.current !== run) throw new Error("Upload cancelled");
      // Saved at once: after a reload while the file list is being sent, the
      // page deletes this deposit (it could never be completed) and says so
      resumeMemory.save(memoryKey, {
        depositId: session.depositId,
        secret: session.secret,
        savedAt: Date.now(),
        names: Object.fromEntries(
          entries.flatMap((e) => (e.name ? [[e.path, e.name] as const] : [])),
        ),
      });
      const registered: DepositFileState[] = [];
      for (const batch of batches(entries, BATCH_SIZE, BATCH_MAX_BYTES))
        registered.push(
          ...(await retry(run, () => stundTransferService.addFiles(session, batch))),
        );
      if (runId.current !== run) throw new Error("Upload cancelled");
      uploading = true;
      await upload(
        run,
        session,
        toUploadItems(registered),
        selected.map((f) => effectivePath(f, names)), // shown on "Reçu", with the new names
        selectedSize,
      );
    } catch (e) {
      // Stopped before any chunk was sent: nothing to resume, delete it now
      if (created && !uploading) {
        stundTransferService.cancelDeposit(created).catch(() => undefined);
        // Its resume entry too, unless another upload has replaced it meanwhile
        if (resumeMemory.load(memoryKey)?.depositId === created.depositId)
          resumeMemory.clear(memoryKey);
      }
      fail(e, run);
    }
  };

  const resume = async () => {
    if (phase.name !== "resume") return;
    const { state, session, names } = phase;
    const run = ++runId.current;
    setProgress(undefined);
    setRetrying(false);
    try {
      await upload(
        run,
        session,
        toUploadItems(state.files),
        // Shown on "Reçu", with the new names saved before the interruption
        state.files.map((f) => {
          const name = names?.[f.path];
          return name ? renamedPath(f.path, name) : f.path;
        }),
        state.totalSize,
      );
    } catch (e) {
      fail(e, run);
    }
  };

  const cancelUpload = () => {
    cancelModal.current = modals.openConfirmModal({
      title: t("stundtransfer.upload.cancel.confirm.title"),
      children: (
        <Text size="sm">{t("stundtransfer.upload.cancel.confirm.description")}</Text>
      ),
      labels: {
        confirm: t("stundtransfer.upload.cancel.confirm.yes"),
        cancel: t("stundtransfer.upload.cancel.confirm.no"),
      },
      confirmProps: { color: "red" },
      onConfirm: async () => {
        // Finished meanwhile: the files arrived, nothing to cancel
        if (!CANCELLABLE.includes(phaseRef.current.name)) return;
        runId.current++;
        uploader.current?.stop();
        // Still preparing: send() deletes the deposit it created
        const session = currentSession.current;
        if (session)
          await stundTransferService.cancelDeposit(session).catch(() => undefined);
        resumeMemory.clear(memoryKey);
        setRetrying(false);
        setProgress(undefined);
        setPhase({ name: "form" });
        toast.success(t("stundtransfer.upload.cancelled"));
      },
    });
  };

  const startOver = () => {
    // Giving up an interrupted upload: delete what was already sent
    if (phase.name === "resume")
      stundTransferService.cancelDeposit(phase.session).catch(() => undefined);
    resumeMemory.clear(memoryKey);
    setSelected([]);
    setIgnored(0);
    setProgress(undefined);
    setPhase({ name: "form" });
  };

  const fileSummary = selected.length > 0 && phase.name === "form" && (
    <Paper withBorder radius="md" p="md">
      <Group position="apart" mb="xs">
        <Text weight={600}>
          {t("stundtransfer.files.summary", {
            count: selected.length,
            size: humanSize(selectedSize),
          })}
        </Text>
        <Button
          variant="subtle"
          color="gray"
          size="xs"
          onClick={() => {
            setSelected([]);
            setIgnored(0);
          }}
        >
          <FormattedMessage id="stundtransfer.files.clear" />
        </Button>
      </Group>
      <Stack spacing={4} mah={360} sx={{ overflowY: "auto" }}>
        {selected.slice(0, FILE_PREVIEW_COUNT).map((f) => (
          <SelectedFileRow
            key={f.path}
            file={f}
            name={effectiveName(f, autoNames)}
            sizeLabel={humanSize(f.size)}
            onRename={renameFile}
            onRevert={revertFile}
            onRemove={removeFile}
          />
        ))}
        {selected.length > FILE_PREVIEW_COUNT && (
          <Text size="sm" color="dimmed">
            {t("stundtransfer.files.more", {
              count: selected.length - FILE_PREVIEW_COUNT,
            })}
          </Text>
        )}
      </Stack>
      {ignored > 0 && (
        <Text size="xs" color="dimmed" mt="xs">
          {t("stundtransfer.files.ignored", { count: ignored })}
        </Text>
      )}
    </Paper>
  );

  const content = (() => {
    switch (phase.name) {
      case "checking":
        return (
          <Center py="xl">
            <Loader />
          </Center>
        );

      case "form":
        return (
          <Stack spacing="lg">
            {phase.notice && (
              <Alert
                color="orange"
                icon={<TbInfoCircle />}
                withCloseButton
                onClose={() => setPhase({ name: "form" })}
              >
                <FormattedMessage id={phase.notice} />
              </Alert>
            )}
            <div>
              <Title order={2}>
                <FormattedMessage id="stundtransfer.form.title" />
              </Title>
              <Text color="dimmed" size="sm">
                <FormattedMessage id="stundtransfer.form.subtitle" />
              </Text>
            </div>
            <SimpleGrid cols={2} breakpoints={[{ maxWidth: "sm", cols: 1 }]}>
              <TextInput
                required
                size="md"
                maxLength={60}
                label={t("stundtransfer.form.uploader.label")}
                placeholder={placeholder(
                  "stundtransfer.uploaderPlaceholder",
                  "stundtransfer.form.uploader.placeholder",
                )}
                value={uploaderName}
                onChange={(e) => setUploaderName(e.currentTarget.value)}
              />
              <TextInput
                required
                size="md"
                maxLength={60}
                label={t("stundtransfer.form.video.label")}
                placeholder={placeholder(
                  "stundtransfer.videoPlaceholder",
                  "stundtransfer.form.video.placeholder",
                )}
                value={videoName}
                onChange={(e) => setVideoName(e.currentTarget.value)}
              />
            </SimpleGrid>
            <DepositDropzone maxSize={maxSize} onFiles={addFiles} />
            {fileSummary}
            <Button
              size="lg"
              fullWidth
              disabled={!fieldsFilled || selected.length === 0}
              onClick={send}
            >
              <FormattedMessage id="stundtransfer.button.send" />
            </Button>
            {!fieldsFilled && selected.length > 0 && (
              <Text size="sm" color="dimmed" align="center">
                <FormattedMessage id="stundtransfer.form.missing-fields" />
              </Text>
            )}
          </Stack>
        );

      case "resume": {
        const { state } = phase;
        const needed = state.files.filter((f) => f.status === "UPLOADING");
        const missing = needed.filter((f) => !selectedByKey.has(fileKey(f.path, f.size)));
        const receivedBytes = total(
          state.files.map((f) =>
            f.status !== "UPLOADING"
              ? f.size
              : total(
                  (f.receivedChunks ?? []).map((i) => chunkLength(f.size, state.chunkSize, i)),
                ),
          ),
        );
        return (
          <Stack spacing="lg">
            <Alert
              color="orange"
              icon={<TbRefresh />}
              title={t("stundtransfer.resume.title")}
            >
              {t("stundtransfer.resume.description", {
                uploader: state.uploaderName,
                video: state.videoName,
                received: humanSize(receivedBytes),
                total: humanSize(state.totalSize),
              })}
            </Alert>
            <DepositDropzone maxSize={state.totalSize} onFiles={addFiles} />
            <Text weight={600}>
              {t("stundtransfer.resume.matched", {
                matched: needed.length - missing.length,
                needed: needed.length,
              })}
            </Text>
            {missing.length > 0 && (
              <Text size="sm" color="dimmed">
                {t("stundtransfer.resume.missing", {
                  names:
                    missing
                      .slice(0, 5)
                      .map((f) => f.path)
                      .join(", ") + (missing.length > 5 ? ", …" : ""),
                })}
              </Text>
            )}
            <Button size="lg" fullWidth disabled={missing.length > 0} onClick={resume}>
              <FormattedMessage id="stundtransfer.resume.button" />
            </Button>
            <Button variant="subtle" color="gray" onClick={startOver}>
              <FormattedMessage id="stundtransfer.resume.abandon" />
            </Button>
          </Stack>
        );
      }

      case "preparing":
      case "uploading":
      case "finishing": {
        const percent =
          progress && progress.totalBytes > 0
            ? (progress.sentBytes / progress.totalBytes) * 100
            : phase.name === "finishing"
              ? 100
              : 0;
        return (
          <Stack spacing="lg">
            <div>
              <Title order={2}>
                <FormattedMessage
                  id={
                    phase.name === "preparing"
                      ? "stundtransfer.upload.preparing"
                      : phase.name === "finishing"
                        ? "stundtransfer.upload.finishing"
                        : "stundtransfer.upload.title"
                  }
                />
              </Title>
              <Text color="dimmed">
                {uploaderName.trim()} · {videoName.trim()}
              </Text>
            </div>
            <Progress
              value={percent}
              size="xl"
              radius="xl"
              striped
              animate={phase.name !== "finishing"}
            />
            {progress && (
              <>
                <Group position="apart">
                  <Text weight={700} size="lg">
                    {Math.floor(percent)} %
                  </Text>
                  <Text size="sm" color="dimmed">
                    {t("stundtransfer.upload.progress", {
                      sent: humanSize(progress.sentBytes),
                      total: humanSize(progress.totalBytes),
                    })}
                    {" · "}
                    {t("stundtransfer.upload.speed", {
                      speed: humanSize(progress.bytesPerSecond),
                    })}
                    {" · "}
                    {t("stundtransfer.upload.eta", {
                      eta: formatDuration(progress.secondsLeft),
                    })}
                  </Text>
                </Group>
                <Text size="sm">
                  {t("stundtransfer.upload.files", {
                    done: progress.filesDone,
                    total: progress.filesTotal,
                  })}
                </Text>
              </>
            )}
            {(progress?.reconnecting || retrying) && (
              <Alert color="orange" icon={<TbPlugConnectedX />}>
                <FormattedMessage id="stundtransfer.upload.reconnecting" />
              </Alert>
            )}
            <Alert color="blue" variant="light" icon={<TbInfoCircle />}>
              <FormattedMessage id="stundtransfer.upload.keep-open" />
            </Alert>
            {CANCELLABLE.includes(phase.name) && (
              <Button
                variant="subtle"
                color="red"
                leftIcon={<TbX />}
                onClick={cancelUpload}
              >
                <FormattedMessage id="stundtransfer.upload.cancel" />
              </Button>
            )}
          </Stack>
        );
      }

      case "done":
        return (
          <Stack align="center" spacing="md" py="xl">
            <ThemeIcon size={80} radius={80} color="green" variant="light">
              <TbCircleCheck size={48} />
            </ThemeIcon>
            <Title order={2} align="center">
              <FormattedMessage id="stundtransfer.done.title" />
            </Title>
            <Text align="center">
              {t("stundtransfer.done.description", {
                count: phase.paths.length,
                size: humanSize(phase.totalSize),
              })}
            </Text>
            <Paper withBorder radius="md" p="md" style={{ width: "100%" }}>
              <Stack spacing={4}>
                {phase.paths.slice(0, DONE_PREVIEW_COUNT).map((path) => (
                  <Text key={path} size="sm" truncate>
                    {path}
                  </Text>
                ))}
                {phase.paths.length > DONE_PREVIEW_COUNT && (
                  <Text size="sm" color="dimmed">
                    {t("stundtransfer.files.more", {
                      count: phase.paths.length - DONE_PREVIEW_COUNT,
                    })}
                  </Text>
                )}
              </Stack>
            </Paper>
            <Button variant="light" onClick={startOver}>
              <FormattedMessage id="stundtransfer.done.again" />
            </Button>
          </Stack>
        );

      case "error": {
        const key = `stundtransfer.error.${phase.code}`;
        return (
          <Stack spacing="lg">
            <Alert
              color="red"
              icon={<TbAlertTriangle />}
              title={t("stundtransfer.error.title")}
            >
              {intl.messages[key]
                ? t(key, phase.values)
                : t("stundtransfer.error.unknown") +
                  // Code given by the server, for the person who manages it
                  (phase.code !== "unknown" ? ` (${phase.code})` : "")}
            </Alert>
            <Button leftIcon={<TbRefresh />} onClick={checkInterruptedUpload}>
              <FormattedMessage id="stundtransfer.error.retry" />
            </Button>
          </Stack>
        );
      }
    }
  })();

  return (
    <>
      <Meta title={t("stundtransfer.page.title")} />
      <div style={{ maxWidth: "50rem", margin: "0 auto" }}>{content}</div>
    </>
  );
};

export default DepositPage;
