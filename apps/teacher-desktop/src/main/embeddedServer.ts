// ============================================================
// SecureAssess Teacher Desktop — Embedded API server supervisor
//
// The installed .exe must work with zero terminal commands, so the Teacher
// app owns the API server:
//   • spawn  resources/server/bundle.cjs with process.execPath and
//            ELECTRON_RUN_AS_NODE=1 (a Node runtime ships with Electron)
//   • SQLite lives at <userData>/proctify.db; the server creates the schema
//     on first boot (see apps/server/src/db/bootstrap.ts)
//   • wait for GET /health → 200 before the UI is shown
//   • restart on unexpected exit (bounded), stream logs to main.log
//   • terminate the child before the app exits (lifecycle cleanup registry)
// ============================================================

import { app, ipcMain } from "electron";
import type { BrowserWindow } from "electron";
import { spawn, type ChildProcess } from "child_process";
import net from "net";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { logger } from "./logger";
import { safeSend } from "./safeSend";
import { registerCleanup } from "./lifecycle";

const DEFAULT_PORT = 3000;
const HEALTH_TIMEOUT_MS = 30_000;
const HEALTH_POLL_MS = 300;
const MAX_RESTARTS = 3;
const RESTART_DELAY_MS = 1_500;
const HEALTH_INTERVAL_MS = 20_000;

export type LabMode = "HOME" | "LAB_SERVER" | "LAB_CLIENT";

export interface ServerStatus {
  ok: boolean;
  labMode: LabMode | null;
  running: boolean;
  embedded: boolean;
  healthy: boolean;
  port: number;
  url: string;
  pid: number | null;
  restarts: number;
  lastError: string | null;
  bundlePath: string;
  dbPath: string;
}

export interface StartOptions {
  labMode: LabMode;
  preferredPort?: number;
  /** Override DB location (smoke test uses a throwaway database). */
  dbPath?: string;
  /** Override log directory (smoke test keeps server logs beside its DB). */
  logDir?: string;
  /** How long to wait for /health before giving up. */
  waitMs?: number;
  /** Do not restart the child if it exits (smoke test). */
  noAutoRestart?: boolean;
}

let child: ChildProcess | null = null;
let stopping = false;
let restarts = 0;
let port = DEFAULT_PORT;
let url = `http://127.0.0.1:${DEFAULT_PORT}`;
let lastError: string | null = null;
let reusableExternal = false;
let restartTimer: NodeJS.Timeout | null = null;
let healthTimer: NodeJS.Timeout | null = null;
let startPromise: Promise<ServerStatus> | null = null;
let currentOptions: StartOptions | null = null;
let getWindow: () => BrowserWindow | null = () => null;

const cleanupRegistered = { done: false };

function ensureCleanupRegistered(): void {
  if (cleanupRegistered.done) return;
  cleanupRegistered.done = true;
  registerCleanup("embedded-server", () => stopEmbeddedServer());
}

/** resources/server/bundle.cjs in production, apps/server/dist in development. */
export function getServerBundlePath(): string {
  if (app.isPackaged) return path.join(process.resourcesPath, "server", "bundle.cjs");
  return path.join(app.getAppPath(), "..", "server", "dist", "bundle.cjs");
}

export function isEmbeddedServerAvailable(): boolean {
  try {
    return fs.existsSync(getServerBundlePath());
  } catch {
    return false;
  }
}

function getDbPath(opts?: StartOptions): string {
  return opts?.dbPath ?? path.join(app.getPath("userData"), "proctify.db");
}

/** Stable per-install JWT secret so sessions survive restarts. */
function getServerSecret(): string {
  const file = path.join(app.getPath("userData"), "server-secret.key");
  try {
    if (fs.existsSync(file)) {
      const existing = fs.readFileSync(file, "utf8").trim();
      if (existing.length >= 32) return existing;
    }
    const secret = crypto.randomBytes(32).toString("hex");
    fs.writeFileSync(file, secret, { mode: 0o600 });
    return secret;
  } catch (err) {
    logger.warn("Could not persist server secret — using in-memory secret", {
      error: err instanceof Error ? err.message : String(err),
    });
    return crypto.randomBytes(32).toString("hex");
  }
}

export function getServerStatus(): ServerStatus {
  return {
    ok: !lastError && (reusableExternal || child !== null),
    labMode: currentOptions?.labMode ?? null,
    running: reusableExternal || child !== null,
    embedded: child !== null,
    healthy: lastError === null,
    port,
    url,
    pid: child?.pid ?? null,
    restarts,
    lastError,
    bundlePath: getServerBundlePath(),
    dbPath: currentOptions ? getDbPath(currentOptions) : path.join(app.getPath("userData"), "proctify.db"),
  };
}

function notify(status: ServerStatus = getServerStatus()): void {
  safeSend(getWindow(), "server:status", status);
}

