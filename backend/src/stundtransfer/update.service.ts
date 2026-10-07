// StundTransfer: "Mettre à jour" page. The image knows its commit
// (STUNDTRANSFER_VERSION, set by the GitHub workflow); the newest image that
// passed the tests is read from GitHub. The button only drops a request file
// in the data folder: a DSM scheduled task (run as root, outside the
// container) sees it, pulls the new image and restarts the project. The
// container never gets any control over Docker.
import { Injectable, Logger } from "@nestjs/common";
import { User } from "@prisma/client";
import * as fs from "fs/promises";
import * as path from "path";
import { DATA_DIRECTORY } from "src/constants";

const REPO = process.env.STUNDTRANSFER_REPO || "StundZow/StundTransfer";
const BRANCH = process.env.STUNDTRANSFER_BRANCH || "stundtransfer";
const WORKFLOW = "stundtransfer-image.yml";
// GitHub allows 60 anonymous calls per hour: one every few minutes is plenty
const CACHE_MS = 3 * 60 * 1000;
// "Vérifier" asks again at once, but not more than this often
const FRESH_MIN_MS = 15 * 1000;
// Read by the DSM task (it deletes it, then writes the result in update.log)
const REQUEST_FILE = path.join(DATA_DIRECTORY, "update-requested");
const LOG_FILE = path.join(DATA_DIRECTORY, "update.log");

const CURRENT = (process.env.STUNDTRANSFER_VERSION ?? "").trim() || null;
const BUILT_AT = (process.env.STUNDTRANSFER_BUILT_AT ?? "").trim() || null;

type Version = { sha: string; date: string | null };

@Injectable()
export class UpdateService {
  private readonly logger = new Logger("StundTransfer");
  private cache?: { at: number; latest: Version | null; error: boolean };

  /** Newest image published by the workflow (only after the tests passed). */
  private async latest(fresh = false) {
    const age = this.cache ? Date.now() - this.cache.at : Infinity;
    if (age < (fresh ? FRESH_MIN_MS : CACHE_MS)) return this.cache;
    try {
      const response = await fetch(
        `https://api.github.com/repos/${REPO}/actions/workflows/${WORKFLOW}/runs?branch=${BRANCH}&status=success&per_page=1`,
        {
          headers: { Accept: "application/vnd.github+json", "User-Agent": "StundTransfer" },
          signal: AbortSignal.timeout(10_000),
        },
      );
      if (!response.ok) throw new Error(`GitHub answered ${response.status}`);
      const { workflow_runs } = (await response.json()) as {
        workflow_runs?: { head_sha: string; updated_at?: string }[];
      };
      const run = workflow_runs?.[0];
      this.cache = {
        at: Date.now(),
        latest: run ? { sha: run.head_sha, date: run.updated_at ?? null } : null,
        error: false,
      };
    } catch (e) {
      this.logger.warn(`Cannot check for updates: ${e?.message ?? e}`);
      this.cache = { at: Date.now(), latest: null, error: true };
    }
    return this.cache;
  }

  async status(fresh = false) {
    const { latest, error } = await this.latest(fresh);
    const requestedAt = await fs
      .stat(REQUEST_FILE)
      .then((stats) => stats.mtime.toISOString())
      .catch(() => null);
    const lastLog = await fs
      .readFile(LOG_FILE, "utf8")
      .then((log) => log.trim().split("\n").pop() || null)
      .catch(() => null);
    return {
      current: CURRENT ? { sha: CURRENT, date: BUILT_AT } : null,
      latest,
      available: !!(CURRENT && latest && latest.sha !== CURRENT),
      // Waiting for the DSM task (it deletes the file when it starts)
      requestedAt,
      lastLog,
      checkFailed: error,
    };
  }

  async request(user: User) {
    await fs.writeFile(REQUEST_FILE, `${new Date().toISOString()} ${user.username}\n`);
    this.logger.log(`Update requested by ${user.username}`);
    return this.status();
  }
}
