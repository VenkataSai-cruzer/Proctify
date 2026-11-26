// ============================================================
// Proctify Teacher Desktop — Auto-Updater
//
// Multi-app release safety: both desktop apps publish to the same GitHub
// release, so each one uses its own electron-builder channel and therefore its
// own manifest (`teacher.yml` / `teacher-linux.yml` vs `student*.yml`).
// Without this, whichever app built last overwrote `latest.yml` and the other
// app would download a foreign installer.
//
// Downloads are never started automatically (`autoDownload = false`); the
// renderer drives check → download → restart through IPC and receives live
// status events, which are all mirrored into main.log.
// ============================================================

import { app, ipcMain } from "electron";
import type { BrowserWindow } from "electron";
import path from "path";
import fs from "fs";
import { logger } from "./logger";
import { safeSend } from "./safeSend";

/** Release channel — must match `publish.channel` in electron-builder.yml. */
const UPDATE_CHANNEL = "teacher";

export type UpdaterStage =
  | "checking"
  | "available"
  | "not-available"
  | "progress"
  | "downloaded"
  | "error"
  | "disabled";

export interface UpdaterStatus {
  stage: UpdaterStage;
  channel: string;
  version?: string;
  percent?: number;
  message?: string;
}

// Lazy-load electron-updater so it doesn't crash in dev
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let autoUpdater: any = null;

function getUpdater() {
  if (!autoUpdater) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      autoUpdater = require("electron-updater").autoUpdater;
    } catch {
      logger.warn("electron-updater not available");
    }
  }
  return autoUpdater;
}

export type WindowGetter = () => BrowserWindow | null;

/** Returns a disposer that removes timers/listeners on shutdown. */
export function initAutoUpdater(getWindow: WindowGetter, serverUrl: string): () => void {
  const updater = getUpdater();
  if (!updater) return () => undefined;

  const send = (status: UpdaterStatus): void => {
    safeSend(getWindow(), "updater:status", status);
  };

  // electron-builder writes app-update.yml into resources/ for installed
  // builds only. Unpacked (--dir) and portable copies have no update config,
  // and electron-updater logs a hard ENOENT error when asked to check anyway.
  const hasRemoteFeed =
    Boolean(serverUrl) && !serverUrl.includes("localhost") && !serverUrl.includes("127.0.0.1");
  const hasUpdateConfig = fs.existsSync(path.join(process.resourcesPath, "app-update.yml"));
  if (!hasRemoteFeed && !hasUpdateConfig) {
    logger.info("Auto-updater disabled — this build has no app-update.yml", {
      channel: UPDATE_CHANNEL,
      resources: process.resourcesPath,
      packaged: app.isPackaged,
    });
    const disabled: UpdaterStatus = {
      stage: "disabled",
      channel: UPDATE_CHANNEL,
      message: "This build has no update configuration",
    };
    ipcMain.handle("updater:check", () => disabled);
    ipcMain.handle("updater:download", () => null);
    ipcMain.handle("updater:install", () => false);
    return () => undefined;
  }

  updater.logger = logger;
  updater.autoDownload = false;     // user-initiated only
  updater.autoInstallOnAppQuit = true;
  updater.channel = UPDATE_CHANNEL; // → teacher.yml / teacher-linux.yml

  logger.info("Auto-updater configured", {
    channel: UPDATE_CHANNEL,
    currentVersion: app.getVersion(),
  });

  // If running on lab LAN, check the local server for updates
  if (hasRemoteFeed) {
    updater.setFeedURL({ url: `${serverUrl}/updates/${UPDATE_CHANNEL}` });
  }

  const onChecking = () => {
    logger.info("Updater: checking for update", { channel: UPDATE_CHANNEL });
    send({ stage: "checking", channel: UPDATE_CHANNEL });
  };
  const onAvailable = (info: { version: string }) => {
    logger.info("Updater: update available", { version: info.version, channel: UPDATE_CHANNEL });
    send({ stage: "available", channel: UPDATE_CHANNEL, version: info.version });
  };
  const onNotAvailable = (info: { version?: string }) => {
    logger.info("Updater: already up to date", {
      current: app.getVersion(),
      latest: info?.version,
      channel: UPDATE_CHANNEL,
    });
    send({ stage: "not-available", channel: UPDATE_CHANNEL, version: app.getVersion() });
  };
  const onProgress = (progress: { percent: number }) =>
    send({
      stage: "progress",
      channel: UPDATE_CHANNEL,
      percent: Math.round(progress.percent),
    });
  const onDownloaded = (info: { version: string }) => {
    logger.info("Updater: update downloaded", { version: info.version, channel: UPDATE_CHANNEL });
    send({ stage: "downloaded", channel: UPDATE_CHANNEL, version: info.version });
  };
  const onError = (err: Error) => {
    logger.warn("Updater: error (non-fatal)", {
      channel: UPDATE_CHANNEL,
      error: err.message,
    });
    send({ stage: "error", channel: UPDATE_CHANNEL, message: err.message });
  };

  updater.on("checking-for-update", onChecking);
  updater.on("update-available", onAvailable);
  updater.on("update-not-available", onNotAvailable);
  updater.on("download-progress", onProgress);
  updater.on("update-downloaded", onDownloaded);
  updater.on("error", onError);

  ipcMain.handle("updater:check", async () => {
    try {
      const result = await updater.checkForUpdates();
      return {
        stage: result?.updateInfo ? "available" : "not-available",
        channel: UPDATE_CHANNEL,
        version: result?.updateInfo?.version,
      } satisfies UpdaterStatus;
    } catch (err) {
      logger.warn("Updater: check failed", { error: (err as Error).message });
      return { stage: "error", channel: UPDATE_CHANNEL, message: (err as Error).message } satisfies UpdaterStatus;
    }
  });

  ipcMain.handle("updater:download", async () => {
    try {
      await updater.downloadUpdate();
      return true;
    } catch (err) {
      logger.warn("Updater: download failed", { error: (err as Error).message });
      send({ stage: "error", channel: UPDATE_CHANNEL, message: (err as Error).message });
      return false;
    }
  });

  ipcMain.handle("updater:install", () => {
    logger.info("Updater: restarting to install", { channel: UPDATE_CHANNEL });
    updater.quitAndInstall(false, true);
    return true;
  });

  // Check on startup (5s delay to let UI load)
  const startupTimer = setTimeout(() => {
    updater.checkForUpdates().catch(() => { /* network may be unavailable */ });
  }, 5_000);
  startupTimer.unref?.();

  return () => {
    clearTimeout(startupTimer);
    for (const [event, handler] of [
      ["checking-for-update", onChecking],
      ["update-available", onAvailable],
      ["update-not-available", onNotAvailable],
      ["download-progress", onProgress],
      ["update-downloaded", onDownloaded],
      ["error", onError],
    ] as const) {
      try { updater.removeListener(event, handler); } catch { /* ignore */ }
    }
  };
}