async function fetchHealth(target: string, timeoutMs = 1_500): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(`${target}/health`, { signal: controller.signal }).finally(() =>
      clearTimeout(timer)
    );
    if (!res.ok) return false;
    const body = (await res.json()) as { service?: string; db?: { ok?: boolean } };
    return body.service === "secureassess-server" && body.db?.ok !== false;
  } catch {
    return false;
  }
}

function isPortFree(candidate: number): Promise<boolean> {
  return new Promise((resolve) => {
    const tester = net.createServer();
    tester.once("error", () => resolve(false));
    tester.once("listening", () => tester.close(() => resolve(true)));
    tester.listen(candidate, "127.0.0.1");
  });
}

function findFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const tester = net.createServer();
    tester.once("error", reject);
    tester.listen(0, "127.0.0.1", () => {
      const address = tester.address();
      const assigned = typeof address === "object" && address ? address.port : 0;
      tester.close(() => resolve(assigned));
    });
  });
}

function clearTimers(): void {
  if (restartTimer) {
    clearTimeout(restartTimer);
    restartTimer = null;
  }
  if (healthTimer) {
    clearInterval(healthTimer);
    healthTimer = null;
  }
}

function scheduleRestart(reason: string): void {
  if (stopping || restartTimer || !currentOptions || currentOptions.noAutoRestart) return;

  if (restarts >= MAX_RESTARTS) {
    lastError = `server exited repeatedly (${reason}); restart budget exhausted`;
    logger.error("Embedded server restart budget exhausted", { reason, restarts });
    notify();
    return;
  }

  restarts += 1;
  const delay = RESTART_DELAY_MS * restarts;
  logger.warn("Restarting embedded server", { attempt: restarts, delay, reason });
  restartTimer = setTimeout(() => {
    restartTimer = null;
    if (stopping || !currentOptions) return;
    spawnServer(currentOptions, port, `restart-${restarts}`);
  }, delay);
  restartTimer.unref?.();
}

function pipeLogs(proc: ChildProcess, level: "info" | "warn"): void {
  const handle = (stream: NodeJS.ReadableStream | null): void => {
    if (!stream) return;
    stream.on("data", (chunk: Buffer) => {
      for (const line of chunk.toString().split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        logger[level]("embedded-server", { line: trimmed });
        safeSend(getWindow(), "server:log", { level, line: trimmed });
      }
    });
  };
  handle(proc.stdout);
  handle(proc.stderr);
}

