// ============================================================
// SecureAssess Teacher Desktop — Packaged smoke test
// Invoked with `--smoke-test`: boots the main process without opening
// windows, verifies the packaged layout and main-process services, prints
// SMOKE_TEST_PASSED and exits 0 (or exits 1 with a stack trace).
// ============================================================

import { app, BrowserWindow, ipcMain } from "electron";
import path from "path";
import fs from "fs";
import { logger } from "./logger";
import {
  ensureUserDataWritable,
  getDatabaseUrl,
  getDbPath,
  getUserDataDir,
} from "./dataGuard";

export interface StoreLike {
  get(key: string): unknown;
  set(key: string, value: unknown): void;
  delete(key: string): void;
}

export interface SmokeTestDeps {
  store: StoreLike;
  requiredIpcChannels: string[];
  cctv: { expected: boolean; binaryPath: string; present: boolean };
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

    const apiType = await win.webContents.executeJavaScript("typeof window.electronAPI");
    assert(apiType === "object", `preload bridge missing: window.electronAPI is ${apiType}`);
    return `window.electronAPI is ${apiType}`;
  } finally {
    if (!win.isDestroyed()) win.destroy();
  }
}

function checkSqlite(): string {
  const dbPath = getDbPath();
  const dir = path.dirname(dbPath);
  fs.mkdirSync(dir, { recursive: true });
  fs.accessSync(dir, fs.constants.W_OK);

  assert(
    getDatabaseUrl() === `file:${dbPath}`,
    `DATABASE_URL mismatch: ${getDatabaseUrl()}`
  );

  // No embedded Prisma client here (the API server owns the database), so
  // validate what this process does control: the DB location and, when the
  // file already exists, that it really is a SQLite 3 database.
  if (fs.existsSync(dbPath)) {
    const header = fs.readFileSync(dbPath, { encoding: "latin1", flag: "r" }).slice(0, 16);
    assert(header.startsWith("SQLite format 3"), `not a SQLite database: ${dbPath}`);
    return `existing SQLite db (${fs.statSync(dbPath).size} bytes)`;
  }
  return "db path writable (created on first server run)";
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
      assert(ensureUserDataWritable(), "userData directory is not writable");
    })
  );

  results.push(
    await runCheck("logs-main.log", () => {
      logger.info("smoke test write probe");
      const logPath = path.join(getUserDataDir(), "logs", "main.log");
      assert(fs.existsSync(logPath), `log file missing: ${logPath}`);
      assert(fs.statSync(logPath).size > 0, `log file is empty: ${logPath}`);
    })
  );

  results.push(
    await runCheck("store-roundtrip", () => {
      const key = "smokeTestProbe";
      deps.store.set(key, { at: Date.now() });
      const read = deps.store.get(key) as { at?: number } | undefined;
      assert(read && typeof read.at === "number", "store did not return the written value");
      deps.store.delete(key);
      assert(deps.store.get(key) === undefined, "store delete failed");
    })
  );

  results.push(
    await runCheck("sqlite-database", () => {
      checkSqlite();
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
    await runCheck("cctv-binary", () => {
      if (!deps.cctv.expected) return; // development: python source instead
      assert(deps.cctv.present, `CCTV binary missing: ${deps.cctv.binaryPath}`);
      assert(deps.cctv.binaryPath !== "", "CCTV binary path is empty");
      const mode = process.platform === "win32" ? null : fs.statSync(deps.cctv.binaryPath).mode;
      if (mode !== null) assert((mode & 0o111) !== 0, `CCTV binary is not executable: ${deps.cctv.binaryPath}`);
    })
  );

  results.push(
    await runCheck("app-metadata", () => {
      assert(app.getVersion().length > 0, "app version is empty");
      assert(app.getPath("userData").length > 0, "userData path is empty");
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
