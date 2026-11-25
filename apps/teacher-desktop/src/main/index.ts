// ============================================================
// SecureAssess Teacher Desktop — Electron Main Process
// ============================================================

import { app, BrowserWindow, ipcMain, shell, screen, session } from "electron";
import type { IpcMainInvokeEvent } from "electron";
import path from "path";
import {
  createStartupBackup,
  ensureUserDataWritable,
  getDatabaseUrl,
  getDbPath,
  getUserDataDir,
} from "./dataGuard";
import { initAutoUpdater } from "./autoUpdater";
import { logger } from "./logger";
import { initMDNSDiscovery } from "./mdnsDiscovery";
import { registerIpcHandlers } from "./ipcHandlers";
import { registerCctvLauncherIpc } from "./cctvLauncher";
import { initTelemetry } from "./telemetry";
import { registerDiagnosticsIpc } from "./diagnostics";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const Store = require("electron-store");

const isDev = process.env.NODE_ENV === "development";

// ── Allowed IPC frame origins ─────────────────────────────────
const ALLOWED_FRAME_ORIGINS = new Set([
  "http://localhost:5173",
  "file://",
  "null",
]);

function isFrameAllowed(event: IpcMainInvokeEvent): boolean {
  try {
    const frame = event.senderFrame;
    if (!frame) return false;
    const origin = frame.origin ?? "null";
    return ALLOWED_FRAME_ORIGINS.has(origin) || origin.startsWith("file://");
  } catch {
    return false;
  }
}

// ── Persistent settings store ─────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const store: any = new Store({
  name: "secureassess-teacher",
  defaults: {
    labMode: "HOME",
    serverUrl: "http://localhost:3000",
    lastEmail: "",
    windowBounds: { width: 1440, height: 900 },
  },
});

let mainWindow: BrowserWindow | null = null;
let projectorWindow: BrowserWindow | null = null;

// ── Pre-launch data safety checks ─────────────────────────────
function runPreLaunchChecks(): void {
  if (!ensureUserDataWritable()) {
    logger.error("userData directory is not writable — cannot continue");
    app.quit();
    return;
  }

  // Run startup backup before anything else touches the DB
  try {
    createStartupBackup();
    logger.info("Startup backup created", { db: getDbPath() });
  } catch (err) {
    logger.warn("Backup skipped (first run or error)", { error: (err as Error).message });
  }

  // Write DATABASE_URL env var so the embedded server uses userData DB
  if (!isDev) {
    process.env["DATABASE_URL"] = getDatabaseUrl();
    logger.info("DATABASE_URL set to userData", { path: getDatabaseUrl() });
  }
}

// ── Window creation ───────────────────────────────────────────
async function createMainWindow(): Promise<void> {
  const bounds = store.get("windowBounds") as { width: number; height: number } | undefined;
  const { width, height } = bounds ?? { width: 1440, height: 900 };

  mainWindow = new BrowserWindow({
    width,
    height,
    minWidth: 1280,
    minHeight: 800,
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
    backgroundColor: "#0B1120",
    webPreferences: {
      preload: path.join(__dirname, "../preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,          // ← HARDENED
    },
    icon: path.join(__dirname, "../../assets/icon.png"),
  });

  mainWindow.once("ready-to-show", () => mainWindow?.show());
  mainWindow.on("resize", () => {
    const [w, h] = mainWindow!.getSize();
    store.set("windowBounds", { width: w, height: h });
  });

  // ── Strict CSP via session headers ──────────────────────
  mainWindow.webContents.session.webRequest.onHeadersReceived((details, cb) => {
    cb({
      responseHeaders: {
        ...details.responseHeaders,
        "Content-Security-Policy": [
          isDev
            ? "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' ws: wss: http://localhost:* http://secureassess-lab.local:*;"
            : "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' ws: wss: http://secureassess-lab.local:*;",
        ],
      },
    });
  });

  // ── Block external navigation ──────────────────────────
  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (!url.startsWith("http://localhost") && !url.startsWith("file://")) {
      event.preventDefault();
    }
  });

  if (isDev) {
    await mainWindow.loadURL("http://localhost:5173");
    mainWindow.webContents.openDevTools();
  } else {
    await mainWindow.loadFile(path.join(__dirname, "../../dist/renderer/index.html"));
  }
}

async function createProjectorWindow(): Promise<void> {
  const displays      = screen.getAllDisplays();
  const externalDisplay = displays.find((d) => d.id !== screen.getPrimaryDisplay().id);
  const target        = externalDisplay ?? screen.getPrimaryDisplay();

  projectorWindow = new BrowserWindow({
    x: target.bounds.x,
    y: target.bounds.y,
    width: target.bounds.width,
    height: target.bounds.height,
    fullscreen: true,
    backgroundColor: "#0B1120",
    webPreferences: {
      preload: path.join(__dirname, "../preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,          // ← HARDENED
    },
    titleBarStyle: "hidden",
  });

  if (isDev) {
    await projectorWindow.loadURL("http://localhost:5173#/projector");
  } else {
    await projectorWindow.loadFile(path.join(__dirname, "../../dist/renderer/index.html"), {
      hash: "/projector",
    });
  }
}

// ── App lifecycle ─────────────────────────────────────────────
app.whenReady().then(async () => {
  runPreLaunchChecks();
  initTelemetry();
  await createMainWindow();

  registerIpcHandlers(ipcMain, store, createProjectorWindow);

  // CCTV service launcher (spawn bundled PyInstaller binary)
  registerCctvLauncherIpc(mainWindow!);

  // 1-Click Diagnostics ZIP exporter
  registerDiagnosticsIpc();

  // mDNS discovery — notify renderer when lab server found
  initMDNSDiscovery((server) => {
    mainWindow?.webContents.send("discovery:serverFound", server);
    store.set("serverUrl", `http://${server.host}:${server.port}`);
  });

  // Auto-updater (non-dev only)
  if (!isDev && mainWindow) {
    const serverUrl = store.get("serverUrl") as string ?? "http://localhost:3000";
    initAutoUpdater(mainWindow, serverUrl);
  }

  // Expose userData path to renderer for display in Settings
  ipcMain.handle("app:getUserDataPath", () => getUserDataDir());
  ipcMain.handle("app:getDbPath",       () => getDbPath());
  ipcMain.handle("app:getDatabaseUrl",  () => getDatabaseUrl());

  app.on("activate", async () => {
    if (BrowserWindow.getAllWindows().length === 0) await createMainWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  const size = mainWindow?.getSize();
  if (size) store.set("windowBounds", { width: size[0], height: size[1] });
});

app.on("web-contents-created", (_event, contents) => {
  contents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });
});
