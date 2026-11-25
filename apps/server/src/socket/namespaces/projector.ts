// ============================================================
// SecureAssess — Projector Socket.IO Namespace (/projector)
// Read-only broadcast channel for the dual-pane projector view.
// Only teacher-authenticated sockets may join.
// ============================================================

import type { Namespace, Socket } from "socket.io";
import jwt from "jsonwebtoken";
import { ROOMS } from "@secureassess/shared";
import { logger } from "../../utils/logger";

export function registerProjectorNamespace(nsp: Namespace): void {

  nsp.use((socket, next) => {
    const token = socket.handshake.auth.token;
    if (!token) { next(new Error("Projector: teacher token required")); return; }
    try {
      jwt.verify(token, process.env.JWT_SECRET!);
      next();
    } catch {
      next(new Error("Projector: invalid teacher token"));
    }
  });

  nsp.on("connection", (socket: Socket) => {
    const { examId } = socket.handshake.query as { examId?: string };
    if (examId) {
      socket.join(ROOMS.projector(examId));
      logger.info("Projector client connected", { examId, id: socket.id });
    }

    socket.on("disconnect", () => {
      logger.debug("Projector client disconnected", { id: socket.id });
    });
  });
}
