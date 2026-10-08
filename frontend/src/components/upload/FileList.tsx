import { ActionIcon, Table, Group } from "@mantine/core";
import { useModals } from "@mantine/modals";
import { TbTrash, TbEdit } from "react-icons/tb";
import { GrUndo } from "react-icons/gr";
import { FileListItem, FileUpload } from "../../types/File.type"; // StundTransfer: FileUpload
import { byteToHumanSizeString } from "../../utils/fileSize.util";
import UploadProgressIndicator from "./UploadProgressIndicator";
import { FormattedMessage } from "react-intl";
import useTranslate from "../../hooks/useTranslate.hook";
import { HoverTip } from "../core/HoverTip";
import showTextEditorModal from "./modals/showTextEditorModal";
import shareService from "../../services/share.service";
// StundTransfer: pencil to rename a file before it is sent
import RenamableFileName from "../../stundtransfer/RenamableFileName";
import {
  originalNameOf,
  originalUpload,
  renameUpload,
} from "../../stundtransfer/renameUpload";
import toast from "../../utils/toast.util";

const renderFileName = (name: string) => {
  const parts = name.split("/");
  if (parts.length === 1) return name;
  const fileName = parts.pop();
  const folderPath = parts.join("/");
  return (
    <span>
      <span style={{ opacity: 0.5 }}>{folderPath}/</span>
      <span style={{ fontWeight: 600 }}>{fileName}</span>
    </span>
  );
};

const getFileNameOrPath = (file: FileListItem) => {
  const pathName =
    "webkitRelativePath" in file && file.webkitRelativePath
      ? file.webkitRelativePath
      : file.name;
  return pathName.replace(/\\/g, "/").replace(/^\//, "");
};

const FileListRow = ({
  file,
  onRemove,
  onRestore,
  onEdit,
  onRename,
  onRevertName,
}: {
  file: FileListItem;
  onRemove?: () => void;
  onRestore?: () => void;
  onEdit?: () => void;
  onRename?: (name: string) => void; // StundTransfer
  onRevertName?: () => void; // StundTransfer
}) => {
  {
    const uploadable = "uploadingProgress" in file;
    const uploading = uploadable && file.uploadingProgress !== 0;
    const removable = uploadable
      ? file.uploadingProgress === 0
      : onRemove && !file.deleted;
    const restorable = onRestore && !uploadable && !!file.deleted;
    const deleted = !uploadable && !!file.deleted;

    const fileNameOrPath = getFileNameOrPath(file);
    const isTextFile = shareService.isShareTextFile(fileNameOrPath);
    const editable = isTextFile && uploadable && file.uploadingProgress === 0;

    const t = useTranslate();

    return (
      <tr
        style={{
          color: deleted ? "rgba(120, 120, 120, 0.5)" : "inherit",
          textDecoration: deleted ? "line-through" : "none",
        }}
      >
        <td>
          {/* StundTransfer: renamable until it is sent */}
          {uploadable && !uploading && onRename && onRevertName ? (
            <RenamableFileName
              path={fileNameOrPath}
              originalName={originalNameOf(file)}
              onRename={onRename}
              onRevert={onRevertName}
            />
          ) : (
            renderFileName(fileNameOrPath)
          )}
        </td>
        <td>{byteToHumanSizeString(+file.size)}</td>
        <td>
          <Group position="right" spacing="xs" noWrap>
            {editable && (
              <HoverTip label={t("common.button.edit")}>
                <ActionIcon
                  color="blue"
                  variant="light"
                  size={25}
                  onClick={onEdit}
                >
                  <TbEdit />
                </ActionIcon>
              </HoverTip>
            )}
            {removable && (
              <HoverTip label={t("common.button.delete")}>
                <ActionIcon
                  color="red"
                  variant="light"
                  size={25}
                  onClick={onRemove}
                >
                  <TbTrash />
                </ActionIcon>
              </HoverTip>
            )}
            {uploading && (
              <UploadProgressIndicator progress={file.uploadingProgress} />
            )}
            {restorable && (
              <HoverTip label={t("common.button.undo")}>
                <ActionIcon
                  color="victoria"
                  variant="light"
                  size={25}
                  onClick={onRestore}
                >
                  <GrUndo />
                </ActionIcon>
              </HoverTip>
            )}
          </Group>
        </td>
      </tr>
    );
  }
};

const FileList = <T extends FileListItem = FileListItem>({
  files,
  setFiles,
}: {
  files: T[];
  setFiles: (files: T[]) => void;
}) => {
  const modals = useModals();
  const remove = (index: number) => {
    const file = files[index];

    if ("uploadingProgress" in file) {
      files.splice(index, 1);
    } else {
      files[index] = { ...file, deleted: true };
    }

    setFiles([...files]);
  };

  const restore = (index: number) => {
    const file = files[index];

    if ("uploadingProgress" in file) {
      return;
    } else {
      files[index] = { ...file, deleted: false };
    }

    setFiles([...files]);
  };

  const edit = async (index: number) => {
    const originalFile = files[index] as unknown as File;
    const text = await originalFile.text();

    showTextEditorModal(index, files, setFiles, text, modals);
  };

  // StundTransfer: rename before sending (refused if another file has that name)
  const t = useTranslate();
  const replaceUpload = (index: number, file: FileUpload) => {
    const path = getFileNameOrPath(file);
    const taken = files.some(
      (other, i) =>
        i !== index &&
        !("deleted" in other && other.deleted) &&
        getFileNameOrPath(other) === path,
    );
    if (taken) {
      toast.error(t("stundtransfer.files.duplicate", { name: path }));
      return;
    }
    const updated = [...files];
    updated[index] = file as unknown as T;
    setFiles(updated);
  };
  const rename = (index: number, name: string) =>
    replaceUpload(index, renameUpload(files[index] as FileUpload, name));
  const revertName = (index: number) =>
    replaceUpload(index, originalUpload(files[index] as FileUpload));

  const rows = files.map((file, i) => (
    <FileListRow
      key={i}
      file={file}
      onRemove={() => remove(i)}
      onRestore={() => restore(i)}
      onEdit={() => edit(i)}
      onRename={(name) => rename(i, name)}
      onRevertName={() => revertName(i)}
    />
  ));

  return (
    <Table>
      <thead>
        <tr>
          <th>
            <FormattedMessage id="upload.filelist.name" />
          </th>
          <th>
            <FormattedMessage id="upload.filelist.size" />
          </th>
          <th></th>
        </tr>
      </thead>
      <tbody>{rows}</tbody>
    </Table>
  );
};

export default FileList;
