// ============================================================
// SecureAssess Student Kiosk — Packaged smoke test
// Invoked with `--smoke-test`: boots the main process without opening
// a kiosk window, verifies the packaged layout and main-process services,
// prints SMOKE_TEST_PASSED and exits 0 (or exits 1 with a stack trace).
// ============================================================

import { app, BrowserWindow, ipcMain } from "electron";
import path from "path";
import fs from "fs";
import os from "os";
import crypto from "crypto";
import { logger } from "./logger";

export interface SmokeTestDeps {
  requiredIpcChannels: string[];
  hardwareToken: string;
}

interface CheckResult {
  name: string;
  ok: boolean;
  detail: string;
}

/** Registered invoke channels live on a private map on IpcMain. */
function registeredInvokeChannels(): Set<string> {
  const internal = ipcMain as unknown as { _invokeHandlers?: Map<string, unknown> };
  return new Set(internal._invokeHandlers ? [...internal._invokeHandlers.keys()] : []);
}

function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(message);
}

async function runCheck(name: string, fn: () => unknown | Promise<unknown>): Promise<CheckResult> {
  try {
    await fn();
    return { name, ok: true, detail: "ok" };
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    return { name, ok: false, detail: error.stack ?? error.message };
  }
}

/**
 * Loads the packaged renderer in a hidden window and asserts the preload script
 * actually executed and exposed its bridge — file-exists checks alone cannot
 * catch a broken preload path or a sandboxed require() failure.
 */
async function checkPreloadBridge(): Promise<string> {
  const preload = path.join(app.getAppPath(), "dist", "preload", "index.js");
  const rendererIndex = path.join(app.getAppPath(), "dist", "renderer", "index.html");

  const win = new BrowserWindow({
    show: false,
    webPreferences: {
      preload,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  try {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("renderer load timed out after 15s")), 15_000);
      win.webContents.once("did-finish-load", () => {
        clearTimeout(timer);
        resolve();
      });
      win.webContents.once("did-fail-load", (_e, code, desc) => {
        clearTimeout(timer);
        reject(new Error(`renderer failed to load (${code}): ${desc}`));
      });
      win.loadFile(rendererIndex).catch((err: unknown) => {
        clearTimeout(timer);
        reject(err instanceof Error ? err : new Error(String(err)));
      });
    });

    const apiType = await win.webContents.executeJavaScript("typeof window.kioskAPI");
    assert(apiType === "object", `preload bridge missing: window.kioskAPI is ${apiType}`);
    return `window.kioskAPI is ${apiType}`;
  } finally {
    if (!win.isDestroyed()) win.destroy();
  }
}

function checkUserDataWritable(): void {
  const dir = app.getPath("userData");
  fs.mkdirSync(dir, { recursive: true });
  const probe = path.join(dir, `.write-probe-${process.pid}`);
  fs.writeFileSync(probe, "ok");
  fs.unlinkSync(probe);
}

export async function runSmokeTest(deps: SmokeTestDeps): Promise<void> {
  logger.info("SMOKE_TEST_START", {
    version: app.getVersion(),
    electron: process.versions["electron"],
    packaged: app.isPackaged,
    platform: `${process.platform}-${process.arch}`,
    argv: process.argv.slice(1),
  });

  const results: CheckResult[] = [];

  results.push(
    await runCheck("userData-writable", () => {
      checkUserDataWritable();
    })
  );

  results.push(
    await runCheck("logs-main.log", () => {
      logger.info("smoke test write probe");
      const logPath = path.join(app.getPath("userData"), "logs", "main.log");
      assert(fs.existsSync(logPath), `log file missing: ${logPath}`);
      assert(fs.statSync(logPath).size > 0, `log file is empty: ${logPath}`);
    })
  );

  results.push(
    await runCheck("ipc-handlers", () => {
      const registered = registeredInvokeChannels();
      const missing = deps.requiredIpcChannels.filter((ch) => !registered.has(ch));
      assert(missing.length === 0, `missing IPC handlers: ${missing.join(", ")}`);
    })
  );

  results.push(
    await runCheck("hardware-token", () => {
      assert(/^[a-f0-9]{64}$/.test(deps.hardwareToken), "hardware token is not a sha256 hex digest");
    })
  );

  results.push(
    await runCheck("renderer-bundle", () => {
      const index = path.join(app.getAppPath(), "dist", "renderer", "index.html");
      assert(fs.existsSync(index), `renderer bundle missing: ${index}`);
    })
  );

  results.push(
    await runCheck("preload-bundle", () => {
      const preload = path.join(app.getAppPath(), "dist", "preload", "index.js");
      assert(fs.existsSync(preload), `preload bundle missing: ${preload}`);
    })
  );

  results.push(await runCheck("preload-bridge", checkPreloadBridge));

  results.push(
    await runCheck("app-metadata", () => {
      assert(app.getVersion().length > 0, "app version is empty");
      assert(os.hostname().length > 0, "hostname is empty");
      assert(crypto.createHash("sha256").update("probe").digest("hex").length === 64, "crypto unavailable");
    })
  );

  const failed = results.filter((r) => !r.ok);

  for (const r of results) {
    logger.info(`SMOKE_CHECK_${r.ok ? "PASS" : "FAIL"} ${r.name}`, r.ok ? undefined : r.detail);
  }

  if (failed.length > 0) {
    logger.error("SMOKE_TEST_FAILED", { failed: failed.map((f) => f.name) });
    for (const f of failed) console.error(`\n[smoke] ${f.name}\n${f.detail}\n`);
    app.exit(1);
    return;
  }

  logger.info("SMOKE_TEST_PASSED", {
    checks: results.map((r) => r.name),
    version: app.getVersion(),
  });
  console.log("SMOKE_TEST_PASSED");
  app.exit(0);
}
