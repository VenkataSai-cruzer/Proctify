// ============================================================
// SecureAssess Student Kiosk — Electron Main Process
// SECURITY HARDENED:
//   • contextIsolation: true, nodeIntegration: false, sandbox: true
//   • Strict CSP via session headers (script-src 'self')
//   • All IPC handlers validate event.senderFrame origin
//   • VM / RDP / multi-monitor detection at startup
// Supports two lockdown modes: KIOSK | WINDOWED
// ============================================================

import {
  app, BrowserWindow, globalShortcut, screen,
  powerSaveBlocker, ipcMain, session, shell, Menu,
} from "electron";
import type { IpcMainInvokeEvent } from "electron";
import path from "path";
import os from "os";
import crypto from "crypto";
import type { LockdownMode } from "@secureassess/shared";
import { initTelemetry } from "./telemetry";
import { installGlobalErrorHandlers } from "./crashGuard";
import { logger } from "./logger";
import { runSmokeTest } from "./smokeTest";
import { safeSend, isWindowUsable } from "./safeSend";
import { installLifecycleCleanup, registerCleanup } from "./lifecycle";
import { attachRendererDiagnostics } from "./rendererDiagnostics";
import { initAutoUpdater } from "./autoUpdater";

const isDev = process.env.NODE_ENV === "development";
const isSmokeTest = process.argv.includes("--smoke-test");

// Install before anything else can throw so early failures still hit main.log
installGlobalErrorHandlers();

// Channels the smoke test expects to exist after IPC registration
const KIOSK_IPC_CHANNELS = [
  "kiosk:getHardwareToken",
  "kiosk:getSystemNo",
  "kiosk:getServerUrl",
  "kiosk:getLockdownMode",
  "kiosk:unlock",
  "kiosk:setLockdownMode",
  "kiosk:getEnvironmentCheck",
];

// The Chromium sandbox is only disabled when a headless CI runner cannot
// provide it (Ubuntu runners have no setuid helper for chrome-sandbox).
// Never disable it implicitly in a production kiosk.
const sandboxDisabledForCi =
  process.env["CI"] === "true" || process.env["ELECTRON_DISABLE_SANDBOX"] === "1";
if (!isDev && sandboxDisabledForCi) {
  app.commandLine.appendSwitch("no-sandbox");
}
app.commandLine.appendSwitch("disable-dev-shm-usage");

// No default File/Edit/View/Window/Help menu: it exposes DevTools/Reload and
// looks wrong on a locked-down exam client. Chromium keeps the standard text
// editing shortcuts (Ctrl+C/V/X/A) working inside inputs without it.
Menu.setApplicationMenu(null);

let kioskWindow: BrowserWindow | null = null;
let powerBlockId: number | null = null;
let currentLockdownMode: LockdownMode = "KIOSK";

// ── Shutdown ordering ─────────────────────────────────────────
// Release background resources BEFORE the window is destroyed. The window's
// "close" handler blocks quitting in production, so cleanup destroys it
// directly (destroy() bypasses close) and the re-entrant quit then succeeds.
installLifecycleCleanup();
registerCleanup("global-shortcuts", () => globalShortcut.unregisterAll());
registerCleanup("power-save-blocker", () => {
  if (powerBlockId !== null) {
    powerSaveBlocker.stop(powerBlockId);
    powerBlockId = null;
  }
});
registerCleanup("kiosk-window", () => {
  if (kioskWindow && !kioskWindow.isDestroyed()) kioskWindow.destroy();
  kioskWindow = null;
});

// ── Allowed IPC frame origins ─────────────────────────────────
// Only our own renderer pages may invoke IPC handlers.
const ALLOWED_FRAME_ORIGINS = new Set([
  "http://localhost:5174",          // dev Vite
  "file://",                         // production renderer
  "null",                            // sandboxed iframe
]);

function isFrameAllowed(event: IpcMainInvokeEvent): boolean {
  try {
    const frame = event.senderFrame;
    if (!frame) return false;
    const origin = frame.origin ?? "null";
    return ALLOWED_FRAME_ORIGINS.has(origin) || origin.startsWith("file://");
  } catch {
    return false; // fail-closed
  }
}

// ── Hardware token ────────────────────────────────────────────
function getHardwareToken(): string {
  const ifaces = os.networkInterfaces();
  const macs = Object.values(ifaces)
    .flat()
    .filter((i) => i && !i.internal && i.mac !== "00:00:00:00:00:00")
    .map((i) => i?.mac ?? "")
    .join(":");
  return crypto.createHash("sha256")
    .update(`${os.hostname()}:${macs}:secureassess`)
    .digest("hex");
}

// ── VM / Remote Desktop / Multi-Monitor Detection ─────────────

