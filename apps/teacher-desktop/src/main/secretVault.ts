// ============================================================
// SecureAssess Teacher Desktop — Encrypted Secret Storage
// Uses Electron safeStorage (DPAPI on Windows, Keychain on macOS,
// libsecret on Linux) to encrypt API keys at rest.
// ============================================================

import { safeStorage, app } from "electron";
import fs from "fs";
import path from "path";

const SECRETS_FILE = "encrypted-secrets.json";

function getSecretsPath(): string {
  return path.join(app.getPath("userData"), SECRETS_FILE);
}

/** Check if safeStorage encryption is available on this platform. */
export function isEncryptionAvailable(): boolean {
  return safeStorage.isEncryptionAvailable();
}

/** Store a secret encrypted at rest via safeStorage. */
export function setSecret(key: string, value: string): void {
  if (!safeStorage.isEncryptionAvailable()) {
    // Fallback: store plaintext with a warning (dev environments without keyring)
    console.warn("safeStorage not available — storing secret unencrypted");
    writeRaw({ key, value, encrypted: false });
    return;
  }
  const buf = safeStorage.encryptString(value);
  writeRaw({ key, value: buf.toString("base64"), encrypted: true });
}

/** Retrieve a decrypted secret. Returns null if not found. */
export function getSecret(key: string): string | null {
  const data = readRaw(key);
  if (!data) return null;
  if (!data.encrypted) return data.value;
  try {
    return safeStorage.decryptString(Buffer.from(data.value, "base64"));
  } catch {
    console.warn("Decryption failed for key:", key);
    return null;
  }
}

/** Delete a stored secret. */
export function deleteSecret(key: string): void {
  const all = readAll();
  delete all[key];
  fs.writeFileSync(getSecretsPath(), JSON.stringify(all, null, 2));
}

interface StoredSecret { key: string; value: string; encrypted: boolean; }

// Internal helpers
function readAll(): Record<string, StoredSecret> {
  const p = getSecretsPath();
  if (!fs.existsSync(p)) return {};
  try { return JSON.parse(fs.readFileSync(p, "utf-8")); }
  catch { return {}; }
}

function writeRaw(secret: StoredSecret): void {
  const all = readAll();
  all[secret.key] = secret;
  fs.writeFileSync(getSecretsPath(), JSON.stringify(all, null, 2));
}

function readRaw(key: string): StoredSecret | null {
  return readAll()[key] ?? null;
}
