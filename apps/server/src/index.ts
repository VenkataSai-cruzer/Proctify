// ============================================================
// SecureAssess Server — Entry Point
// ============================================================

import "dotenv/config";
import http from "http";
import { app } from "./app";
import { initSocketServer } from "./socket";
import { initMDNS } from "./services/mdns";
import { logger } from "./utils/logger";
import { PORTS } from "@secureassess/shared";

const PORT = Number(process.env.PORT) || PORTS.SERVER;

const httpServer = http.createServer(app);

// Attach Socket.IO
initSocketServer(httpServer);

// Start mDNS broadcast
initMDNS();

httpServer.listen(PORT, "0.0.0.0", () => {
  logger.info(`SecureAssess Server running on http://0.0.0.0:${PORT}`);
  logger.info(`Lab Name: ${process.env.LAB_NAME ?? "SecureAssess Lab"}`);
  logger.info(`Environment: ${process.env.NODE_ENV ?? "development"}`);
});

// Graceful shutdown
process.on("SIGTERM", () => {
  logger.info("SIGTERM received — shutting down gracefully");
  httpServer.close(() => {
    logger.info("Server closed");
    process.exit(0);
  });
});
