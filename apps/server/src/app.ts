// ============================================================
// SecureAssess Server — Express Application
// ============================================================

import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import path from "path";

import { labFirewallMiddleware } from "./middleware/labFirewall";
import { authRouter } from "./routes/auth";
import { examRouter } from "./routes/exam";
import { rosterRouter } from "./routes/roster";
import { machineRouter } from "./routes/machine";
import { mcqRouter } from "./routes/mcq";
import { exportRouter } from "./routes/export";
import { studentRouter } from "./routes/student";
import { saexamRouter } from "./routes/saexam";
import { updatesRouter } from "./routes/updates";
import { checkDatabase } from "./db/bootstrap";
import { logger } from "./utils/logger";

const startedAt = Date.now();

export const app = express();

// ── Security headers ──────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: false, // handled per-route for downloads
}));

// ── CORS — LAN only ───────────────────────────────────────────
app.use(cors({
  origin: (origin, callback) => {
    // Allow Electron (no origin), LAN browsers
    if (!origin || origin.startsWith("http://192.168.") ||
        origin.startsWith("http://10.") || origin.startsWith("http://172.") ||
        origin.startsWith("http://localhost") || origin === "null") {
      callback(null, true);
    } else {
      callback(new Error("CORS: origin not allowed"), false);
    }
  },
  credentials: true,
}));

// ── Body parsing ─────────────────────────────────────────────
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

// ── Global rate limiter ───────────────────────────────────────
app.use(rateLimit({
  windowMs: 60_000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests. Slow down." },
}));

// ── Health check (no auth required) ──────────────────────────
// Used by the Teacher desktop app to wait for the embedded server before it
// shows the UI, and by the packaged smoke test. Returns 503 (never 200) when
// the database is unusable, so a broken DB cannot look "healthy".
app.get("/health", async (_req, res) => {
  const db = await checkDatabase();
  res.status(db.ok ? 200 : 503).json({
    status: db.ok ? "ok" : "degraded",
    service: "secureassess-server",
    labName: process.env.LAB_NAME ?? "SecureAssess Lab",
    version: process.env.APP_VERSION ?? "1.1.0",
    embedded: process.env.EMBEDDED_SERVER === "1",
    db: { ok: db.ok, tables: db.tables, error: db.error },
    uptimeMs: Date.now() - startedAt,
    timestamp: new Date().toISOString(),
  });
});

// ── Lab Firewall (applied to all /api/student/* routes) ──────
app.use("/api/student", labFirewallMiddleware);

// ── API Routes ────────────────────────────────────────────────
app.use("/api/auth",    authRouter);
app.use("/api/exam",    examRouter);
app.use("/api/roster",  rosterRouter);
app.use("/api/machine", machineRouter);
app.use("/api/mcq",     mcqRouter);
app.use("/api/export",  exportRouter);
app.use("/api/student", studentRouter);
app.use("/api/saexam",  saexamRouter);
app.use("/updates",    updatesRouter);

// ── Serve static exports ──────────────────────────────────────
app.use("/exports", express.static(process.env.EXPORTS_DIR ?? path.join(process.cwd(), "exports")));

// ── 404 handler ───────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ error: "Not found" });
});

// ── Global error handler ──────────────────────────────────────
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error("Unhandled error", { error: err.message, stack: err.stack });
  res.status(500).json({ error: "Internal server error" });
});
