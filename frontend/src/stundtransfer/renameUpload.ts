// StundTransfer: renaming a file of the share upload list before it is sent.
// The new File only points to the same data (nothing is copied, even for a
// 100 GB rush); the first File is kept to restore the original name.
import { FileUpload } from "../types/File.type";
import { getNormalizedFileName } from "../utils/file.util";
import { baseName } from "./depositFiles";

type Renamed = FileUpload & { stundOriginal?: FileUpload };

/** File as dropped, before any rename. */
export const originalUpload = (file: FileUpload) =>
  (file as Renamed).stundOriginal ?? file;

/** Original name when the file was renamed. */
export const originalNameOf = (file: FileUpload) => {
  const original = (file as Renamed).stundOriginal;
  return original ? baseName(getNormalizedFileName(original)) : undefined;
};

/** Same file under a new name, in the same folder. */
export function renameUpload(file: FileUpload, name: string): FileUpload {
  const original = originalUpload(file);
  const folders = getNormalizedFileName(file).split("/").slice(0, -1);
  const renamed = new File([original], name, {
    type: original.type,
    lastModified: original.lastModified,
  }) as Renamed;
  if (folders.length > 0) {
    Object.defineProperty(renamed, "webkitRelativePath", {
      value: [...folders, name].join("/"),
    });
  }
  renamed.uploadingProgress = 0;
  renamed.stundOriginal = original;
  return renamed;
}
