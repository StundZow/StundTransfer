// StundTransfer: upload engine. Sends several chunks at the same time, retries
// forever with an increasing delay on network errors, and reports progress,
// speed and time left.
import { AxiosError, isAxiosError } from "axios";
import stundTransferService, { DepositSession } from "./stundtransfer.service";

export type UploadItem = {
  id: string;
  file: File;
  path: string;
  size: number;
  totalChunks: number;
  received: Set<number>;
};

export type UploadProgress = {
  totalBytes: number;
  sentBytes: number;
  bytesPerSecond: number;
  secondsLeft?: number;
  filesDone: number;
  filesTotal: number;
  reconnecting: boolean;
};

/** Stops the upload for good (the page shows the translated error). */
export class FatalUploadError extends Error {
  constructor(
    public code: string,
    public values: Record<string, string> = {},
  ) {
    super(code);
  }
}

// Abort a chunk when nothing moved for this long
const STALL_TIMEOUT_MS = 30 * 1000;
// A chunk cut without any answer after sending for this long is handled like
// a stall: the connection is too slow for the time limit of a proxy
const SLOW_CHUNK_MS = 120 * 1000;
// After stalls, one more chunk at a time once this many went through in a row
const RECOVER_AFTER_CHUNKS = 10;
// Show "connection lost" when nothing moved for this long
const QUIET_WARNING_MS = 10 * 1000;
const MAX_RETRY_DELAY_MS = 30 * 1000;
const SPEED_WINDOW_MS = 10 * 1000;
// HTTP statuses that will not get better by retrying
const FATAL_STATUSES = [400, 401, 403, 404, 409, 413, 507];

export const chunkLength = (size: number, chunkSize: number, index: number) =>
  Math.max(0, Math.min(chunkSize, size - index * chunkSize));

export function toFatalError(e: unknown): FatalUploadError | undefined {
  if (e instanceof FatalUploadError) return e;
  const response = (e as AxiosError<{ error?: string }>)?.response;
  // The deposit folder is not usable: retrying for minutes would not help. A
  // 502/503 without this code (proxy while the container restarts) is retried.
  if (response?.data?.error === "stund_storage_unavailable")
    return new FatalUploadError("stund_storage_unavailable");
  if (response && FATAL_STATUSES.includes(response.status))
    return new FatalUploadError(
      response.data?.error ??
        // No code: a chunk bigger than the server or a proxy accepts, even
        // streamed (see uploadOnce)
        (response.status === 413 ? "chunk-too-large" : "unknown"),
    );
  return undefined;
}

export class DepositUploader {
  private queue: { item: UploadItem; index: number }[] = [];
  private inFlight = new Map<string, number>();
  private controllers = new Set<AbortController>();
  private confirmedBytes = 0;
  private samples: { time: number; bytes: number }[] = [];
  private stopped = false;
  private waitingRetries = 0;
  private wakeUps = new Set<() => void>();
  private concurrency: number;
  private consecutiveStalls = 0;
  private consecutiveSuccesses = 0;
  // Chunks being sent, at most `concurrency`, retries included
  private busySlots = 0;
  private slotWaiters: (() => void)[] = [];
  private activeRequests = 0;
  private lastProgressAt = Date.now();
  private ticker?: ReturnType<typeof setInterval>;

  constructor(
    private session: DepositSession,
    private items: UploadItem[],
    private onProgress: (progress: UploadProgress) => void,
    // Chunks sent with the streamed type (see uploadOnce); read after run()
    // to keep it for the next round of the same deposit
    public streamed = false,
  ) {
    this.concurrency = session.parallelUploads;
  }

  async run() {
    for (const item of this.items) {
      for (let index = 0; index < item.totalChunks; index++) {
        if (item.received.has(index))
          this.confirmedBytes += chunkLength(item.size, this.session.chunkSize, index);
        else this.queue.push({ item, index });
      }
    }

    window.addEventListener("online", this.retryNow);
    this.ticker = setInterval(() => this.emit(), 500);
    try {
      await Promise.all(
        Array.from({ length: this.session.parallelUploads }, () => this.worker()),
      );
    } finally {
      this.stop();
    }
    this.emit();
  }

