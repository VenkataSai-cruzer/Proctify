import fs from "fs";
import path from "path";
import { PrismaClient } from "@prisma/client";
import { logger } from "./logger";

/**
 * SQLite cannot create a database inside a directory that does not exist yet,
 * so make sure the parent folder of DATABASE_URL exists before the client
 * connects. On the desktop the URL points at <userData>/proctify.db, where
 * userData always exists — but a fresh/custom data dir must still work.
 */
function ensureDatabaseDirectory(): void {
  const url = process.env.DATABASE_URL;
  if (!url || !url.startsWith("file:")) return;
  const raw = url.slice("file:".length);
  if (!raw || raw === ":memory:") return;
  try {
    const filePath = path.isAbsolute(raw) ? raw : path.resolve(raw);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
  } catch (err) {
    logger.warn("Could not create database directory", {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

ensureDatabaseDirectory();

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
