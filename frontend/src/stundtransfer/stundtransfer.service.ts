// StundTransfer: calls to the deposit API (backend/src/stundtransfer).
import { AxiosProgressEvent } from "axios";
import api from "../services/api.service";

const SECRET_HEADER = "x-deposit-secret";

export type LinkInfo = {
  depositMode: boolean;
  maxSize?: number;
  chunkSize?: number;
  parallelUploads?: number;
};

export type DepositSession = {
  depositId: string;
  secret: string;
  chunkSize: number;
  parallelUploads: number;
};

export type DepositFileState = {
  id: string;
  path: string;
  size: number;
  status: "UPLOADING" | "UPLOADED" | "DONE" | "ERROR";
  totalChunks: number;
  receivedChunks?: number[];
};

export type DepositState = {
  depositId: string;
  // CANCELLED: by the uploader, an administrator or for inactivity
  status: "UPLOADING" | "RECEIVED" | "CANCELLED";
  uploaderName: string;
  videoName: string;
  fileCount: number;
  totalSize: number;
  chunkSize: number;
  parallelUploads: number;
  files: DepositFileState[];
};

export type AdminDeposit = {
  id: string;
  createdAt: string;
  lastActivityAt: string;
  completedAt?: string;
  uploaderName: string;
  videoName: string;
  folderName: string;
  // Folder used, relative to the mounted folder (e.g. "5 - StundTransfer/Litsu - Beamng (2)")
  finalFolder?: string;
  status: "UPLOADING" | "MOVING" | "DONE" | "ERROR" | "ABANDONED";
  error?: string;
  totalSize: number;
  fileCount: number;
  files?: {
    id: string;
    originalPath: string;
    size: number;
    status: string;
    finalPath?: string;
    error?: string;
  }[];
};

// A request left hanging (a proxy keeping the connection open) fails after
// this long, so the page tries again and says it cannot connect
const INFO_TIMEOUT_MS = 15 * 1000;

/** Public deposit of the home page (no link needed), if an admin enabled it. */
const getPublicInfo = async (): Promise<LinkInfo> =>
  (await api.get("stundtransfer/public", { timeout: INFO_TIMEOUT_MS })).data;

const getLink = async (token: string): Promise<LinkInfo> =>
  (
    await api.get(`stundtransfer/links/${encodeURIComponent(token)}`, {
      timeout: INFO_TIMEOUT_MS,
    })
  ).data;

const createDeposit = async (body: {
  // Deposit link token; undefined for the public deposit
  token?: string;
  uploaderName: string;
  videoName: string;
  fileCount: number;
  totalSize: number;
}): Promise<DepositSession> =>
  (await api.post("stundtransfer/deposits", body)).data;

const addFiles = async (
  session: Pick<DepositSession, "depositId" | "secret">,
  files: { path: string; size: number; lastModified?: number; name?: string }[],
): Promise<DepositFileState[]> =>
  (
    await api.post(
      `stundtransfer/deposits/${session.depositId}/files`,
      { files },
      { headers: { [SECRET_HEADER]: session.secret } },
    )
  ).data.files;

const getDeposit = async (
  session: Pick<DepositSession, "depositId" | "secret">,
): Promise<DepositState> =>
  (
    await api.get(`stundtransfer/deposits/${session.depositId}`, {
      headers: { [SECRET_HEADER]: session.secret },
    })
  ).data;

const uploadChunk = async (
  session: Pick<DepositSession, "depositId" | "secret">,
  fileId: string,
  index: number,
  // A slice of the file (Blob): the browser streams it from disk
  data: Blob,
  options: {
    signal: AbortSignal;
    onUploadProgress: (event: AxiosProgressEvent) => void;
    // Streamed by the server instead of read by its body parser, whose size
    // limit can be below this deposit's chunk size (setting lowered since)
    streamed?: boolean;
  },
): Promise<{ fileComplete: boolean }> =>
  (
    await api.put(
      `stundtransfer/deposits/${session.depositId}/files/${fileId}/chunks/${index}`,
      data,
      {
        headers: {
          [SECRET_HEADER]: session.secret,
          // octet-stream: measured faster on the NAS than the streamed type
          "Content-Type": options.streamed
            ? "application/x-stundtransfer-chunk"
            : "application/octet-stream",
        },
        signal: options.signal,
        onUploadProgress: options.onUploadProgress,
      },
    )
  ).data;

const complete = async (
  session: Pick<DepositSession, "depositId" | "secret">,
) =>
  (
    await api.post(
      `stundtransfer/deposits/${session.depositId}/complete`,
      {},
      { headers: { [SECRET_HEADER]: session.secret } },
    )
  ).data;

