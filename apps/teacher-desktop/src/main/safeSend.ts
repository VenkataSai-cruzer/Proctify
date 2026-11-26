// ============================================================
// SecureAssess Teacher Desktop — safeSend
// Single entry point for every main → renderer message.
//
// Why: `win.webContents.send()` throws `TypeError: Object has been
// destroyed` once the window (or its webContents) is gone — which happens
// routinely during shutdown, after a renderer crash, or when a timer /
// child-process callback fires after the window closed. Every send in this
// process goes through here instead of touching webContents directly.
// ============================================================

import type { BrowserWindow } from "electron";
import { logger } from "./logger";

/** True when the window and its webContents are both still alive. */
export function isWindowUsable(win: BrowserWindow | null | undefined): win is BrowserWindow {
  if (!win) return false;
  try {
    if (win.isDestroyed()) return false;
    const contents = win.webContents;
    return Boolean(contents) && !contents.isDestroyed();
  } catch {
    // webContents getter itself throws if the native object is gone
    return false;
  }
}

/**
 * Send an IPC message to a renderer, never throwing.
 * Returns true when the message was actually delivered.
 */
export function safeSend(
  win: BrowserWindow | null | undefined,
  channel: string,
  ...args: unknown[]
): boolean {
  if (!isWindowUsable(win)) return false;
  try {
    win.webContents.send(channel, ...args);
    return true;
  } catch (err) {
    logger.warn("safeSend failed", {
      channel,
      error: err instanceof Error ? err.message : String(err),
    });
    return false;
  }
}

/** `win.getSize()` that returns null instead of throwing on a dead window. */
export function safeGetSize(win: BrowserWindow | null | undefined): [number, number] | null {
  if (!isWindowUsable(win)) return null;
  try {
    const size = win.getSize();
    return [size[0] ?? 0, size[1] ?? 0];
  } catch {
    return null;
  }
}
