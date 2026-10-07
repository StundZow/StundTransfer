// StundTransfer: "Mettre à jour" page. The image knows its commit
// (STUNDTRANSFER_VERSION, set by the GitHub workflow); the newest image that
// passed the tests is read from GitHub. The container never gets any control
// over Docker; the button asks something outside it to install the image:
// - STUNDTRANSFER_UPDATER_URL set: an updater container (Watchtower in HTTP
//   API mode, reachable only on the Docker network, with a token) does it at
//   once, nothing runs in a loop;
// - otherwise: a request file in the data folder, for a DSM scheduled task.
import { HttpStatus, Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { User } from "@prisma/client";
import * as fs from "fs/promises";
import * as path from "path";
import { DATA_DIRECTORY } from "src/constants";
import { stundError } from "./deposit.service";

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
// With an updater: which version asked, to write the result after the restart
const PENDING_FILE = path.join(DATA_DIRECTORY, "update-pending.json");
const UPDATER_URL = (process.env.STUNDTRANSFER_UPDATER_URL ?? "").trim();
const UPDATER_TOKEN = (process.env.STUNDTRANSFER_UPDATER_TOKEN ?? "").trim();
// Still the same version this long after asking: nothing new was installed
const PENDING_GIVE_UP_MS = 10 * 60 * 1000;

// Local time of the NAS owner (the container clock is UTC)
const stamp = () =>
  new Date().toLocaleString("sv-SE", { timeZone: process.env.TZ || "Europe/Paris" }).slice(0, 16);

const CURRENT = (process.env.STUNDTRANSFER_VERSION ?? "").trim() || null;
const BUILT_AT = (process.env.STUNDTRANSFER_BUILT_AT ?? "").trim() || null;

type Version = { sha: string; date: string | null };

@Injectable()
export class UpdateService implements OnModuleInit {
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

  private async log(line: string) {
    await fs.appendFile(LOG_FILE, `${stamp()} ${line}\n`).catch(() => undefined);
  }

  /** After a restart asked through the updater: writes down what happened. */
  private async settlePending(giveUpOnly: boolean) {
    const pending = await fs
      .readFile(PENDING_FILE, "utf8")
      .then((text) => JSON.parse(text) as { from: string | null; at: string })
      .catch(() => null);
    if (!pending) return;
    if (pending.from !== CURRENT) {
      if (giveUpOnly) return;
      await this.log(`mise a jour installee (${CURRENT?.slice(0, 7) ?? "?"})`);
    } else if (Date.now() - Date.parse(pending.at) > PENDING_GIVE_UP_MS) {
      await this.log("aucune nouvelle version installee");
    } else return;
    await fs.rm(PENDING_FILE, { force: true });
  }

  async onModuleInit() {
    await this.settlePending(false);
  }

  async status(fresh = false) {
    await this.settlePending(true);
    const { latest, error } = await this.latest(fresh);
    const requestedAt = await fs
      .stat(UPDATER_URL ? PENDING_FILE : REQUEST_FILE)
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
    this.logger.log(`Update requested by ${user.username}`);
    if (!UPDATER_URL) {
      await fs.writeFile(REQUEST_FILE, `${new Date().toISOString()} ${user.username}\n`);
      return this.status();
    }
    await fs.writeFile(
      PENDING_FILE,
      JSON.stringify({ from: CURRENT, at: new Date().toISOString(), by: user.username }),
    );
    // Watchtower's API wants a POST; with async=true it answers 202 at once and
    // then replaces this container in the background
    const url = new URL(UPDATER_URL);
    url.searchParams.set("async", "true");
    let problem: string | null = null;
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { Authorization: `Bearer ${UPDATER_TOKEN}` },
        signal: AbortSignal.timeout(15_000),
      });
      // 429: an update is already running, fine
      if (!response.ok && response.status !== 429) problem = `answered ${response.status}`;
    } catch (e) {
      problem = e?.cause?.code ?? e?.message ?? String(e);
    }
    if (problem) {
      this.logger.warn(`Updater: ${problem}`);
      await fs.rm(PENDING_FILE, { force: true });
      await this.log(`ECHEC : l'assistant de mise a jour ne repond pas (${problem})`);
      throw stundError(
        HttpStatus.SERVICE_UNAVAILABLE,
        "stund_updater_unreachable",
        "The update assistant does not answer",
      );
    }
    return this.status();
  }
}
