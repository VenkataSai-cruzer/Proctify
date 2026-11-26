// ============================================================
// SecureAssess Student Kiosk — Packaged smoke test
// Invoked with `--smoke-test`: loads the real packaged renderer in a hidden
// window, proves React mounted (not an empty #root), verifies the preload
// bridge, and asserts a clean shutdown with no destroyed-object errors.
// ============================================================

import { app, BrowserWindow, ipcMain } from "electron";
import path from "path";
import fs from "fs";
import os from "os";
import crypto from "crypto";
import { logger, getLogFilePath } from "./logger";
import { attachRendererDiagnostics } from "./rendererDiagnostics";
import { safeSend, safeGetSize } from "./safeSend";
import { runCleanups } from "./lifecycle";

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

function writeSync(fd: number, text: string): void {
  try {
    fs.writeSync(fd, text);
  } catch {
    /* stdout may already be closed */
  }
}

async function runCheck(name: string, fn: () => unknown | Promise<unknown>): Promise<CheckResult> {
  try {
    const detail = await fn();
    return { name, ok: true, detail: typeof detail === "string" ? detail : "ok" };
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    return { name, ok: false, detail: error.stack ?? error.message };
  }
}

/**
 * Loads the packaged renderer in a hidden window and asserts
 *   • window.kioskAPI exists (preload executed)
 *   • React mounted into #root (non-empty DOM, not a blank window)
 *   • no renderer console/page errors beyond expected network noise
 */
async function checkRenderer(): Promise<string> {
  const preload = path.join(app.getAppPath(), "dist", "preload", "index.js");
  const rendererIndex = path.join(app.getAppPath(), "dist", "renderer", "index.html");

  const win = new BrowserWindow({
    show: false,
    width: 1280,
    height: 800,
    webPreferences: {
      preload,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  const diagnostics = attachRendererDiagnostics(win, "smoke");

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

    const deadline = Date.now() + 10_000;
    let rootLength = 0;
    while (Date.now() < deadline) {
      rootLength = await win.webContents.executeJavaScript(
        "document.getElementById('root') ? document.getElementById('root').innerHTML.length : -1"
      );
      if (rootLength > 50) break;
      await new Promise((r) => setTimeout(r, 200));
    }

    // Re-read after the poll settled: the first read that crossed the
    // threshold caught React mid-render.
    rootLength = await win.webContents.executeJavaScript(
      "document.getElementById('root') ? document.getElementById('root').innerHTML.length : -1"
    );
    const apiType = await win.webContents.executeJavaScript("typeof window.kioskAPI");
    assert(apiType === "object", `preload bridge missing: window.kioskAPI is ${apiType}`);
    assert(
      rootLength > 50,
      `React did not mount: #root innerHTML length is ${rootLength} (expected > 50)`
    );

    // The kiosk connects to the lab server eagerly; with no server running in
    // the smoke environment, connection failures are expected noise.
    const networkNoise = /ERR_CONNECTION|ERR_NAME_NOT_RESOLVED|ERR_INTERNET_DISCONNECTED|WebSocket|socket\.io|net::ERR/i;
    const errors = diagnostics.issues
      .filter((i) => i.kind !== "console" || !networkNoise.test(i.message))
      .map((i) => `${i.kind}: ${i.message}`);

    assert(errors.length === 0, `renderer reported errors:\n${errors.join("\n")}`);

    return `#root=${rootLength} chars, window.kioskAPI=${apiType}, 0 renderer errors`;
  } finally {
    if (!win.isDestroyed()) win.destroy();
  }
}

/** A destroyed window must be a no-op for the send/size guards. */
function checkDestroyedWindowGuard(): string {
  const win = new BrowserWindow({ show: false });
  win.destroy();
  const sent = safeSend(win, "smoke:should-not-throw", { ok: true });
  const size = safeGetSize(win);
  assert(sent === false, `safeSend returned ${sent} for a destroyed window`);
  assert(size === null, `safeGetSize returned ${String(size)} for a destroyed window`);
  return "safeSend=false, safeGetSize=null (no throw)";
}

function checkUserDataWritable(): void {
  const dir = app.getPath("userData");
  fs.mkdirSync(dir, { recursive: true });
  const probe = path.join(dir, `.write-probe-${process.pid}`);
  fs.writeFileSync(probe, "ok");
  fs.unlinkSync(probe);
}

/** Fatal errors logged by THIS process since the test started. */
function fatalLogEntriesSince(startedAtIso: string): string[] {
  const logPath = getLogFilePath();
  if (!fs.existsSync(logPath)) return [];
  const hits: string[] = [];
  for (const line of fs.readFileSync(logPath, "utf8").split("\n")) {
    if (!line.trim()) continue;
    let entry: { ts?: string; pid?: number; msg?: string };
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }
    if (entry.pid !== process.pid) continue;
    if (!entry.ts || entry.ts < startedAtIso) continue;
    const blob = JSON.stringify(entry);
    if (blob.includes("uncaughtException") || blob.includes("Object has been destroyed")) {
      hits.push(entry.msg ?? line);
    }
  }
  return hits;
}

export async function runSmokeTest(deps: SmokeTestDeps): Promise<void> {
  const startedAtIso = new Date().toISOString();

  logger.info("SMOKE_TEST_START", {
    version: app.getVersion(),
    electron: process.versions["electron"],
    packaged: app.isPackaged,
    platform: `${process.platform}-${process.arch}`,
    argv: process.argv.slice(1),
  });

  const results: CheckResult[] = [];

  results.push(await runCheck("userData-writable", () => { checkUserDataWritable(); }));

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

  results.push(await runCheck("renderer-render", checkRenderer));

  results.push(
    await runCheck("app-metadata", () => {
      assert(app.getVersion().length > 0, "app version is empty");
      assert(os.hostname().length > 0, "hostname is empty");
      assert(crypto.createHash("sha256").update("probe").digest("hex").length === 64, "crypto unavailable");
    })
  );

  results.push(await runCheck("destroyed-window-guard", checkDestroyedWindowGuard));

  results.push(
    await runCheck("clean-shutdown", async () => {
      // Exactly the sequence `before-quit` performs.
      await runCleanups();
      // Let late timers/callbacks run — the old crash surfaced here.
      await new Promise((r) => setTimeout(r, 500));
      const fatal = fatalLogEntriesSince(startedAtIso);
      assert(
        fatal.length === 0,
        `fatal/destroyed-object errors logged during the run:\n${fatal.join("\n")}`
      );
      return "no uncaughtException / destroyed-object errors";
    })
  );

  const failed = results.filter((r) => !r.ok);

  for (const r of results) {
    logger.info(`SMOKE_CHECK_${r.ok ? "PASS" : "FAIL"} ${r.name}`, r.ok ? undefined : r.detail);
  }

  if (failed.length > 0) {
    logger.error("SMOKE_TEST_FAILED", { failed: failed.map((f) => f.name) });
    for (const f of failed) writeSync(2, `\n[smoke] ${f.name}\n${f.detail}\n`);
    app.exit(1);
    return;
  }

  logger.info("SMOKE_TEST_PASSED", {
    checks: results.map((r) => r.name),
    version: app.getVersion(),
  });
  // Synchronous writes: app.exit() does not flush async stdio on Windows.
  writeSync(1, "SMOKE_TEST_PASSED\n");
  for (const r of results) writeSync(1, `  PASS ${r.name}: ${r.detail}\n`);
  app.exit(0);
}
