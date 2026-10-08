// StundTransfer: file name in the share upload list, with the same pencil as
// the deposit page (rename before sending) and the round arrow to restore the
// original name (shown struck through when renamed).
import { ActionIcon, Box, Group, Text, TextInput, Tooltip } from "@mantine/core";
import { useEffect, useRef, useState } from "react";
import { TbCheck, TbPencil, TbRotate } from "react-icons/tb";
import useTranslate from "../hooks/useTranslate.hook";
import { baseName, cleanNewName } from "./depositFiles";

const RenamableFileName = ({
  path,
  originalName,
  onRename,
  onRevert,
}: {
  // "folders/name" as it will be sent
  path: string;
  originalName?: string;
  onRename: (name: string) => void;
  onRevert: () => void;
}) => {
  const t = useTranslate();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const input = useRef<HTMLInputElement>(null);
  // Enter or Escape closes the field; the blur that follows must do nothing
  const open = useRef(false);

  const name = baseName(path);
  const folders = path.split("/").slice(0, -1).join("/");

  // Select the name without its extension, ready to type
  useEffect(() => {
    if (!editing || !input.current) return;
    const dot = draft.lastIndexOf(".");
    input.current.focus();
    input.current.setSelectionRange(0, dot > 0 ? dot : draft.length);
  }, [editing]);

  const startEditing = () => {
    open.current = true;
    setDraft(name);
    setEditing(true);
  };

  const save = () => {
    if (!open.current) return;
    open.current = false;
    setEditing(false);
    const next = cleanNewName(path, draft);
    if (!next) return;
    if (next === originalName) onRevert();
    else onRename(next);
  };

  if (editing) {
    return (
      <TextInput
        ref={input}
        size="xs"
        value={draft}
        maxLength={200}
        onChange={(e) => setDraft(e.currentTarget.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") save();
          if (e.key === "Escape") {
            open.current = false;
            setEditing(false);
          }
        }}
        onBlur={save}
        icon={folders ? <Text size="xs">{folders}/</Text> : undefined}
        iconWidth={folders ? Math.min(220, 12 + folders.length * 6) : undefined}
        rightSection={
          <ActionIcon
            size="sm"
            onMouseDown={(e) => e.preventDefault()}
            onClick={save}
          >
            <TbCheck />
          </ActionIcon>
        }
      />
    );
  }

  return (
    <Group spacing={6} noWrap>
      <Box component="span" sx={{ minWidth: 0, overflowWrap: "anywhere" }}>
        {folders && <span style={{ opacity: 0.5 }}>{folders}/</span>}
        {originalName && (
          <Text span color="dimmed" td="line-through" mr={6}>
            {originalName}
          </Text>
        )}
        <span style={folders ? { fontWeight: 600 } : undefined}>{name}</span>
      </Box>
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
      {originalName && (
        <Tooltip label={t("stundtransfer.files.revert")} withArrow>
          <ActionIcon
            size="sm"
            variant="subtle"
            aria-label={t("stundtransfer.files.revert")}
            onClick={onRevert}
          >
            <TbRotate size={14} />
          </ActionIcon>
        </Tooltip>
      )}
    </Group>
  );
};

export default RenamableFileName;
