// ============================================================
// SecureAssess Teacher Desktop — Packaged smoke test
// Invoked with `--smoke-test`: boots the real app services (embedded API
// server on a throwaway SQLite DB, real preload, real packaged renderer),
// asserts they work, shuts down cleanly, prints SMOKE_TEST_PASSED and exits 0
// (or exits 1 with a stack trace).
// ============================================================

import { app, BrowserWindow, ipcMain } from "electron";
import path from "path";
import fs from "fs";
import { logger, getLogFilePath } from "./logger";
import {
  ensureUserDataWritable,
  getDatabaseUrl,
  getDbPath,
  getUserDataDir,
} from "./dataGuard";
import { attachRendererDiagnostics } from "./rendererDiagnostics";
import { safeSend, safeGetSize } from "./safeSend";
import { runCleanups } from "./lifecycle";
import type { ServerStatus, StartOptions } from "./embeddedServer";

export interface StoreLike {
  get(key: string): unknown;
  set(key: string, value: unknown): void;
  delete(key: string): void;
}

export interface SmokeTestDeps {
  store: StoreLike;
  requiredIpcChannels: string[];
  cctv: { expected: boolean; binaryPath: string; present: boolean };
  server: {
    bundlePath: string;
    start: (opts: StartOptions) => Promise<ServerStatus>;
    stop: () => Promise<void>;
    status: () => ServerStatus;
  };
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

const rendererErrors: string[] = [];

/**
 * Loads the packaged renderer in a hidden window and asserts that
 *   • the preload bridge exists
 *   • React actually mounted (non-empty #root, not just an empty shell)
 *   • nothing errored while doing it
 * This is what distinguishes "window opened" from "app works".
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

    // React mounts asynchronously (effects, router redirect) — poll briefly.
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
    const rootHtml = (await win.webContents.executeJavaScript(
      "document.getElementById('root') ? document.getElementById('root').innerHTML : ''"
    )) as string;
    rootLength = rootHtml.length;
    const apiType = await win.webContents.executeJavaScript("typeof window.electronAPI");
    assert(apiType === "object", `preload bridge missing: window.electronAPI is ${apiType}`);
    assert(
      rootLength > 50,
      `React did not mount: #root innerHTML length is ${rootLength} (expected > 50). ` +
        `A blank/dark window in a packaged build looks exactly like this.`
    );

    for (const issue of diagnostics.issues) {
      if (issue.kind !== "console") rendererErrors.push(`${issue.kind}: ${issue.message}`);
    }
    // Network noise (no LAN server reachable) is expected on a fresh machine;
    // any other renderer error is a real defect.
    const networkNoise = /ERR_CONNECTION|ERR_NAME_NOT_RESOLVED|ERR_INTERNET_DISCONNECTED|WebSocket|net::ERR/i;
    for (const issue of diagnostics.issues) {
      if (issue.kind === "console" && !networkNoise.test(issue.message)) {
        rendererErrors.push(issue.message);
      }
    }

    assert(
      rendererErrors.length === 0,
      `renderer reported errors:\n${rendererErrors.join("\n")}`
    );

    return `#root=${rootLength} chars, window.electronAPI=${apiType}, 0 renderer errors; html=${rootHtml
      .replace(/\s+/g, " ")
      .slice(0, 140)}`;
  } finally {
    if (!win.isDestroyed()) win.destroy();
  }
}

async function checkEmbeddedServer(deps: SmokeTestDeps): Promise<string> {
  assert(fs.existsSync(deps.server.bundlePath), `server bundle missing: ${deps.server.bundlePath}`);

  // Throwaway data directory so the test proves first-boot schema creation.
  const dataDir = path.join(getUserDataDir(), "smoke", `run-${Date.now()}`);
  fs.mkdirSync(dataDir, { recursive: true });
  const dbPath = path.join(dataDir, "proctify.db");

  const status = await deps.server.start({
    labMode: "LAB_SERVER",
    preferredPort: 0,
    dbPath,
    logDir: path.join(dataDir, "logs"),
    noAutoRestart: true,
  });

  assert(status.ok, `embedded server did not start: ${status.lastError ?? "unknown error"}`);

  const res = await fetch(`${status.url}/health`);
  assert(res.status === 200, `GET /health returned ${res.status}`);
  const body = (await res.json()) as { status?: string; db?: { ok?: boolean; tables?: number } };
  assert(body.status === "ok", `health status is ${body.status}`);
  assert(body.db?.ok === true, "health reports database not ok");
  assert(
    (body.db?.tables ?? 0) >= 13,
    `expected >= 13 tables in a fresh DB, got ${body.db?.tables}`
  );

  assert(fs.existsSync(dbPath), `SQLite database was not created at ${dbPath}`);
  const header = fs.readFileSync(dbPath, { encoding: "latin1", flag: "r" }).slice(0, 16);
  assert(header.startsWith("SQLite format 3"), "fresh database is not a SQLite file");

  return `${status.url} healthy, ${body.db?.tables} tables created on first boot`;
}

/**
 * Proves the `Object has been destroyed` crash is gone: a destroyed window
 * must be a no-op for both helpers (previously `win.getSize()` threw during
 * `before-quit`, taking the whole process down).
 */
function checkDestroyedWindowGuard(): string {
  const win = new BrowserWindow({ show: false });
  win.destroy();
  const sent = safeSend(win, "smoke:should-not-throw", { ok: true });
  const size = safeGetSize(win);
  assert(sent === false, `safeSend returned ${sent} for a destroyed window`);
  assert(size === null, `safeGetSize returned ${String(size)} for a destroyed window`);
  return "safeSend=false, safeGetSize=null (no throw)";
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

  if (fs.existsSync(dbPath)) {
    const header = fs.readFileSync(dbPath, { encoding: "latin1", flag: "r" }).slice(0, 16);
    assert(header.startsWith("SQLite format 3"), `not a SQLite database: ${dbPath}`);
    return `existing SQLite db (${fs.statSync(dbPath).size} bytes)`;
  }
  return "db path writable (created on first server run)";
}

/** Any fatal error (or destroyed-object throw) logged by THIS process. */
function fatalLogEntriesSince(startedAtIso: string): string[] {
  const logPath = getLogFilePath();
  if (!fs.existsSync(logPath)) return [];
  const hits: string[] = [];
  for (const line of fs.readFileSync(logPath, "utf8").split("\n")) {
    if (!line.trim()) continue;
    let entry: { ts?: string; pid?: number; msg?: string; meta?: unknown };
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

  results.push(await runCheck("sqlite-database", () => { checkSqlite(); }));

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

  results.push(await runCheck("embedded-server", () => checkEmbeddedServer(deps)));

  // The renderer is loaded after the server so its bootstrap sees a real URL.
  results.push(await runCheck("renderer-render", checkRenderer));

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

  results.push(await runCheck("destroyed-window-guard", checkDestroyedWindowGuard));

  results.push(
    await runCheck("clean-shutdown", async () => {
      // Exactly the sequence `before-quit` performs: release background
      // resources first, then stop the server.
      await runCleanups();
      await deps.server.stop();
      assert(!deps.server.status().running, "embedded server still running after stop");
      const status = deps.server.status();
      assert(status.pid === null, `embedded server pid still set: ${status.pid}`);

      // Let late timers/callbacks run — the old crash surfaced here.
      await new Promise((r) => setTimeout(r, 500));

      const fatal = fatalLogEntriesSince(startedAtIso);
      assert(
        fatal.length === 0,
        `fatal/destroyed-object errors logged during the run:\n${fatal.join("\n")}`
      );
      return "server stopped, no uncaughtException / destroyed-object errors";
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
