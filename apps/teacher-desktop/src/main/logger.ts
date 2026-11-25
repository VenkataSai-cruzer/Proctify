// ============================================================
// SecureAssess Teacher Desktop — Main-process logger
// Writes to userData/logs/ so logs survive app updates
// ============================================================

import { app } from "electron";
import path from "path";
import fs from "fs";

type Level = "debug" | "info" | "warn" | "error";

function getLogsDir(): string {
  const dir = path.join(app.getPath("userData"), "logs");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function write(level: Level, message: string, meta?: unknown): void {
  const ts   = new Date().toISOString();
  const line = `${ts} [${level.toUpperCase()}] ${message}${meta ? " " + JSON.stringify(meta) : ""}`;

  if (level === "debug" && process.env.NODE_ENV !== "development") return;
  console.log(line);                                // always stdout

  try {
    const logFile = path.join(getLogsDir(), "teacher-desktop.log");
    fs.appendFileSync(logFile, line + "\n");
  } catch { /* non-fatal */ }
}

export const logger = {
  debug: (msg: string, meta?: unknown) => write("debug", msg, meta),
  info:  (msg: string, meta?: unknown) => write("info",  msg, meta),
  warn:  (msg: string, meta?: unknown) => write("warn",  msg, meta),
  error: (msg: string, meta?: unknown) => write("error", msg, meta),
};
