// ============================================================
// SecureAssess Server — Security Utilities
// ============================================================
// HMAC signing, packet verification, hash-chain construction
// ============================================================

import crypto from "crypto";

function hmacSecret(): string {
  const s = process.env.JWT_SECRET;
  if (!s) throw new Error("JWT_SECRET not configured");
  return s;
}

// ── Packet HMAC (answer:submit / heartbeat anti-replay) ───────

/**
 * Compute HMAC-SHA256 for an answer packet.
 * Client-side: signs with per-session secret.
 * Server-side: verifies independently before persisting.
 */
export function computePacketHmac(
  sessionId: string,
  questionId: string,
  chosenIndex: number,
  seq: number
): string {
  return crypto
    .createHmac("sha256", hmacSecret())
    .update(`${sessionId}|${questionId}|${chosenIndex}|${seq}`)
    .digest("hex");
}

export function verifyPacketHmac(
  sessionId: string,
  questionId: string,
  chosenIndex: number,
  seq: number,
  provided: string
): boolean {
  if (!provided) return false; // reject missing HMAC
  const expected = computePacketHmac(sessionId, questionId, chosenIndex, seq);
  // Constant-time compare
  try {
    return crypto.timingSafeEqual(
      Buffer.from(expected, "hex"),
      Buffer.from(provided.padEnd(expected.length, "0").slice(0, expected.length), "hex")
    );
  } catch {
    return false;
  }
}

// ── Hash-chain for violation audit log ───────────────────────

/**
 * Compute the record hash that links this violation into the
 * tamper-evident chain:
 *   recordHash = SHA-256(prevHash | id | sessionId | violationType | timestamp)
 */
export function computeViolationRecordHash(
  prevHash: string,
  id: string,
  sessionId: string,
  violationType: string,
  timestamp: string
): string {
  return crypto
    .createHash("sha256")
    .update(`${prevHash}|${id}|${sessionId}|${violationType}|${timestamp}`)
    .digest("hex");
}

/**
 * Retrieve the hash of the most recent ViolationEvent for this session.
 * Returns the genesis hash if no prior events exist.
 */
export async function getLastViolationHash(
  prisma: { violationEvent: { findFirst: Function } },
  sessionId: string
): Promise<string> {
  const last = await prisma.violationEvent.findFirst({
    where: { sessionId },
    orderBy: { timestamp: "desc" as const },
    select: { recordHash: true },
  });
  return last?.recordHash || "0000000000000000000000000000000000000000000000000000000000000000";
}

// ── Certificate QR HMAC ───────────────────────────────────────

/**
 * Sign the certificate QR payload so the QR scan can be
 * independently verified without a database lookup.
 * Payload: `secureassess:cert:${verificationHash}`
 */
export function signCertificateQr(verificationHash: string): string {
  const mac = crypto
    .createHmac("sha256", hmacSecret())
    .update(`secureassess:cert:${verificationHash}`)
    .digest("hex");
  return `secureassess:cert:${verificationHash}:${mac.slice(0, 16)}`;
}

// ── Session per-session HMAC secret derivation ───────────────

/**
 * Derive a per-session HMAC secret from the master secret + sessionId.
 * Sent to the student client at session-create time so the client can
 * independently sign its packets without exposing the master secret.
 */
export function deriveSessionSecret(sessionId: string): string {
  return crypto
    .createHmac("sha256", hmacSecret())
    .update(`session-secret:${sessionId}`)
    .digest("hex");
}

export function computeClientPacketHmac(
  sessionSecret: string,
  sessionId: string,
  questionId: string,
  chosenIndex: number,
  seq: number
): string {
  return crypto
    .createHmac("sha256", sessionSecret)
    .update(`${sessionId}|${questionId}|${chosenIndex}|${seq}`)
    .digest("hex");
}

export function verifyClientPacketHmac(
  sessionSecret: string,
  sessionId: string,
  questionId: string,
  chosenIndex: number,
  seq: number,
  provided: string
): boolean {
  if (!provided) return false;
  const expected = computeClientPacketHmac(sessionSecret, sessionId, questionId, chosenIndex, seq);
  try {
    return crypto.timingSafeEqual(
      Buffer.from(expected, "hex"),
      Buffer.from(provided.padEnd(expected.length, "0").slice(0, expected.length), "hex")
    );
  } catch {
    return false;
  }
}
