import { PrismaClient } from "@prisma/client";
import { logger } from "./logger";

declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

export const prisma: PrismaClient =
  global.__prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development"
      ? ["query", "warn", "error"]
      : ["warn", "error"],
  });

if (process.env.NODE_ENV !== "production") {
  global.__prisma = prisma;
}

prisma.$connect()
  .then(() => logger.info("Prisma connected to SQLite"))
  .catch((err: Error) => {
    logger.error("Prisma connection failed", { error: err.message });
    process.exit(1);
  });