function detectVMEnvironment(): { isVM: boolean; vmType: string | null } {
  const cpuModel = os.cpus()[0]?.model ?? "";
  const hostname = os.hostname().toLowerCase();
  const indicators = [
    { pattern: /vmware|virtualbox|qemu|hyperv|hyper-v|xen|kvm/i, label: "VM" },
  ];
  const vmSignatures = [
    "VMware", "VirtualBox", "QEMU", "Hyper-V", "Xen", "KVM",
  ];
  for (const sig of vmSignatures) {
    if (cpuModel.includes(sig) || hostname.includes(sig.toLowerCase())) {
      return { isVM: true, vmType: sig };
    }
  }
  // On Windows, check via WMI-like environment variables
  if (process.platform === "win32") {
    const procEnv = JSON.stringify(process.env).toLowerCase();
    if (procEnv.includes("vmware") || procEnv.includes("virtualbox")) {
      return { isVM: true, vmType: "VM detected via env" };
    }
  }
  return { isVM: false, vmType: null };
}

function detectRemoteDesktop(): { isRemote: boolean; tool: string | null } {
  const remoteTools = ["anydesk", "teamviewer", "rustdesk", "vnc", "mstsc", "splashtop", "nomachine"];
  if (process.platform === "win32") {
    // On Windows, check for known RDP session environment variable
    if (process.env["SESSIONNAME"]?.toLowerCase().includes("rdp")) {
      return { isRemote: true, tool: "RDP (mstsc)" };
    }
  }
  // Check if DISPLAY env suggests remote (Linux)
  if (process.platform === "linux" && process.env["DISPLAY"]?.includes(":10")) {
    return { isRemote: true, tool: "VNC/RDP" };
  }
  return { isRemote: false, tool: null };
}

function detectMultiMonitor(): boolean {
  return screen.getAllDisplays().length > 1;
}

// ── Window creation ───────────────────────────────────────────
async function createExamWindow(mode: LockdownMode): Promise<void> {
  const primary = screen.getPrimaryDisplay();
  const isKiosk = mode === "KIOSK" && !isDev;

  kioskWindow = new BrowserWindow({
    x: primary.bounds.x,
    y: primary.bounds.y,
    width:  isKiosk ? primary.bounds.width  : 1280,
    height: isKiosk ? primary.bounds.height : 800,
    fullscreen:  isKiosk,
    kiosk:       isKiosk,
    alwaysOnTop: isKiosk,
    resizable:   !isKiosk || isDev,
    movable:     !isKiosk || isDev,
    closable:    isDev,
    minimizable: !isKiosk,
    maximizable: !isKiosk,
    titleBarStyle: isKiosk ? "hidden" : "default",
    title: "Proctify — Exam",
    autoHideMenuBar: true,
    backgroundColor: "#F8FAFC",
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,         // ← HARDENED: enforce sandbox
      webgl: false,
      plugins: false,
    },
    skipTaskbar: isKiosk,
    icon: path.join(__dirname, "../../assets/icon.png"),
  });

  kioskWindow.setMenuBarVisibility(false);

  // Renderer failures must reach main.log; a blank kiosk is otherwise opaque.
  attachRendererDiagnostics(kioskWindow, "kiosk-main");

  kioskWindow.on("closed", () => {
    kioskWindow = null;
  });

  // ── Strict CSP via response headers ────────────────────────
  kioskWindow.webContents.session.webRequest.onHeadersReceived((details, cb) => {
    cb({
      responseHeaders: {
        ...details.responseHeaders,
        "Content-Security-Policy": [
          // connect-src must cover the configured lab server (any LAN host).
          // script-src stays locked to 'self'.
          isDev
            ? "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' http: https: ws: wss:;"
            : "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' http: https: ws: wss:;",
        ],
      },
    });
  });

  // ── Block all external navigation ─────────────────────────
  kioskWindow.webContents.on("will-navigate", (event, url) => {
    if (!url.startsWith("http://localhost") && !url.startsWith("file://")) {
      event.preventDefault();
    }
  });

  // ── WINDOWED mode: blur violation emitters ────────────────
  if (!isKiosk) {
    kioskWindow.on("blur", () => safeSend(kioskWindow, "kiosk:windowBlur"));
    kioskWindow.on("focus", () => safeSend(kioskWindow, "kiosk:windowFocus"));
  }

  const onDisplayAdded = (): void => {
    if (!isDev && isWindowUsable(kioskWindow)) kioskWindow.focus();
  };
  screen.on("display-added", onDisplayAdded);
  registerCleanup("display-listener", () => {
    screen.removeListener("display-added", onDisplayAdded);
  });

  if (isDev) {
    await kioskWindow.loadURL("http://localhost:5174");
    kioskWindow.webContents.openDevTools();
  } else {
    await kioskWindow.loadFile(path.join(__dirname, "../../dist/renderer/index.html"));
  }

  kioskWindow.on("close", (e) => {
    if (!isDev) e.preventDefault();
  });
}

function applyShortcutBlock(mode: LockdownMode): void {
  globalShortcut.unregisterAll();
  if (mode === "WINDOWED" || isDev) return;

  const blocked = [
    "Alt+F4", "Super", "Meta",
    "Alt+Tab", "Alt+Shift+Tab", "Ctrl+Alt+Delete",
    "F11", "Ctrl+W", "Ctrl+Q",
    "Ctrl+Shift+I", "Ctrl+Shift+J", "F12",
    "Ctrl+U", "Ctrl+P", "Ctrl+S", "Ctrl+C", "Ctrl+V",
  ];
  for (const sc of blocked) {
    try {
      globalShortcut.register(sc, () => {
        if (isWindowUsable(kioskWindow)) kioskWindow.focus();
      });
    } catch { /* ignore */ }
  }
}

