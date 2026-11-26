// ============================================================
// SecureAssess Teacher Desktop — CCTV Service Supervisor
// Launches the bundled PyInstaller cctv-vision binary as a child
// process, streams stdout/stderr to the renderer, monitors health and
// restarts it after an unexpected exit. Falls back to `python src/main.py`
// in development.
// ============================================================

import { app, BrowserWindow, ipcMain } from "electron";
import { spawn, type ChildProcess } from "child_process";
import path from "path";
import fs from "fs";
import { logger } from "./logger";
import { safeSend } from "./safeSend";

const MAX_RESTARTS = 3;
const RESTART_BASE_DELAY_MS = 2_000;
const HEALTH_INTERVAL_MS = 15_000;

type WindowGetter = () => BrowserWindow | null;

let child: ChildProcess | null = null;
let lastEnv: Record<string, string> = {};
let restarts = 0;
let startedAt = 0;
let intentionalStop = false;
let lastExit: { code: number | null; signal: NodeJS.Signals | null } | null = null;
let restartTimer: NodeJS.Timeout | null = null;
let healthTimer: NodeJS.Timeout | null = null;

const isDev = process.env.NODE_ENV === "development";

/** Absolute path to the bundled binary; empty string in development. */
export function getCctvBinaryPath(): string {
  if (isDev) return "";
  const resourcesDir = process.resourcesPath;
  return process.platform === "win32"
    ? path.join(resourcesDir, "cctv-vision", "cctv-vision.exe")
    : path.join(resourcesDir, "cctv-vision", "cctv-vision");
}

export function isCctvBinaryPresent(): boolean {
  const binary = getCctvBinaryPath();
  return binary !== "" && fs.existsSync(binary);
}

function getCctvArgs(): string[] {
  if (isDev) return [path.join(app.getAppPath(), "../../services/cctv-vision/src/main.py")];
  return [];
}

function getCctvCommand(): string {
  if (isDev) return process.platform === "win32" ? "python" : "python3";
  return getCctvBinaryPath();
}

function send(getWindow: WindowGetter, channel: string, payload: unknown): void {
  // Every child-process callback lands here, often after the window closed.
  safeSend(getWindow(), channel, payload);
}

function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
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

function startHealthMonitor(getWindow: WindowGetter): void {
  if (healthTimer) clearInterval(healthTimer);
  healthTimer = setInterval(() => {
    if (!child || child.pid === undefined) return;
    if (!pidAlive(child.pid)) {
      logger.warn("CCTV health check failed — no such process", { pid: child.pid, restarts });
      send(getWindow, "cctv:health", { healthy: false, pid: child.pid, restarts });
      scheduleRestart(getWindow, "health-check-failed");
    }
  }, HEALTH_INTERVAL_MS);
  healthTimer.unref?.();
}

function scheduleRestart(getWindow: WindowGetter, reason: string): void {
  if (intentionalStop || restartTimer) return;

  if (restarts >= MAX_RESTARTS) {
    logger.error("CCTV restart budget exhausted", { restarts, reason });
    send(getWindow, "cctv:health", { healthy: false, restarts, reason, exhausted: true });
    return;
  }

  restarts += 1;
  const delay = RESTART_BASE_DELAY_MS * restarts;
  logger.warn("Restarting CCTV process", { attempt: restarts, delay, reason });
  send(getWindow, "cctv:health", { healthy: false, restarts, reason, restartInMs: delay });

  restartTimer = setTimeout(() => {
    restartTimer = null;
    if (intentionalStop) return;
    spawnCctv(getWindow, lastEnv, `restart-${restarts}`);
  }, delay);
  restartTimer.unref?.();
}

