// ============================================================
// SecureAssess Teacher Desktop — Electron Main Process
//
// Startup contract (packaged, zero terminal required):
//   1. data guards (writable userData, DB backup, DATABASE_URL)
//   2. embedded API server on 127.0.0.1:<port> and /health 200
//   3. window loads the bundled renderer (HashRouter, relative asset base)
//   4. every main → renderer message goes through safeSend
//   5. every background resource is released before the windows are gone
// ============================================================

import { app, BrowserWindow, ipcMain, shell, screen, Menu } from "electron";
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
import { safeSend, safeGetSize } from "./safeSend";
import { installLifecycleCleanup, registerCleanup } from "./lifecycle";
import { attachRendererDiagnostics } from "./rendererDiagnostics";
import {
  getServerBundlePath,
  getServerStatus,
  registerServerIpc,
  setServerWindowGetter,
  startEmbeddedServer,
  stopEmbeddedServer,
  type LabMode,
} from "./embeddedServer";

// electron-store is bundled into this file by scripts/build-electron.mjs
// eslint-disable-next-line @typescript-eslint/no-require-imports
const Store = require("electron-store");

const isDev = process.env.NODE_ENV === "development";
const isSmokeTest = process.argv.includes("--smoke-test");

// Install before anything else can throw so early failures still hit main.log
installGlobalErrorHandlers();

// No default File/Edit/View/Window/Help menu: it exposes DevTools/Reload and
// looks wrong in a packaged product. Chromium keeps the standard text editing
// shortcuts (Ctrl+C/V/X/A) working inside inputs without it.
Menu.setApplicationMenu(null);

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
  "server:info",
  "server:restart",
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
    serverUrl: "http://127.0.0.1:3000",
    serverPort: 3000,
    lastEmail: "",
    windowBounds: { width: 1440, height: 900 },
  },
});

let mainWindow: BrowserWindow | null = null;
let projectorWindow: BrowserWindow | null = null;

// Window bounds are persisted on quit and on resize — both must tolerate an
// already-destroyed window (this was the `Object has been destroyed` crash).
installLifecycleCleanup(() => {
  const size = safeGetSize(mainWindow);
  if (size) store.set("windowBounds", { width: size[0], height: size[1] });
});

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
function applySecurityHandlers(win: BrowserWindow): void {
  // ── Strict CSP via session headers (http/dev loads) ────────
  win.webContents.session.webRequest.onHeadersReceived((details, cb) => {
    cb({
      responseHeaders: {
        ...details.responseHeaders,
        "Content-Security-Policy": [
          // connect-src must cover the embedded server (127.0.0.1) plus any
          // configured LAN lab server. script-src stays locked to 'self'.
          isDev
            ? "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' http: https: ws: wss:;"
            : "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' http: https: ws: wss:;",
        ],
      },
    });
  });

  // ── Block external navigation ──────────────────────────
  win.webContents.on("will-navigate", (event, url) => {
    if (!url.startsWith("http://localhost") && !url.startsWith("file://")) {
      event.preventDefault();
    }
  });
}

async function createMainWindow(): Promise<void> {
  const bounds = store.get("windowBounds") as { width: number; height: number } | undefined;
  const { width, height } = bounds ?? { width: 1440, height: 900 };

  mainWindow = new BrowserWindow({
    width,
    height,
    minWidth: 1280,
    minHeight: 800,
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
    title: "Proctify — Teacher Console",
    autoHideMenuBar: true,
    backgroundColor: "#0B1120",
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,          // ← HARDENED
    },
    icon: path.join(__dirname, "../../assets/icon.png"),
  });

  mainWindow.setMenuBarVisibility(false);

  // Surface every renderer failure in main.log instead of a blank window.
  attachRendererDiagnostics(mainWindow, "teacher-main");

  mainWindow.once("ready-to-show", () => mainWindow?.show());
  mainWindow.on("resize", () => {
    const size = safeGetSize(mainWindow);
    if (size) store.set("windowBounds", { width: size[0], height: size[1] });
  });
  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  applySecurityHandlers(mainWindow);

  if (isDev) {
    await mainWindow.loadURL("http://localhost:5173");
    mainWindow.webContents.openDevTools();
  } else {
    await mainWindow.loadFile(path.join(__dirname, "../../dist/renderer/index.html"));
  }
}

