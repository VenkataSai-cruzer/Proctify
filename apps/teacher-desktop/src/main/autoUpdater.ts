// ============================================================
// SecureAssess Teacher Desktop — Auto-Updater
// Uses electron-updater to check the lab server's /updates route
// or a configured remote update feed.
// ============================================================

import { app, BrowserWindow, ipcMain } from "electron";
import { logger } from "./logger";

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

export function initAutoUpdater(mainWindow: BrowserWindow, serverUrl: string): void {
  const updater = getUpdater();
  if (!updater) return;

  updater.logger = logger;
  updater.autoDownload = false;
  updater.autoInstallOnAppQuit = true;

  // If running on lab LAN, check the local server for updates
  if (serverUrl && !serverUrl.includes("localhost") && !serverUrl.includes("127.0.0.1")) {
    updater.setFeedURL({ url: `${serverUrl}/updates` });
  }

  updater.on("checking-for-update", () => {
    mainWindow.webContents.send("updater:status", { stage: "checking" });
  });

  updater.on("update-available", (info: { version: string }) => {
    logger.info("Update available", { version: info.version });
    mainWindow.webContents.send("updater:status", {
      stage: "available", version: info.version,
    });
  });

  updater.on("update-not-available", () => {
    mainWindow.webContents.send("updater:status", { stage: "current" });
  });

  updater.on("download-progress", (progress: { percent: number }) => {
    mainWindow.webContents.send("updater:status", {
      stage: "downloading", percent: Math.round(progress.percent),
    });
  });

  updater.on("update-downloaded", (info: { version: string }) => {
    logger.info("Update downloaded", { version: info.version });
    mainWindow.webContents.send("updater:status", {
      stage: "ready", version: info.version,
    });
  });

  updater.on("error", (err: Error) => {
    logger.warn("Auto-updater error (non-fatal)", { error: err.message });
    mainWindow.webContents.send("updater:status", { stage: "error", message: err.message });
  });

  // IPC handlers
  ipcMain.handle("updater:checkNow", async () => {
    try { return await updater.checkForUpdates(); } catch { return null; }
  });
  ipcMain.handle("updater:download", async () => {
    try { return await updater.downloadUpdate(); } catch { return null; }
  });
  ipcMain.handle("updater:installNow", () => {
    updater.quitAndInstall(false, true);
  });

  // Check on startup (5s delay to let UI load)
  setTimeout(() => {
    updater.checkForUpdates().catch(() => { /* network may be unavailable */ });
  }, 5000);
}
