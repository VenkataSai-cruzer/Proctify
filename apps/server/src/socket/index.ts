// ============================================================
// SecureAssess — Socket.IO Server Initializer
// ============================================================

import { Server as SocketIOServer } from "socket.io";
import type { Server as HttpServer } from "http";
import { SOCKET_NAMESPACES } from "@secureassess/shared";
import { logger } from "../utils/logger";
import { registerMainNamespace } from "./namespaces/main";
import { registerCCTVNamespace } from "./namespaces/cctv";
import { registerProjectorNamespace } from "./namespaces/projector";

export let io: SocketIOServer;

export function initSocketServer(httpServer: HttpServer): SocketIOServer {
  io = new SocketIOServer(httpServer, {
    cors: {
      origin: (origin, callback) => {
        // LAN + Electron origins only
        if (
          !origin ||
          origin.startsWith("http://192.168.") ||
          origin.startsWith("http://10.") ||
          origin.startsWith("http://172.") ||
          origin.startsWith("http://localhost") ||
          origin === "null"
        ) {
          callback(null, true);
        } else {
          callback(new Error("Socket.IO CORS: origin not allowed"));
        }
      },
      methods: ["GET", "POST"],
      credentials: true,
    },
    maxHttpBufferSize: 10 * 1024 * 1024, // 10 MB (for CCTV frames)
    pingInterval: 10_000,
    pingTimeout: 30_000,
  });

  // Register namespaces
  registerMainNamespace(io.of(SOCKET_NAMESPACES.MAIN));
  registerCCTVNamespace(io.of(SOCKET_NAMESPACES.CCTV));
  registerProjectorNamespace(io.of(SOCKET_NAMESPACES.PROJECTOR));

  logger.info("Socket.IO server initialized");
  logger.info(`  Namespace: ${SOCKET_NAMESPACES.MAIN}       (teacher + student)`);
  logger.info(`  Namespace: ${SOCKET_NAMESPACES.CCTV}    (Python CCTV service)`);
  logger.info(`  Namespace: ${SOCKET_NAMESPACES.PROJECTOR} (projector mode)`);

  return io;
}
