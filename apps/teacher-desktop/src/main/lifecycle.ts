// ============================================================
// SecureAssess Teacher Desktop — Lifecycle cleanup registry
//
// Background work (intervals, mDNS browsers, child processes, the embedded
// API server) must be stopped *before* the windows are destroyed. Otherwise
// a timer or process callback fires into a dead BrowserWindow and Electron
// throws `Object has been destroyed`.
//
// Ordering contract:
//   app 'before-quit'  → cleanup runs (async), quit is deferred until done
//                        or 5s elapse, then the quit continues normally.
//   app 'will-quit'    → second chance, synchronous callbacks still run.
// ============================================================

import { app } from "electron";
import { logger } from "./logger";

type CleanupFn = () => void | Promise<void>;

interface CleanupEntry {
  name: string;
  fn: CleanupFn;
}

const entries: CleanupEntry[] = [];
let installed = false;
let quitDeferred = false;
let cleanupsRunning: Promise<void> | null = null;

/** Register a resource that must be released before the app exits. */
export function registerCleanup(name: string, fn: CleanupFn): () => void {
  entries.push({ name, fn });
  return () => {
    const idx = entries.findIndex((e) => e.name === name && e.fn === fn);
    if (idx >= 0) entries.splice(idx, 1);
  };
}

/** Run every registered cleanup once, newest first, never throwing. */
export function runCleanups(): Promise<void> {
  if (cleanupsRunning) return cleanupsRunning;

  const snapshot = entries.splice(0, entries.length).reverse();
  cleanupsRunning = (async () => {
    for (const entry of snapshot) {
      try {
        await entry.fn();
      } catch (err) {
        logger.warn(`cleanup failed: ${entry.name}`, {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  })();

  return cleanupsRunning;
}

/**
 * Install the quit hooks. `onBeforeQuit` runs first (e.g. persist window
 * bounds) and must not assume any window is alive.
 */
export function installLifecycleCleanup(onBeforeQuit?: () => void): void {
  if (installed) return;
  installed = true;

  app.on("before-quit", (event) => {
    try {
      onBeforeQuit?.();
    } catch (err) {
      logger.warn("before-quit hook failed", {
        error: err instanceof Error ? err.message : String(err),
      });
    }

    if (quitDeferred) return; // already draining — let the quit proceed
    quitDeferred = true;
    event.preventDefault();

    const timeout = new Promise<void>((resolve) => {
      setTimeout(resolve, 5_000).unref?.();
    });

    void Promise.race([runCleanups(), timeout]).finally(() => {
      // `quitDeferred` stays true so the re-entrant before-quit is a no-op
      app.quit();
    });
  });

  app.on("will-quit", () => {
    // Anything registered after before-quit started (rare) still gets a run.
    void runCleanups();
  });
}
