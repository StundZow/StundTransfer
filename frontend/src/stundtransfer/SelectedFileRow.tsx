// StundTransfer: one file of the deposit page list, with a pencil to rename it
// before sending (the folders of the file stay the same).
import { ActionIcon, CloseButton, Group, Text, TextInput, Tooltip } from "@mantine/core";
import { useEffect, useRef, useState } from "react";
import { TbCheck, TbPencil } from "react-icons/tb";
import useTranslate from "../hooks/useTranslate.hook";
import { SelectedFile, cleanNewName, displayName } from "./depositFiles";

const SelectedFileRow = ({
  file,
  sizeLabel,
  onRename,
  onRemove,
}: {
  file: SelectedFile;
  sizeLabel: string;
  onRename: (name: string | undefined) => void;
  onRemove: () => void;
}) => {
  const t = useTranslate();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const input = useRef<HTMLInputElement>(null);

  const folders = file.path.split("/").slice(0, -1);
  const originalName = file.path.split("/").pop() ?? file.path;

  // Select the name without its extension, ready to type
  useEffect(() => {
    if (!editing || !input.current) return;
    const dot = draft.lastIndexOf(".");
    input.current.focus();
    input.current.setSelectionRange(0, dot > 0 ? dot : draft.length);
  }, [editing]);

  const startEditing = () => {
    setDraft(displayName(file));
    setEditing(true);
  };

  const save = () => {
    onRename(cleanNewName(file.path, draft));
    setEditing(false);
  };

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
        <Group spacing={4} noWrap sx={{ minWidth: 0 }}>
          <Text size="sm" truncate sx={{ minWidth: 0 }}>
            {folders.length > 0 && (
              <Text span color="dimmed">
                {folders.join("/")}/
              </Text>
            )}
            {displayName(file)}
          </Text>
          {file.name && (
            <Text size="xs" color="dimmed" sx={{ whiteSpace: "nowrap" }}>
              ({t("stundtransfer.files.renamed-from", { name: originalName })})
            </Text>
          )}
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
        </Group>
      )}
      <Group spacing="xs" noWrap>
        <Text size="xs" color="dimmed" sx={{ whiteSpace: "nowrap" }}>
          {sizeLabel}
        </Text>
        <CloseButton size="sm" aria-label={file.path} onClick={onRemove} />
      </Group>
    </Group>
  );
};

export default SelectedFileRow;
