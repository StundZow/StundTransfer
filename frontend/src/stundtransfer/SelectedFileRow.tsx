// StundTransfer: one file of the deposit page list. Pencil to rename it,
// round arrow to restore the original name (shown struck through when renamed).
// Memoized: with hundreds of files, typing in the form stays fluid.
import {
  ActionIcon,
  Box,
  CloseButton,
  Group,
  Text,
  TextInput,
  Tooltip,
} from "@mantine/core";
import { memo, useEffect, useRef, useState } from "react";
import { TbCheck, TbPencil, TbRotate } from "react-icons/tb";
import useTranslate from "../hooks/useTranslate.hook";
import { SelectedFile, baseName, cleanNewName } from "./depositFiles";

const SelectedFileRow = ({
  file,
  name,
  sizeLabel,
  onRename,
  onRevert,
  onRemove,
}: {
  file: SelectedFile;
  // Name used on the NAS (chosen, automatic or original)
  name: string;
  sizeLabel: string;
  // Same callbacks for every row (they get the file's path)
  onRename: (path: string, name: string | undefined) => void;
  onRevert: (path: string) => void;
  onRemove: (path: string) => void;
}) => {
  const t = useTranslate();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const input = useRef<HTMLInputElement>(null);

  const folders = file.path.split("/").slice(0, -1);
  const originalName = baseName(file.path);
  const renamed = name !== originalName;

  // Select the name without its extension, ready to type
  useEffect(() => {
    if (!editing || !input.current) return;
    const dot = draft.lastIndexOf(".");
    input.current.focus();
    input.current.setSelectionRange(0, dot > 0 ? dot : draft.length);
  }, [editing]);

  const startEditing = () => {
    setDraft(name);
    setEditing(true);
  };

  const save = () => {
    const next = cleanNewName(file.path, draft);
    // Unchanged: keep an automatic name automatic (it follows the form)
    if ((next ?? originalName) !== name) onRename(file.path, next);
    setEditing(false);
  };

  const folderPrefix = folders.length > 0 && (
    <Text span color="dimmed" truncate sx={{ minWidth: "2ch" }}>
      {folders.join("/")}/
    </Text>
  );

  return (
    <Group position="apart" noWrap spacing="xs">
      {editing ? (
        <TextInput
          ref={input}
          size="xs"
          value={draft}
          maxLength={200}
          onChange={(e) => setDraft(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") save();
            if (e.key === "Escape") setEditing(false);
          }}
          onBlur={save}
          icon={folders.length ? <Text size="xs">{folders.join("/")}/</Text> : undefined}
          iconWidth={folders.length ? Math.min(220, 12 + folders.join("/").length * 6) : undefined}
          sx={{ flex: 1, minWidth: 0 }}
          rightSection={
            <ActionIcon size="sm" onMouseDown={(e) => e.preventDefault()} onClick={save}>
              <TbCheck />
            </ActionIcon>
          }
        />
      ) : (
        <Group spacing={6} noWrap sx={{ minWidth: 0 }}>
          {/* Narrow screen: the folders are shortened first, then the original
              name, so that the name used on the NAS stays visible */}
          <Text size="sm" title={file.path} sx={{ display: "flex", minWidth: 0 }}>
            {folderPrefix}
            <Box
              component="span"
              // A small gap: the shortened folders ("U…") do not run into the name
              ml={folders.length > 0 ? 3 : 0}
              sx={{
                display: "flex",
                flexShrink: 0,
                maxWidth: folders.length > 0 ? "calc(100% - 2ch - 3px)" : "100%",
              }}
            >
              {renamed && (
                <Text
                  span
                  color="dimmed"
                  td="line-through"
                  mr={6}
                  truncate
                  sx={{ minWidth: 0 }}
                >
                  {originalName}
                </Text>
              )}
              <Text
                span
                truncate
                sx={{ flexShrink: 0, maxWidth: renamed ? "calc(100% - 6px)" : "100%" }}
              >
                {name}
              </Text>
            </Box>
          </Text>
          <Tooltip label={t("stundtransfer.files.rename")} withArrow>
            <ActionIcon
              size="sm"
              variant="subtle"
              aria-label={t("stundtransfer.files.rename")}
              onClick={startEditing}
            >
              <TbPencil size={14} />
            </ActionIcon>
          </Tooltip>
          {renamed && (
            <Tooltip label={t("stundtransfer.files.revert")} withArrow>
              <ActionIcon
                size="sm"
                variant="subtle"
                aria-label={t("stundtransfer.files.revert")}
                onClick={() => onRevert(file.path)}
              >
                <TbRotate size={14} />
              </ActionIcon>
            </Tooltip>
          )}
        </Group>
      )}
      <Group spacing="xs" noWrap>
        <Text size="xs" color="dimmed" sx={{ whiteSpace: "nowrap" }}>
          {sizeLabel}
        </Text>
        <CloseButton
          size="sm"
          aria-label={file.path}
          onClick={() => onRemove(file.path)}
        />
      </Group>
    </Group>
  );
};

export default memo(SelectedFileRow);