  stop() {
    this.stopped = true;
    this.controllers.forEach((controller) => controller.abort());
    window.removeEventListener("online", this.retryNow);
    clearInterval(this.ticker);
    this.retryNow();
    this.slotWaiters.splice(0).forEach((wakeUp) => wakeUp());
  }

  /** Wakes up chunks waiting before a retry (e.g. the network is back). */
  private retryNow = () => {
    this.wakeUps.forEach((wakeUp) => wakeUp());
    this.wakeUps.clear();
  };

  private sleep(ms: number) {
    return new Promise<void>((resolve) => {
      const timer = setTimeout(done, ms);
      const self = this.wakeUps;
      function done() {
        clearTimeout(timer);
        self.delete(done);
        resolve();
      }
      self.add(done);
    });
  }

  /** Waits until fewer than `concurrency` chunks are being sent. */
  private async takeSlot() {
    while (this.busySlots >= this.concurrency && !this.stopped)
      await new Promise<void>((resolve) => this.slotWaiters.push(resolve));
    this.busySlots++;
  }

  private releaseSlot() {
    this.busySlots--;
    this.slotWaiters.shift()?.();
  }

  // Every worker stays: on a very slow connection the slots (takeSlot) let
  // fewer chunks go at once, and more again once it is better
  private async worker() {
    while (!this.stopped) {
      const job = this.queue.shift();
      if (!job) return;
      await this.uploadWithRetry(job.item, job.index);
    }
  }

  private async uploadWithRetry(item: UploadItem, index: number) {
    let attempt = 0;
    while (!this.stopped) {
      try {
        await this.uploadOnce(item, index);
        this.consecutiveStalls = 0;
        this.chunkWentThrough();
        return;
      } catch (e) {
        if (this.stopped) return;
        // Refused by the server's body parser: sent again at once, streamed
        if ((e as Error)?.name === "StreamedRetry") continue;
        this.consecutiveSuccesses = 0;
        const fatal = toFatalError(e);
        if (fatal) {
          this.stopped = true;
          throw fatal;
        }
        // A file that became unreadable (unplugged drive or card) cannot get
        // better by retrying: test 1 byte instead of retrying forever.
        await this.assertReadable(item, index);
        if ((e as Error)?.name === "StallError") {
          this.consecutiveStalls++;
          if (this.consecutiveStalls >= 2 && this.concurrency > 1) {
            this.concurrency--;
            this.consecutiveStalls = 0;
          }
        }
        attempt++;
        this.waitingRetries++;
        this.emit();
        await this.sleep(Math.min(MAX_RETRY_DELAY_MS, 1000 * 2 ** Math.min(attempt - 1, 5)));
        this.waitingRetries--;
      }
    }
  }

  /** After stalls, lets one more chunk go at once every few chunks in a row. */
  private chunkWentThrough() {
    if (this.concurrency >= this.session.parallelUploads) {
      this.consecutiveSuccesses = 0;
      return;
    }
    if (++this.consecutiveSuccesses < RECOVER_AFTER_CHUNKS) return;
    this.consecutiveSuccesses = 0;
    this.concurrency++;
    // A chunk waiting for a slot can go now
    this.slotWaiters.shift()?.();
  }

  private async assertReadable(item: UploadItem, index: number) {
    const start = index * this.session.chunkSize;
    if (chunkLength(item.size, this.session.chunkSize, index) === 0) return;
    try {
      await item.file.slice(start, start + 1).arrayBuffer();
    } catch {
      this.stopped = true;
      throw new FatalUploadError("file-read", { name: item.path });
    }
  }