async function createProjectorWindow(): Promise<void> {
  const displays         = screen.getAllDisplays();
  const externalDisplay  = displays.find((d) => d.id !== screen.getPrimaryDisplay().id);
  const target           = externalDisplay ?? screen.getPrimaryDisplay();

  if (projectorWindow && !projectorWindow.isDestroyed()) {
    projectorWindow.focus();
    return;
  }

  projectorWindow = new BrowserWindow({
    x: target.bounds.x,
    y: target.bounds.y,
    width: target.bounds.width,
    height: target.bounds.height,
    fullscreen: true,
    autoHideMenuBar: true,
    backgroundColor: "#0B1120",
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,          // ← HARDENED
    },
    titleBarStyle: "hidden",
  });

  attachRendererDiagnostics(projectorWindow, "teacher-projector");
  projectorWindow.on("closed", () => {
    projectorWindow = null;
  });
  applySecurityHandlers(projectorWindow);

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

  setServerWindowGetter(() => mainWindow);

  // ── Packaged smoke test: boot services, verify layout, exit ──
  if (isSmokeTest) {
    registerIpcHandlers(ipcMain, store, createProjectorWindow);
    registerCctvLauncherIpc(() => null);
    registerDiagnosticsIpc();
    registerAppInfoIpc();
    registerServerIpc();

    await runSmokeTest({
      store,
      requiredIpcChannels: SMOKE_TEST_CHANNELS,
      cctv: {
        expected: !isDev,
        binaryPath: getCctvBinaryPath(),
        present: isCctvBinaryPresent(),
      },
      server: {
        bundlePath: getServerBundlePath(),
        start: startEmbeddedServer,
        stop: stopEmbeddedServer,
        status: getServerStatus,
      },
    });
    return;
  }

  logger.info("main process ready", {
    version: app.getVersion(),
    packaged: app.isPackaged,
    labMode: store.get("labMode"),
    serverUrl: store.get("serverUrl"),
  });

  registerIpcHandlers(ipcMain, store, createProjectorWindow);
  registerCctvLauncherIpc(() => mainWindow);
  registerDiagnosticsIpc();
  registerAppInfoIpc();
  registerServerIpc();

  registerCleanup("cctv-supervisor", () => disposeCctvProcess());

  // ── Embedded API server (HOME / LAB_SERVER) ───────────────
  const labMode = (store.get("labMode") as LabMode | undefined) ?? "HOME";
  if (labMode !== "LAB_CLIENT") {
    const preferredPort = Number(store.get("serverPort")) || 3000;
    const status = await startEmbeddedServer({ labMode, preferredPort });
    if (status.ok) {
      store.set("serverUrl", status.url);
      store.set("serverPort", status.port);
      logger.info("UI will use embedded server", { url: status.url });
    } else {
      logger.error("Embedded server unavailable — UI may show a connection error", {
        error: status.lastError,
        bundlePath: status.bundlePath,
      });
    }
  }

  await createMainWindow();
  logger.info("main window created");

  // mDNS discovery — notify renderer when a lab server is found
  const stopDiscovery = initMDNSDiscovery((server) => {
    safeSend(mainWindow, "discovery:serverFound", server);
    store.set("serverUrl", `http://${server.host}:${server.port}`);
  });
  if (stopDiscovery) registerCleanup("mdns-discovery", stopDiscovery);

  // Auto-updater (non-dev only)
  if (!isDev) {
    const serverUrl = (store.get("serverUrl") as string | undefined) ?? "http://127.0.0.1:3000";
    const disposeUpdater = initAutoUpdater(() => mainWindow, serverUrl);
    if (disposeUpdater) registerCleanup("auto-updater", disposeUpdater);
  }

  app.on("activate", async () => {
    if (BrowserWindow.getAllWindows().length === 0) await createMainWindow();
  });
});

app.on("window-all-closed", () => {
  // The smoke test destroys its hidden windows on purpose; quitting here would
  // abort the test before it can report results.
  if (isSmokeTest) return;
  if (process.platform !== "darwin") app.quit();
});

// Remaining shutdown work is handled by the lifecycle registry (installed
// above): window bounds, embedded server, CCTV child, mDNS, updater timers.
app.on("web-contents-created", (_event, contents) => {
  contents.setWindowOpenHandler(({ url }) => {
    try {
      void shell.openExternal(url);
    } catch (err) {
      logger.warn("openExternal failed", { error: (err as Error).message });
    }
    return { action: "deny" };
  });
});
