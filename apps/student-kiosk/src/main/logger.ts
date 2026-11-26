// ============================================================
// SecureAssess Student Kiosk — Main-process logger
// Structured JSON lines in userData/logs/main.log so logs survive
// app updates and can be attached to diagnostics.
// ============================================================

import { app } from "electron";
import path from "path";
import fs from "fs";

export type LogLevel = "debug" | "info" | "warn" | "error";

const LOG_FILE_NAME = "main.log";
let cachedLogsDir: string | null = null;

export function getLogsDir(): string {
  if (cachedLogsDir) return cachedLogsDir;
  const dir = path.join(app.getPath("userData"), "logs");
  fs.mkdirSync(dir, { recursive: true });
  cachedLogsDir = dir;
  return dir;
}

export function getLogFilePath(): string {
  return path.join(getLogsDir(), LOG_FILE_NAME);
}

/** Turn anything thrown/logged into a JSON-safe value. */
export function normalizeMeta(value: unknown): unknown {
  if (value instanceof Error) {
    return { name: value.name, message: value.message, stack: value.stack };
  }
  if (value === undefined) return undefined;
  try {
    JSON.stringify(value);
    return value;
  } catch {
    return String(value);
  }
}

function write(level: LogLevel, message: string, meta?: unknown): void {
  if (level === "debug" && process.env.NODE_ENV !== "development") return;

  const ts = new Date().toISOString();
  const entry: Record<string, unknown> = {
    ts,
    level,
    app: "student-kiosk",
    pid: process.pid,
    msg: message,
  };
  const safeMeta = normalizeMeta(meta);
  if (safeMeta !== undefined) entry["meta"] = safeMeta;

  try {
    const sink = level === "error" || level === "warn" ? console.error : console.log;
    sink(`${ts} [${level.toUpperCase()}] ${message}`, safeMeta ?? "");
  } catch {
    /* stdout may be gone in a packaged app */
  }

  try {
    fs.appendFileSync(getLogFilePath(), JSON.stringify(entry) + "\n");
  } catch {
    /* never let logging break the app */
  }
}

export const logger = {
  debug: (msg: string, meta?: unknown) => write("debug", msg, meta),
  info: (msg: string, meta?: unknown) => write("info", msg, meta),
  warn: (msg: string, meta?: unknown) => write("warn", msg, meta),
  error: (msg: string, meta?: unknown) => write("error", msg, meta),
};
