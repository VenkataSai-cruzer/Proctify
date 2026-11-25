// ============================================================
// SecureAssess — CCTV Socket.IO Namespace (/cctv)
// Internal namespace — authenticated by shared secret header.
// Python vision service connects here and emits frames +
// violations which are forwarded to the main namespace.
// ============================================================

import type { Namespace, Socket } from "socket.io";
import { EVENTS, ROOMS } from "@secureassess/shared";
import { prisma } from "../../utils/prismaClient";
import { logger } from "../../utils/logger";
import { computeViolationRecordHash, getLastViolationHash } from "../../utils/security";
import crypto from "crypto";

export function registerCCTVNamespace(nsp: Namespace): void {

  // Secret guard middleware
  nsp.use((socket, next) => {
    const secret = socket.handshake.auth.secret ?? socket.handshake.headers["x-cctv-secret"];
    if (secret !== process.env.CCTV_SERVICE_SECRET) {
      next(new Error("CCTV namespace: unauthorized"));
      return;
    }
    next();
  });

  nsp.on("connection", (socket: Socket) => {
    logger.info("CCTV service connected", { id: socket.id });

    socket.on("cctv:serviceConnected", ({ version, cameraSource, frameWidth, frameHeight }) => {
      logger.info("CCTV service announced", { version, cameraSource, frameWidth, frameHeight });
      // Broadcast to all teacher sockets
      socket.broadcast.emit(EVENTS.CCTV_SERVICE_STATUS, {
        connected: true, cameraSource, fps: 0,
        timestamp: new Date().toISOString(),
      });
    });

    // Throttled live frame → relay to main namespace teachers
    socket.on("cctv:frame", ({ frameBase64, timestamp, fps }) => {
      // Forward to main namespace teacher rooms (use io instance via nsp.server)
      nsp.server.of("/").emit(EVENTS.CCTV_LIVE_FRAME, {
        frameBase64, timestamp, activeAlerts: [],
      });
    });

    // CCTV violation → record + relay
    socket.on("cctv:violation", async ({ systemNo, violationType, confidence, snapshotBase64, boundingBox, timestamp }) => {
      logger.warn("CCTV violation detected", { systemNo, violationType, confidence });

      // Find active session for this systemNo
      const session = await prisma.studentSession.findFirst({
        where: { systemNo, status: "ACTIVE" },
        include: { exam: true },
      });

      if (session) {
        const id = crypto.randomUUID();
        const ts = timestamp ?? new Date().toISOString();
        const prevHash = await getLastViolationHash(prisma, session.id);
        const recordHash = computeViolationRecordHash(prevHash, id, session.id, violationType, ts);

        const violation = await prisma.violationEvent.create({
          data: {
            id,
            sessionId: session.id,
            systemNo,
            violationType,
            source: "CCTV",
            confidence,
            snapshotBase64: snapshotBase64 ?? null,
            timestamp: new Date(ts),
            prevHash,
            recordHash,
          },
        });

        const violationCount = await prisma.violationEvent.count({
          where: { sessionId: session.id, forgiven: false },
        });
        const threshold = session.exam.disqualifyThreshold;

        await prisma.studentSession.update({
          where: { id: session.id },
          data: {
            violationCount,
            status: violationCount >= threshold ? "DISQUALIFIED" : "ACTIVE",
          },
        });

        // Notify teacher dashboard
        nsp.server.of("/").to(ROOMS.exam(session.examId)).emit(EVENTS.DASHBOARD_VIOLATION_ALERT, {
          id: violation.id,
          sessionId: session.id,
          systemNo,
          violationType,
          source: "CCTV",
          confidence,
          snapshotBase64,
          timestamp,
          forgiven: false,
        });

        // Notify projector namespace
        nsp.server.of("/projector").to(ROOMS.projector(session.examId)).emit(EVENTS.DASHBOARD_VIOLATION_ALERT, {
          id: violation.id,
          sessionId: session.id,
          systemNo,
          violationType,
          source: "CCTV",
          confidence,
          snapshotBase64,
          timestamp,
          forgiven: false,
        });

        // Notify student
        nsp.server.of("/").to(ROOMS.session(session.id)).emit(EVENTS.VIOLATION_RECORDED, {
          violationId: violation.id,
          sessionId: session.id,
          violationType,
          warningMessage: `Warning: ${violationType.replace(/_/g, " ")} detected by proctoring system.`,
          violationCount,
          remainingAllowed: Math.max(0, threshold - violationCount),
          timestamp,
        });

        if (violationCount >= threshold) {
          nsp.server.of("/").to(ROOMS.session(session.id)).emit(EVENTS.SESSION_DISQUALIFIED, {
            sessionId: session.id,
            reason: "Violation threshold exceeded (CCTV)",
            violationCount,
          });
        }
      }

      // Forward raw CCTV violation alert to teachers regardless
      nsp.server.of("/").emit(EVENTS.CCTV_VIOLATION, {
        systemNo, violationType, confidence, snapshotBase64, boundingBox, timestamp,
        sessionId: session?.id,
      });
    });

    socket.on("cctv:heartbeat", ({ timestamp, activeSessions, detectionLatencyMs }) => {
      logger.debug("CCTV heartbeat", { timestamp, activeSessions, detectionLatencyMs });
    });

    socket.on("disconnect", () => {
      logger.warn("CCTV service disconnected", { id: socket.id });
      nsp.server.of("/").emit(EVENTS.CCTV_SERVICE_STATUS, {
        connected: false, cameraSource: "", fps: 0,
        timestamp: new Date().toISOString(),
      });
    });
  });
}