function spawnServer(opts: StartOptions, targetPort: number, reason: string): void {
  const bundlePath = getServerBundlePath();
  if (!fs.existsSync(bundlePath)) {
    lastError = `embedded server bundle missing: ${bundlePath}`;
    logger.error("Embedded server bundle missing", { path: bundlePath });
    notify();
    return;
  }

  const dbPath = getDbPath(opts);
  const logDir = opts.logDir ?? path.join(app.getPath("userData"), "logs", "server");

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    // Make the packaged Electron binary behave as plain Node for this child.
    ELECTRON_RUN_AS_NODE: "1",
    PORT: String(targetPort),
    DATABASE_URL: `file:${dbPath}`,
    NODE_ENV: "production",
    EMBEDDED_SERVER: "1",
    LOG_DIR: logDir,
    EXPORTS_DIR: path.join(app.getPath("userData"), "exports"),
    JWT_SECRET: getServerSecret(),
    LAB_NAME: "Proctify Lab",
    APP_VERSION: app.getVersion(),
  };
  // Never let the child re-enter smoke-test mode or debug flags.
  delete env["ELECTRON_ENABLE_LOGGING"];

  lastError = null;
  const proc = spawn(process.execPath, [bundlePath], {
    env,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  child = proc;
  logger.info("Embedded server spawned", { pid: proc.pid, port: targetPort, dbPath, reason });

  pipeLogs(proc, "info");

  proc.on("error", (err) => {
    lastError = `spawn failed: ${err.message}`;
    logger.error("Embedded server spawn error", { error: err.message });
    child = null;
    notify();
    scheduleRestart("spawn-error");
  });

  proc.on("exit", (code, signal) => {
    const wasStopping = stopping;
    child = null;
    clearTimers();
    if (wasStopping) {
      logger.info("Embedded server stopped", { code, signal });
      notify();
      return;
    }
    lastError = `embedded server exited (code=${code ?? "null"} signal=${signal ?? "none"})`;
    logger.warn("Embedded server exited unexpectedly", { code, signal, restarts });
    notify();
    scheduleRestart(`exit-${code ?? signal ?? "unknown"}`);
  });

  startHealthLoop(targetPort);
}

function startHealthLoop(targetPort: number): void {
  if (healthTimer) clearInterval(healthTimer);
  healthTimer = setInterval(() => {
    void (async () => {
      const healthy = await fetchHealth(`http://127.0.0.1:${targetPort}`);
      if (!healthy && child) {
        lastError = "embedded server failed health check";
        logger.warn("Embedded server health check failed", { port: targetPort });
        notify();
      } else if (healthy && lastError === "embedded server failed health check") {
        lastError = null;
        notify();
      }
    })();
  }, HEALTH_INTERVAL_MS);
  healthTimer.unref?.();
}

/** Poll GET /health until the server answers 200. */
async function waitForHealthy(targetUrl: string, waitMs: number): Promise<boolean> {
  const deadline = Date.now() + waitMs;
  while (Date.now() < deadline) {
    if (!child && !reusableExternal) {
      // Child died before becoming healthy — no point waiting the full window.
      if (lastError) return false;
    }
    if (await fetchHealth(targetUrl)) return true;
    await new Promise((resolve) => setTimeout(resolve, HEALTH_POLL_MS));
  }
  return false;
}

/**
 * Start (or adopt) the API server. Resolves only after /health answers 200,
 * or with `ok: false` describing why it could not.
 */
export function startEmbeddedServer(opts: StartOptions): Promise<ServerStatus> {
  if (startPromise) return startPromise;
  ensureCleanupRegistered();
  currentOptions = opts;
  stopping = false;

  const run = (async (): Promise<ServerStatus> => {
    if (opts.labMode === "LAB_CLIENT") {
      logger.info("LAB_CLIENT mode — not starting an embedded API server");
      lastError = null;
      return getServerStatus();
    }

    if (!isEmbeddedServerAvailable()) {
      lastError = `embedded server bundle not found at ${getServerBundlePath()}`;
      logger.error("Embedded server unavailable", { path: getServerBundlePath() });
      notify();
      return getServerStatus();
    }

    const preferred = opts.preferredPort ?? DEFAULT_PORT;

    // Port 0 means "pick any free port" (used by the packaged smoke test).
    if (preferred <= 0) {
      port = await findFreePort();
      url = `http://127.0.0.1:${port}`;
      reusableExternal = false;
      spawnServer(opts, port, "start");
      const healthyOnAnyPort = await waitForHealthy(url, opts.waitMs ?? HEALTH_TIMEOUT_MS);
      if (!healthyOnAnyPort) {
        lastError = lastError ?? "embedded server did not become healthy on a free port";
        logger.error("Embedded server failed to become healthy", { url, error: lastError });
        notify();
          return getServerStatus();
      }
      lastError = null;
      logger.info("Embedded server healthy", { url, pid: child?.pid ?? null });
      notify();
      return getServerStatus();
    }

    // Adopt a server that is already listening (e.g. a previous instance that
    // has not finished shutting down, or a lab server on this machine).
    if (await fetchHealth(`http://127.0.0.1:${preferred}`)) {
      port = preferred;
      url = `http://127.0.0.1:${preferred}`;
      reusableExternal = true;
      lastError = null;
      logger.info("Reusing already-running API server", { url });
      notify();
      return getServerStatus();
    }

    port = preferred;
    if (!(await isPortFree(port))) {
      port = await findFreePort();
      logger.warn("Preferred port busy — using a free port", { preferred, port });
    }
    url = `http://127.0.0.1:${port}`;
    reusableExternal = false;

    spawnServer(opts, port, "start");
    const healthy = await waitForHealthy(url, opts.waitMs ?? HEALTH_TIMEOUT_MS);

    if (!healthy) {
      lastError = lastError ?? `embedded server did not answer /health within ${opts.waitMs ?? HEALTH_TIMEOUT_MS}ms`;
      logger.error("Embedded server failed to become healthy", { url, error: lastError });
      notify();
      return getServerStatus();
    }

    lastError = null;
    logger.info("Embedded server healthy", { url, pid: child?.pid ?? null });
    notify();
    startPromise = null;
    return getServerStatus();
  })();

  // Concurrent callers share the in-flight start; the slot is released once it
  // settles so a later restart can start a fresh attempt.
  startPromise = run;
  const release = (): void => {
    if (startPromise === run) startPromise = null;
  };
  void run.then(release, release);
  return run;
}

/** Stop the child (and stop supervising). Safe to call multiple times. */
export async function stopEmbeddedServer(): Promise<void> {
  stopping = true;
  clearTimers();

  const proc = child;
  child = null;
  if (!proc || proc.exitCode !== null) {
    logger.info("Embedded server already stopped");
    return;
  }

  await new Promise<void>((resolve) => {
    const done = (): void => resolve();
    proc.once("exit", done);
    try {
      proc.kill("SIGTERM");
    } catch {
      /* already gone */
    }
    setTimeout(() => {
      try {
        proc.kill("SIGKILL");
      } catch {
        /* ignore */
      }
      resolve();
    }, 4_000).unref?.();
  });

  logger.info("Embedded server terminated");
}

export function setServerWindowGetter(getter: () => BrowserWindow | null): void {
  getWindow = getter;
}

export function registerServerIpc(): void {
  ipcMain.handle("server:info", () => getServerStatus());
  ipcMain.handle("server:restart", async () => {
    await stopEmbeddedServer();
    startPromise = null;
    stopping = false;
    restarts = 0;
    if (!currentOptions) return getServerStatus();
    return startEmbeddedServer(currentOptions);
  });
}
