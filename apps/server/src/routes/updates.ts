// ============================================================
// SecureAssess Server — LAN Auto-Update Distribution
// Serves electron-builder update feeds for teacher-desktop
// and student-kiosk over the lab LAN at /updates
//
// Drop built artifacts from electron-builder into:
//   <server-cwd>/updates/teacher/
//   <server-cwd>/updates/student/
//
// electron-updater expects:
//   GET /updates/teacher/latest.yml          (Windows)
//   GET /updates/teacher/latest-linux.yml    (Linux)
//   GET /updates/teacher/<installer-file>    (binary)
// ============================================================

import { Router } from "express";
import express from "express";
import path from "path";
import fs from "fs";
import { logger } from "../utils/logger";

export const updatesRouter = Router();

const UPDATES_BASE = path.join(process.cwd(), "updates");

// Ensure directories exist
for (const sub of ["teacher", "student"]) {
  const dir = path.join(UPDATES_BASE, sub);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

// Serve static update artifacts (yaml manifests + installer binaries)
updatesRouter.use("/teacher", express.static(path.join(UPDATES_BASE, "teacher"), {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith(".yml") || filePath.endsWith(".yaml")) {
      res.setHeader("Content-Type", "text/yaml; charset=utf-8");
    }
  },
}));

updatesRouter.use("/student", express.static(path.join(UPDATES_BASE, "student"), {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith(".yml") || filePath.endsWith(".yaml")) {
      res.setHeader("Content-Type", "text/yaml; charset=utf-8");
    }
  },
}));

// Info endpoint
updatesRouter.get("/", (_req, res) => {
  const listDir = (sub: string) => {
    const dir = path.join(UPDATES_BASE, sub);
    return fs.existsSync(dir) ? fs.readdirSync(dir) : [];
  };
  res.json({
    teacher: listDir("teacher"),
    student: listDir("student"),
    updatesBase: UPDATES_BASE,
  });
});

logger.info("Updates server mounted at /updates", { base: UPDATES_BASE });