// ── IPC API with senderFrame validation ────────────────────────
function registerIpc(): void {
  // Wrap every handler to validate frame origin
  function secureHandle(channel: string, handler: (event: IpcMainInvokeEvent, ...args: any[]) => any): void {
    ipcMain.handle(channel, async (event, ...args) => {
      if (!isFrameAllowed(event)) {
        console.warn(`IPC blocked: unauthorized frame for ${channel}`);
        return null;
      }
      return handler(event, ...args);
    });
  }

  secureHandle("kiosk:getHardwareToken", () => getHardwareToken());
  secureHandle("kiosk:getSystemNo", () => process.env.SYSTEM_NO ?? "SYS-01");
  secureHandle("kiosk:getServerUrl", () =>
    process.env.SERVER_URL ?? "http://secureassess-lab.local:3000"
  );
  secureHandle("kiosk:getLockdownMode", () => currentLockdownMode);

  secureHandle("kiosk:unlock", (_event, code: string) => {
    const unlockCode = process.env.KIOSK_UNLOCK_CODE ?? "secureassess-unlock";
    if (code !== unlockCode) return false;
    globalShortcut.unregisterAll();
    kioskWindow?.setKiosk(false);
    kioskWindow?.setAlwaysOnTop(false);
    kioskWindow?.setClosable(true);
    return true;
  });

  secureHandle("kiosk:setLockdownMode", async (_event, mode: LockdownMode) => {
    if (mode === currentLockdownMode) return;
    currentLockdownMode = mode;
    applyShortcutBlock(mode);
    if (!kioskWindow) return;
    if (mode === "KIOSK" && !isDev) {
      kioskWindow.setKiosk(true);
      kioskWindow.setAlwaysOnTop(true);
      kioskWindow.setSkipTaskbar(true);
      kioskWindow.setClosable(false);
      kioskWindow.setMinimizable(false);
      kioskWindow.removeAllListeners("blur");
      kioskWindow.removeAllListeners("focus");
    } else {
      kioskWindow.setKiosk(false);
      kioskWindow.setAlwaysOnTop(false);
      kioskWindow.setSkipTaskbar(false);
      kioskWindow.setMinimizable(true);
      kioskWindow.on("blur", () => safeSend(kioskWindow, "kiosk:windowBlur"));
      kioskWindow.on("focus", () => safeSend(kioskWindow, "kiosk:windowFocus"));
    }
  });

  // ── Environment security checks ──────────────────────────
  secureHandle("kiosk:getEnvironmentCheck", () => {
    const vm = detectVMEnvironment();
    const rdp = detectRemoteDesktop();
    const multiMon = detectMultiMonitor();
    return {
      isVM: vm.isVM,
      vmType: vm.vmType,
      isRemoteDesktop: rdp.isRemote,
      remoteTool: rdp.tool,
      multiMonitor: multiMon,
      displayCount: screen.getAllDisplays().length,
    };
  });
}

// ── App lifecycle ─────────────────────────────────────────────
app.whenReady().then(async () => {
  // ── Packaged smoke test: boot services, verify layout, exit ──
  if (isSmokeTest) {
    registerIpc();
    await runSmokeTest({
      requiredIpcChannels: KIOSK_IPC_CHANNELS,
      hardwareToken: getHardwareToken(),
    });
    return;
  }

  logger.info("main process ready", {
    version: app.getVersion(),
    packaged: app.isPackaged,
    mode: currentLockdownMode,
  });

  // ── Environment security scan ─────────────────────────────
  const vmCheck = detectVMEnvironment();
  const rdpCheck = detectRemoteDesktop();
  const multiMon = detectMultiMonitor();

  if (vmCheck.isVM) {
    logger.warn("VM environment detected", { vmType: vmCheck.vmType });
    // The renderer can read this via kiosk:getEnvironmentCheck and block/warn
  }
  if (rdpCheck.isRemote) {
    logger.warn("Remote desktop detected — entry blocked for exam integrity", { tool: rdpCheck.tool });
  }
  if (multiMon) {
    logger.warn("Multiple monitors detected — secondary displays will be blocked", {
      displayCount: screen.getAllDisplays().length,
    });
  }

  powerBlockId = powerSaveBlocker.start("prevent-display-sleep");
  initTelemetry();
  await createExamWindow(currentLockdownMode);
  applyShortcutBlock(currentLockdownMode);
  registerIpc();

  // Student release channel — status goes to main.log and the renderer.
  const disposeUpdater = initAutoUpdater(() => kioskWindow);
  registerCleanup("auto-updater", disposeUpdater);
});

app.on("window-all-closed", () => {
  // The smoke test destroys its hidden windows on purpose; quitting here would
  // abort the test before it can report results.
  if (isSmokeTest) return;
  // In production the kiosk window should only disappear as part of a quit;
  // exiting here avoids leaving a headless kiosk process behind.
  app.quit();
});