  private async uploadOnce(item: UploadItem, index: number) {
    // Also limits the chunks being retried: after stalls, each chunk gets more
    // bandwidth instead of all of them failing again
    await this.takeSlot();
    if (this.stopped) {
      this.releaseSlot();
      throw new Error("Upload stopped");
    }
    const start = index * this.session.chunkSize;
    const length = chunkLength(item.size, this.session.chunkSize, index);

    // A slice of the file on disk, not a copy in memory: the browser reads it
    // while sending (reading 6 x 20 MB into memory crashed some browsers
    // with "Out of Memory").
    const data = item.file.slice(start, start + length);

    const key = `${item.id}:${index}`;
    const controller = new AbortController();
    this.controllers.add(controller);
    let lastActivity = Date.now();
    let stalled = false;
    const watchdog = setInterval(() => {
      if (Date.now() - lastActivity > STALL_TIMEOUT_MS) {
        stalled = true;
        controller.abort();
      }
    }, 5000);

    const startedAt = Date.now();
    const streamed = this.streamed;
    this.activeRequests++;
    try {
      await stundTransferService.uploadChunk(this.session, item.id, index, data, {
        signal: controller.signal,
        streamed,
        onUploadProgress: (event) => {
          lastActivity = Date.now();
          this.lastProgressAt = lastActivity;
          this.inFlight.set(key, event.loaded);
        },
      });
      item.received.add(index);
      this.confirmedBytes += length;
      this.lastProgressAt = Date.now();
    } catch (e) {
      const response = (e as AxiosError<{ error?: string }>)?.response;
      // 413 without a code: the server's body parser has a limit below this
      // deposit's chunk size (setting lowered since it started). The streamed
      // type does not go through it: this chunk and the next ones are sent
      // that way. A streamed chunk refused too is fatal (toFatalError).
      if (!streamed && response?.status === 413 && !response.data?.error) {
        this.streamed = true;
        const retryError = new Error("Send the chunk streamed");
        retryError.name = "StreamedRetry";
        throw retryError;
      }
      // A stall: no progress for 30 s, a 408 (time limit of the server), or
      // the connection cut without any answer after sending for minutes (time
      // limit of a proxy). An answer such as 502 is a normal retry, even on a
      // long chunk: on a slow uplink every chunk takes minutes.
      if (
        stalled ||
        response?.status === 408 ||
        (isAxiosError(e) &&
          !response &&
          e.code !== AxiosError.ERR_CANCELED &&
          Date.now() - startedAt > SLOW_CHUNK_MS)
      ) {
        const stallError = new Error("Upload stalled");
        stallError.name = "StallError";
        throw stallError;
      }
      throw e;
    } finally {
      clearInterval(watchdog);
      this.releaseSlot();
      this.activeRequests--;
      this.controllers.delete(controller);
      this.inFlight.delete(key);
    }
  }

  private emit() {
    const totalBytes = this.items.reduce((sum, item) => sum + item.size, 0);
    let inFlightBytes = 0;
    this.inFlight.forEach((bytes) => (inFlightBytes += bytes));
    const sentBytes = Math.min(totalBytes, this.confirmedBytes + inFlightBytes);

    const now = Date.now();
    this.samples.push({ time: now, bytes: sentBytes });
    while (this.samples.length > 2 && now - this.samples[0].time > SPEED_WINDOW_MS)
      this.samples.shift();
    const oldest = this.samples[0];
    const elapsed = (now - oldest.time) / 1000;
    const bytesPerSecond = elapsed > 0.5 ? Math.max(0, (sentBytes - oldest.bytes) / elapsed) : 0;

    this.onProgress({
      totalBytes,
      sentBytes,
      bytesPerSecond,
      secondsLeft:
        bytesPerSecond > 0 ? (totalBytes - sentBytes) / bytesPerSecond : undefined,
      filesDone: this.items.filter((i) => i.received.size >= i.totalChunks).length,
      filesTotal: this.items.length,
      reconnecting:
        this.waitingRetries > 0 ||
        navigator.onLine === false ||
        (this.activeRequests > 0 && now - this.lastProgressAt > QUIET_WARNING_MS),
    });
  }
}