const cancelDeposit = async (
  session: Pick<DepositSession, "depositId" | "secret">,
) =>
  api.delete(`stundtransfer/deposits/${session.depositId}`, {
    headers: { [SECRET_HEADER]: session.secret },
  });

export type Destination = {
  enabled: boolean;
  // Name of the folder mounted in the container (e.g. the Synology shared folder)
  rootName: string;
  // Relative to that folder, "" = the folder itself
  destination: string;
};

const getDestination = async (): Promise<Destination> =>
  (await api.get("stundtransfer/admin/destination")).data;

const setDestination = async (path: string): Promise<Destination> =>
  (await api.put("stundtransfer/admin/destination", { path })).data;

const listFolders = async (path: string): Promise<{ path: string; folders: string[] }> =>
  (await api.get("stundtransfer/admin/folders", { params: { path } })).data;

const createFolder = async (path: string, name: string): Promise<{ path: string }> =>
  (await api.post("stundtransfer/admin/folders", { path, name })).data;

const listDeposits = async (): Promise<AdminDeposit[]> =>
  (await api.get("stundtransfer/admin/deposits")).data;

const getDepositDetails = async (id: string): Promise<AdminDeposit> =>
  (await api.get(`stundtransfer/admin/deposits/${id}`)).data;

const retryDeposit = async (id: string) =>
  api.post(`stundtransfer/admin/deposits/${id}/retry`);

const removeDeposit = async (id: string) =>
  api.delete(`stundtransfer/admin/deposits/${id}`);

// Links to files already on the NAS

export type NasListing = {
  path: string;
  folders: { name: string; modifiedAt: string | null }[];
  files: { name: string; size: number; modifiedAt: string | null }[];
};

export type NasLink = {
  id: string;
  token: string;
  path: string;
  name: string;
  folder: boolean;
  // null: a folder, or moved or deleted since (missing)
  size: number | null;
  missing: boolean;
  createdAt: string;
  expiresAt: string | null;
  downloads: number;
};

export type NasPublicLink = {
  name: string;
  folder: boolean;
  // Folder: total of its files (sub-folders included)
  size: number;
  fileCount: number;
  // false: giant folder, size and count are lower bounds
  complete: boolean;
  expiresAt: string | null;
};

export type NasPublicListing = {
  path: string;
  folders: { name: string; size: number; files: number; complete: boolean }[];
  files: { name: string; size: number }[];
};

const listNas = async (path: string): Promise<NasListing> =>
  (await api.get("stundtransfer/admin/nas", { params: { path } })).data;

const listNasLinks = async (): Promise<NasLink[]> =>
  (await api.get("stundtransfer/admin/nas-links")).data;

const createNasLink = async (path: string, expiresInDays?: number): Promise<NasLink> =>
  (await api.post("stundtransfer/admin/nas-links", { path, expiresInDays })).data;

const deleteNasLink = async (id: string) => api.delete(`stundtransfer/admin/nas-links/${id}`);

const getNasLink = async (token: string): Promise<NasPublicLink> =>
  (await api.get(`stundtransfer/nas/${token}`, { timeout: INFO_TIMEOUT_MS })).data;

const listNasPublic = async (token: string, path: string): Promise<NasPublicListing> =>
  (await api.get(`stundtransfer/nas/${token}/list`, { params: { path } })).data;

const withPath = (path?: string) => (path ? `?path=${encodeURIComponent(path)}` : "");

// "Mettre à jour" page

export type UpdateStatus = {
  current: { sha: string; date: string | null } | null;
  latest: { sha: string; date: string | null } | null;
  available: boolean;
  // Waiting for the DSM task, which deletes the request when it starts
  requestedAt: string | null;
  lastLog: string | null;
  checkFailed: boolean;
};

const getUpdateStatus = async (): Promise<UpdateStatus> =>
  (await api.get("stundtransfer/admin/update")).data;

const requestUpdate = async (): Promise<UpdateStatus> =>
  (await api.post("stundtransfer/admin/update")).data;

/** Plain links: the browser downloads them itself (resumable files, no memory used). */
export const nasDownloadUrl = (token: string, path?: string) =>
  `/api/stundtransfer/nas/${token}/download${withPath(path)}`;
export const nasZipUrl = (token: string, path?: string) =>
  `/api/stundtransfer/nas/${token}/zip${withPath(path)}`;

export default {
  getPublicInfo,
  getLink,
  createDeposit,
  addFiles,
  getDeposit,
  uploadChunk,
  complete,
  cancelDeposit,
  getDestination,
  setDestination,
  listFolders,
  createFolder,
  listDeposits,
  getDepositDetails,
  retryDeposit,
  removeDeposit,
  listNas,
  listNasLinks,
  createNasLink,
  deleteNasLink,
  getNasLink,
  listNasPublic,
  getUpdateStatus,
  requestUpdate,
};
