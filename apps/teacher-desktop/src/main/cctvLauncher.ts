// ============================================================
// SecureAssess Teacher Desktop — CCTV Service Launcher
// Launches the bundled PyInstaller cctv-vision binary as a
// child process and streams its stdout/stderr to the renderer.
// Falls back to `python src/main.py` in development.
// ============================================================

import { app, BrowserWindow, ipcMain } from "electron";
import { spawn, type ChildProcess } from "child_process";
import path from "path";
import fs from "fs";
import { logger } from "./logger";

let cctvProcess: ChildProcess | null = null;

function getCctvBinaryPath(): string {
  if (process.env.NODE_ENV === "development") {
    // Dev: run Python source directly
    return "";
  }
  // Production: bundled binary in extraResources
  const resourcesDir = process.resourcesPath;
  const win  = path.join(resourcesDir, "cctv-vision", "cctv-vision.exe");
  const unix = path.join(resourcesDir, "cctv-vision", "cctv-vision");
  return process.platform === "win32" ? win : unix;
}

function getCctvArgs(): string[] {
  if (process.env.NODE_ENV === "development") {
    return [path.join(app.getAppPath(), "../../services/cctv-vision/src/main.py")];
  }
  return [];
}

function getCctvCommand(): string {
  if (process.env.NODE_ENV === "development") {
    return process.platform === "win32" ? "python" : "python3";
  }
  return getCctvBinaryPath();
}

export function registerCctvLauncherIpc(mainWindow: BrowserWindow): void {
  ipcMain.handle("cctv:start", async (_event, env: Record<string, string>) => {
    if (cctvProcess) {
      logger.info("CCTV process already running");
      return { running: true, pid: cctvProcess.pid };
    }

    const cmd  = getCctvCommand();
    const args = getCctvArgs();

    if (!fs.existsSync(cmd) && process.env.NODE_ENV !== "development") {
      logger.warn("CCTV binary not found", { path: cmd });
      return { running: false, error: "CCTV binary not found. Run build_bundle first." };
    }

    const childEnv = {
      ...process.env,
      SERVER_URL:          env.serverUrl ?? "http://localhost:3000",
      CCTV_SERVICE_SECRET: env.cctvSecret ?? "",
      CAMERA_SOURCE:       env.cameraSource ?? "0",
      FRAME_WIDTH:         env.frameWidth  ?? "1280",
      FRAME_HEIGHT:        env.frameHeight ?? "720",
    };

    cctvProcess = spawn(cmd, args, {
      env: childEnv as NodeJS.ProcessEnv,
      stdio: ["ignore", "pipe", "pipe"],
    });

    cctvProcess.stdout?.on("data", (d: Buffer) => {
      const line = d.toString().trim();
      if (line) mainWindow.webContents.send("cctv:log", { level: "info", line });
    });

    cctvProcess.stderr?.on("data", (d: Buffer) => {
      const line = d.toString().trim();
      if (line) mainWindow.webContents.send("cctv:log", { level: "warn", line });
    });

    cctvProcess.on("exit", (code) => {
      logger.info("CCTV process exited", { code });
      cctvProcess = null;
      mainWindow.webContents.send("cctv:stopped", { code });
    });

    logger.info("CCTV process started", { cmd, pid: cctvProcess.pid });
    return { running: true, pid: cctvProcess.pid };
  });

  ipcMain.handle("cctv:stop", () => {
    if (!cctvProcess) return { stopped: false };
    cctvProcess.kill("SIGTERM");
    cctvProcess = null;
    return { stopped: true };
  });

  ipcMain.handle("cctv:status", () => ({
    running: cctvProcess !== null,
    pid: cctvProcess?.pid ?? null,
  }));
}
