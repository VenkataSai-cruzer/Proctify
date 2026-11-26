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
import {
  disposeCctvProcess,
  getCctvBinaryPath,
  isCctvBinaryPresent,
  registerCctvLauncherIpc,
} from "./cctvLauncher";
import { initTelemetry } from "./telemetry";
import { registerDiagnosticsIpc } from "./diagnostics";
import { installGlobalErrorHandlers } from "./crashGuard";
import { runSmokeTest } from "./smokeTest";

// electron-store is bundled into this file by scripts/build-electron.mjs
// eslint-disable-next-line @typescript-eslint/no-require-imports
const Store = require("electron-store");

const isDev = process.env.NODE_ENV === "development";
const isSmokeTest = process.argv.includes("--smoke-test");

// Install before anything else can throw so early failures still hit main.log
installGlobalErrorHandlers();

// Channels the smoke test expects to exist after IPC registration
const SMOKE_TEST_CHANNELS = [
  "store:get",
  "store:set",
  "dialog:openFile",
  "dialog:saveFile",
  "dialog:openDirectory",
  "fs:readFile",
  "fs:writeFile",
  "fs:openPath",
  "pdf:extractText",
  "projector:open",
  "app:getVersion",
  "app:getPlatform",
  "app:getUserDataPath",
  "app:getDbPath",
  "app:getDatabaseUrl",
  "cctv:start",
  "cctv:stop",
  "cctv:status",
  "cctv:health",
  "diagnostics:export",
];

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
function runPreLaunchChecks(): boolean {
  if (!ensureUserDataWritable()) {
    logger.error("userData directory is not writable — cannot continue");
    app.quit();
    return false;
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

  return true;
}

/** IPC surface for app paths/versions — shared by the normal and smoke-test boot. */
function registerAppInfoIpc(): void {
  ipcMain.handle("app:getUserDataPath", () => getUserDataDir());
  ipcMain.handle("app:getDbPath", () => getDbPath());
  ipcMain.handle("app:getDatabaseUrl", () => getDatabaseUrl());
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
      preload: path.join(__dirname, "../preload/index.js"),
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
          // connect-src must cover the configured lab server (any LAN host,
          // or localhost when this machine runs the server). script-src stays
          // locked to 'self'.
          isDev
            ? "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' http: https: ws: wss:;"
            : "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' http: https: ws: wss:;",
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
      preload: path.join(__dirname, "../preload/index.js"),
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
  const preLaunchOk = runPreLaunchChecks();
  if (!preLaunchOk && !isSmokeTest) return; // app.quit() already requested

  initTelemetry();

  // ── Packaged smoke test: boot services, verify layout, exit ──
  if (isSmokeTest) {
    registerIpcHandlers(ipcMain, store, createProjectorWindow);
    registerCctvLauncherIpc(() => mainWindow);
    registerDiagnosticsIpc();
    registerAppInfoIpc();

    await runSmokeTest({
      store,
      requiredIpcChannels: SMOKE_TEST_CHANNELS,
      cctv: {
        expected: !isDev,
        binaryPath: getCctvBinaryPath(),
        present: isCctvBinaryPresent(),
      },
    });
    return;
  }

  logger.info("main process ready", {
    version: app.getVersion(),
    packaged: app.isPackaged,
    serverUrl: store.get("serverUrl"),
  });

  await createMainWindow();
  logger.info("main window created");

  registerIpcHandlers(ipcMain, store, createProjectorWindow);

  // CCTV service supervisor (spawn bundled PyInstaller binary)
  registerCctvLauncherIpc(() => mainWindow);

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
  registerAppInfoIpc();

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
  disposeCctvProcess();
});

app.on("web-contents-created", (_event, contents) => {
  contents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });
});