function spawnCctv(
  getWindow: WindowGetter,
  env: Record<string, string>,
  reason: string
): { running: boolean; pid?: number; error?: string } {
  const cmd = getCctvCommand();
  const args = getCctvArgs();

  if (!isDev && !fs.existsSync(cmd)) {
    logger.error("CCTV binary not found", { path: cmd });
    return { running: false, error: "CCTV binary not found. Run build_bundle first." };
  }

  const childEnv: NodeJS.ProcessEnv = {
    ...process.env,
    SERVER_URL: env["serverUrl"] ?? "http://localhost:3000",
    CCTV_SERVICE_SECRET: env["cctvSecret"] ?? "",
    CAMERA_SOURCE: env["cameraSource"] ?? "0",
    FRAME_WIDTH: env["frameWidth"] ?? "1280",
    FRAME_HEIGHT: env["frameHeight"] ?? "720",
  };

  intentionalStop = false;
  startedAt = Date.now();

  const proc = spawn(cmd, args, { env: childEnv, stdio: ["ignore", "pipe", "pipe"] });
  child = proc;

  proc.stdout?.on("data", (d: Buffer) => {
    const line = d.toString().trim();
    if (line) {
      logger.info("cctv stdout", { line });
      send(getWindow, "cctv:log", { level: "info", line });
    }
  });

  proc.stderr?.on("data", (d: Buffer) => {
    const line = d.toString().trim();
    if (line) {
      logger.warn("cctv stderr", { line });
      send(getWindow, "cctv:log", { level: "warn", line });
    }
  });

  proc.on("error", (err) => {
    logger.error("CCTV process error", err);
    child = null;
    clearTimers();
    send(getWindow, "cctv:health", { healthy: false, error: err.message, restarts });
    scheduleRestart(getWindow, "spawn-error");
  });

  proc.on("exit", (code, signal) => {
    if (intentionalStop) {
      logger.info("CCTV process stopped on request", { code, signal });
      child = null;
      clearTimers();
      send(getWindow, "cctv:stopped", { code });
      return;
    }

    lastExit = { code, signal };
    child = null;
    clearTimers();
    logger.warn("CCTV process exited unexpectedly", { code, signal, restarts });
    send(getWindow, "cctv:stopped", { code });
    scheduleRestart(getWindow, `exit-${code ?? signal ?? "unknown"}`);
  });

  startHealthMonitor(getWindow);
  logger.info("CCTV process started", { cmd, pid: proc.pid, reason });
  send(getWindow, "cctv:health", { healthy: true, pid: proc.pid, restarts });

  return { running: true, pid: proc.pid };
}

/** Kill the child and stop supervising (called on app quit). */
export function disposeCctvProcess(): void {
  intentionalStop = true;
  clearTimers();
  if (child) {
    try {
      child.kill("SIGTERM");
    } catch {
      /* already gone */
    }
    child = null;
  }
}

export function registerCctvLauncherIpc(getWindow: WindowGetter): void {
  ipcMain.handle("cctv:start", async (_event, env: Record<string, string>) => {
    if (child) {
      logger.info("CCTV process already running", { pid: child.pid });
      return { running: true, pid: child.pid };
    }

    lastEnv = env ?? {};
    restarts = 0;
    return spawnCctv(getWindow, lastEnv, "ipc-start");
  });

  ipcMain.handle("cctv:stop", () => {
    if (!child) return { stopped: false };
    intentionalStop = true;
    clearTimers();
    try {
      child.kill("SIGTERM");
    } catch (err) {
      logger.warn("Failed to signal CCTV process", err);
    }
    child = null;
    return { stopped: true };
  });

  ipcMain.handle("cctv:status", () => ({
    running: child !== null,
    pid: child?.pid ?? null,
    uptimeMs: child && startedAt ? Date.now() - startedAt : 0,
    restarts,
  }));

  ipcMain.handle("cctv:health", () => {
    const pid = child?.pid ?? null;
    return {
      running: child !== null,
      healthy: pid !== null && pidAlive(pid),
      pid,
      uptimeMs: pid !== null ? Date.now() - startedAt : 0,
      restarts,
      lastExit,
      binaryPath: getCctvBinaryPath(),
      binaryPresent: isCctvBinaryPresent(),
    };
  });
}
