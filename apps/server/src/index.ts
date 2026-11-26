// ============================================================
// SecureAssess Server — Entry Point
//
// Runs either standalone (`yarn dev:server`) or as the embedded API server
// spawned by the Teacher desktop app via ELECTRON_RUN_AS_NODE. In the
// embedded case DATABASE_URL points at <userData>/proctify.db and the schema
// is created on first boot by db/bootstrap.ts.
// ============================================================

import "dotenv/config";
import http from "http";
import { app } from "./app";
import { initSocketServer } from "./socket";
import { initMDNS, stopMDNS } from "./services/mdns";
import { ensureSchema } from "./db/bootstrap";
import { prisma } from "./utils/prismaClient";
import { logger } from "./utils/logger";
import { PORTS } from "@secureassess/shared";

const PORT = Number(process.env.PORT) || PORTS.SERVER;

const httpServer = http.createServer(app);

let shuttingDown = false;

function shutdown(reason: string): void {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info(`${reason} received — shutting down gracefully`);

  const forceExit = setTimeout(() => {
    logger.warn("graceful shutdown timed out — forcing exit");
    process.exit(0);
  }, 5_000);
  forceExit.unref();

  try {
    stopMDNS();
  } catch {
    /* already gone */
  }

  httpServer.close(() => {
    void prisma.$disconnect().catch(() => undefined).finally(() => {
      logger.info("Server closed");
      process.exit(0);
    });
  });
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
// If the parent desktop app disappears, do not linger.
process.on("disconnect", () => shutdown("disconnect"));

async function main(): Promise<void> {
  // Initialise the SQLite file before accepting traffic: the desktop app
  // expects /health to be meaningful (and tables to exist) on first boot.
  await ensureSchema();

  initSocketServer(httpServer);
  initMDNS();

  httpServer.listen(PORT, "0.0.0.0", () => {
    logger.info(`SecureAssess Server running on http://0.0.0.0:${PORT}`);
    logger.info(`Lab Name: ${process.env.LAB_NAME ?? "SecureAssess Lab"}`);
    logger.info(`Environment: ${process.env.NODE_ENV ?? "development"}`);
    logger.info(`Database: ${process.env.DATABASE_URL ?? "(default)"}`);
  });

  httpServer.on("error", (err: NodeJS.ErrnoException) => {
    logger.error("HTTP server error", { code: err.code, error: err.message });
    process.exit(1);
  });
}

main().catch((err: unknown) => {
  logger.error("Server failed to start", {
    error: err instanceof Error ? err.message : String(err),
    stack: err instanceof Error ? err.stack : undefined,
  });
  process.exit(1);
});
