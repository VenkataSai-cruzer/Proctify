// ============================================================
// SecureAssess — 3-Layer Lab Device Firewall Middleware
// ============================================================
// Layer 1: IP subnet allowlist (CIDR check)
// Layer 2: Registered hardware token verification
// Layer 3: Mobile/User-Agent rejection
// ============================================================

import type { Request, Response, NextFunction } from "express";
import { prisma } from "../utils/prismaClient";
import { logger } from "../utils/logger";

// ── CIDR helper (IPv4 only) ───────────────────────────────────

function ipToInt(ip: string): number {
  return ip.split(".").reduce((acc, octet) => (acc << 8) | parseInt(octet, 10), 0) >>> 0;
}

function isInCIDR(ip: string, cidr: string): boolean {
  try {
    const [network, bits] = cidr.split("/");
    if (!network || !bits) return false;
    const mask = ~((1 << (32 - parseInt(bits, 10))) - 1) >>> 0;
    return (ipToInt(ip) & mask) === (ipToInt(network) & mask);
  } catch {
    return false;
  }
}

function extractClientIP(req: Request): string {
  const forwarded = req.headers["x-forwarded-for"];
  if (forwarded) {
    const first = Array.isArray(forwarded) ? forwarded[0] : forwarded.split(",")[0];
    return first.trim();
  }
  return req.socket.remoteAddress?.replace("::ffff:", "") ?? "0.0.0.0";
}

// ── Mobile UA patterns ────────────────────────────────────────

const MOBILE_UA_PATTERNS = [
  /Android/i, /iPhone/i, /iPad/i, /iPod/i,
  /BlackBerry/i, /Windows Phone/i, /Opera Mini/i,
  /IEMobile/i, /Mobile/i,
];

function isMobileUserAgent(ua: string): boolean {
  return MOBILE_UA_PATTERNS.some((p) => p.test(ua));
}

// ── Firewall Middleware ───────────────────────────────────────

export async function labFirewallMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const clientIP = extractClientIP(req);
  const userAgent = req.headers["user-agent"] ?? "";
  const hardwareToken = req.headers["x-hardware-token"] as string | undefined;

  // ── Layer 3: Mobile UA block ──────────────────────────────
  if (isMobileUserAgent(userAgent)) {
    logger.warn("Lab firewall: mobile UA blocked", { ip: clientIP, ua: userAgent });
    res.status(403).json({
      error: "Access Denied: Mobile devices are not permitted during exams.",
      code: "MOBILE_BLOCKED",
    });
    return;
  }

  // ── Layer 1: Subnet allowlist ──────────────────────────────
  // Localhost always allowed (teacher machine, testing)
  const isLocalhost =
    clientIP === "127.0.0.1" || clientIP === "::1" || clientIP === "localhost";

  if (!isLocalhost) {
    const allowedSubnets = await prisma.allowedSubnet.findMany();
    const inAllowedSubnet = allowedSubnets.some((s: { cidr: string }) => isInCIDR(clientIP, s.cidr));
    if (!inAllowedSubnet) {
      logger.warn("Lab firewall: IP not in allowed subnet", { ip: clientIP });
      res.status(403).json({
        error: "Access Denied: This device is outside the authorized lab network.",
        code: "IP_BLOCKED",
      });
      return;
    }
  }

  // ── Layer 2: Registered hardware token ────────────────────
  if (!hardwareToken) {
    res.status(403).json({
      error: "Access Denied: No hardware token presented. Register this machine first.",
      code: "NO_TOKEN",
    });
    return;
  }

  const machine = await prisma.labMachine.findUnique({
    where: { hardwareToken },
    select: { systemNo: true, isActive: true, ipAddress: true },
  });

  if (!machine) {
    logger.warn("Lab firewall: unregistered hardware token", { ip: clientIP, token: hardwareToken.slice(0, 8) + "..." });
    res.status(403).json({
      error: "Access Denied: Unauthorized Lab Device. Contact your teacher to register this machine.",
      code: "UNREGISTERED_DEVICE",
    });
    return;
  }

  if (!machine.isActive) {
    res.status(403).json({
      error: "Access Denied: This lab machine has been disabled.",
      code: "MACHINE_DISABLED",
    });
    return;
  }

  // Attach to request for downstream use
  (req as Request & { labMachine: { systemNo: string } }).labMachine = {
    systemNo: machine.systemNo,
  };

  logger.debug("Lab firewall: passed", { ip: clientIP, systemNo: machine.systemNo });
  next();
}
