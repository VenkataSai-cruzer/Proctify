// ============================================================
// Proctify Student Kiosk — Auto-Updater
//
// The kiosk and the teacher console publish to the same GitHub release, so
// each uses its own electron-builder channel/manifest (`student.yml`,
// `student-linux.yml`). Sharing `latest.yml` made one app offer the other's
// installer. Downloads stay manual (`autoDownload = false`); the kiosk reports
// status to the renderer and main.log.
// ============================================================

import { app, ipcMain } from "electron";
import type { BrowserWindow } from "electron";
import path from "path";
import fs from "fs";
import { logger } from "./logger";
import { safeSend } from "./safeSend";

/** Release channel — must match `publish.channel` in electron-builder.yml. */
const UPDATE_CHANNEL = "student";

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

export function initAutoUpdater(getWindow: WindowGetter): () => void {
  const updater = getUpdater();
  if (!updater) return () => undefined;

  const send = (status: UpdaterStatus): void => {
    safeSend(getWindow(), "updater:status", status);
  };

  // Unpacked/portable builds have no app-update.yml — skip instead of logging
  // a hard ENOENT on every launch.
  const hasUpdateConfig = fs.existsSync(path.join(process.resourcesPath, "app-update.yml"));
  if (!hasUpdateConfig) {
    logger.info("Auto-updater disabled — this build has no app-update.yml", {
      channel: UPDATE_CHANNEL,
      resources: process.resourcesPath,
    });
    ipcMain.handle("updater:check", () => ({
      stage: "disabled",
      channel: UPDATE_CHANNEL,
      message: "This build has no update configuration",
    }));
    ipcMain.handle("updater:download", () => null);
    ipcMain.handle("updater:install", () => false);
    return () => undefined;
  }

  updater.logger = logger;
  updater.autoDownload = false;     // a kiosk must never swap itself mid-exam
  updater.autoInstallOnAppQuit = true;
  updater.channel = UPDATE_CHANNEL; // → student.yml / student-linux.yml

  logger.info("Auto-updater configured", {
    channel: UPDATE_CHANNEL,
    currentVersion: app.getVersion(),
  });

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
    send({ stage: "progress", channel: UPDATE_CHANNEL, percent: Math.round(progress.percent) });
  const onDownloaded = (info: { version: string }) => {
    logger.info("Updater: update downloaded", { version: info.version, channel: UPDATE_CHANNEL });
    send({ stage: "downloaded", channel: UPDATE_CHANNEL, version: info.version });
  };
  const onError = (err: Error) => {
    logger.warn("Updater: error (non-fatal)", { channel: UPDATE_CHANNEL, error: err.message });
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

  const startupTimer = setTimeout(() => {
    updater.checkForUpdates().catch(() => { /* offline lab network */ });
  }, 8_000);
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
