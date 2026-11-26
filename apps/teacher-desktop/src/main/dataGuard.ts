// ============================================================
// SecureAssess Teacher Desktop — Data Guard
// 1. Stores SQLite DB inside app.getPath('userData')
// 2. Creates timestamped backup on every startup
// 3. Runs Prisma migrate deploy before server starts
// 4. Returns the DATABASE_URL for the embedded server
// ============================================================

import { app } from "electron";
import path from "path";
import fs from "fs";
import crypto from "crypto";

const BACKUPS_DIR_NAME = "backups";
const DB_FILE_NAME     = "proctify.db";
const LEGACY_DB_FILE_NAME = "secureassess.db";
const MAX_BACKUPS      = 10; // keep last 10 daily snapshots

export function getUserDataDir(): string {
  return app.getPath("userData");
}

export function getDbPath(): string {
  return path.join(getUserDataDir(), DB_FILE_NAME);
}

export function getDatabaseUrl(): string {
  return `file:${getDbPath()}`;
}

/**
 * Earlier builds used secureassess.db. Carry that data forward once so an
 * upgrade does not silently start with an empty database.
 */
function migrateLegacyDatabase(): void {
  const target = getDbPath();
  const legacy = path.join(getUserDataDir(), LEGACY_DB_FILE_NAME);
  try {
    if (fs.existsSync(target) || !fs.existsSync(legacy)) return;
    fs.copyFileSync(legacy, target);
    // eslint-disable-next-line no-console
    console.log(`[dataGuard] migrated ${legacy} -> ${target}`);
  } catch {
    /* first run or locked file — the server will create a fresh DB */
  }
}

/** Creates a timestamped copy of the SQLite DB file at startup. */
export function createStartupBackup(): void {
  migrateLegacyDatabase();

  const dbPath = getDbPath();
  if (!fs.existsSync(dbPath)) return; // first run, nothing to back up

  const backupsDir = path.join(getUserDataDir(), BACKUPS_DIR_NAME);
  if (!fs.existsSync(backupsDir)) fs.mkdirSync(backupsDir, { recursive: true });

  const stamp   = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const dest    = path.join(backupsDir, `${DB_FILE_NAME}.${stamp}.bak`);
  fs.copyFileSync(dbPath, dest);

  // Prune old backups — keep newest MAX_BACKUPS
  const entries = fs.readdirSync(backupsDir)
    .filter((f) => f.endsWith(".bak"))
    .map((f) => ({ f, t: fs.statSync(path.join(backupsDir, f)).mtimeMs }))
    .sort((a, b) => b.t - a.t);

  for (const old of entries.slice(MAX_BACKUPS)) {
    try { fs.unlinkSync(path.join(backupsDir, old.f)); } catch { /* ignore */ }
  }
}

/** Returns true if the userData directory is on a writable filesystem. */
export function ensureUserDataWritable(): boolean {
  const dir = getUserDataDir();
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const probe = path.join(dir, ".write-probe");
  try {
    fs.writeFileSync(probe, "ok");
    fs.unlinkSync(probe);
    return true;
  } catch {
    return false;
  }
}

/** Compute SHA-256 of DB file for integrity verification. */
export function computeDbChecksum(): string {
  const dbPath = getDbPath();
  if (!fs.existsSync(dbPath)) return "";
  const buf = fs.readFileSync(dbPath);
  return crypto.createHash("sha256").update(buf).digest("hex");
}
