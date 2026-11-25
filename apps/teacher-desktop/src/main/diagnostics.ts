// ============================================================
// SecureAssess Teacher Desktop — 1-Click Diagnostics ZIP
// ============================================================
// Collects: app version, platform info, CPU/memory, DB path &
// size, recent log files, crash dumps, and a summary JSON.
// Saves to a user-chosen location via save dialog.
// ============================================================

import { app, ipcMain, dialog, BrowserWindow } from "electron";
import fs from "fs";
import path from "path";
import os from "os";
import archiver from "archiver";
import { logger } from "./logger";

export function registerDiagnosticsIpc(): void {
  ipcMain.handle("diagnostics:export", async (event) => {
    try {
      // Prompt user for save location
      const result = await dialog.showSaveDialog(BrowserWindow.fromWebContents(event.sender)!, {
        title: "Save Diagnostics Bundle",
        defaultPath: `secureassess-diagnostics-${new Date().toISOString().slice(0, 10)}.zip`,
        filters: [{ name: "ZIP Archive", extensions: ["zip"] }],
      });

      if (result.canceled || !result.filePath) return { saved: false };

      const zipPath = result.filePath;
      const output  = fs.createWriteStream(zipPath);
      const archive = archiver("zip", { zlib: { level: 9 } });

      await new Promise<void>((resolve, reject) => {
        archive.pipe(output);
        output.on("close", resolve);
        archive.on("error", reject);

        // ── 1. System summary JSON ──────────────────────────
        const summary = {
          generatedAt: new Date().toISOString(),
          app: {
            name: "SecureAssess Teacher",
            version: app.getVersion(),
            electronVersion: process.versions.electron,
            nodeVersion: process.versions.node,
            chromeVersion: process.versions.chrome,
          },
          platform: {
            os: process.platform,
            arch: process.arch,
            hostname: os.hostname(),
            cpuModel: os.cpus()[0]?.model ?? "unknown",
            cpuCores: os.cpus().length,
            totalMemoryMB: Math.round(os.totalmem() / 1024 / 1024),
            freeMemoryMB: Math.round(os.freemem() / 1024 / 1024),
            uptimeSeconds: Math.round(os.uptime()),
          },
          userData: {
            path: app.getPath("userData"),
            dbFile: path.join(app.getPath("userData"), "secureassess.db"),
            dbExists: fs.existsSync(path.join(app.getPath("userData"), "secureassess.db")),
            dbSizeKB: (() => {
              try { return Math.round(fs.statSync(path.join(app.getPath("userData"), "secureassess.db")).size / 1024); }
              catch { return 0; }
            })(),
          },
          env: {
            NODE_ENV: process.env.NODE_ENV ?? "production",
            DATABASE_URL: process.env.DATABASE_URL ? "[set]" : "[not set]",
            LAB_NAME: process.env.LAB_NAME ?? "—",
            PORT: process.env.PORT ?? "3000",
          },
        };

        archive.append(JSON.stringify(summary, null, 2), { name: "system-summary.json" });

        // ── 2. Recent log files ─────────────────────────────
        const logsDir = path.join(app.getPath("userData"), "logs");
        if (fs.existsSync(logsDir)) {
          const logs = fs.readdirSync(logsDir).filter(f => f.endsWith(".log")).slice(0, 5);
          for (const logFile of logs) {
            const logPath = path.join(logsDir, logFile);
            const content  = fs.readFileSync(logPath, "utf-8").slice(-50_000); // last 50KB
            archive.append(content, { name: `logs/${logFile}` });
          }
        }

        // ── 3. Electron store contents (redacted) ──────────
        try {
          const storePath = path.join(app.getPath("userData"), "secureassess-teacher.json");
          if (fs.existsSync(storePath)) {
            const storeContent = JSON.parse(fs.readFileSync(storePath, "utf-8"));
            // Redact any sensitive values
            if (storeContent.serverUrl) storeContent.serverUrl = "[redacted]";
            archive.append(JSON.stringify(storeContent, null, 2), { name: "settings.json" });
          }
        } catch { /* ignore */ }

        // ── 4. Crash dumps (if any) ─────────────────────────
        const crashDir = path.join(app.getPath("userData"), "Crashpad");
        if (fs.existsSync(crashDir)) {
          const crashFiles = fs.readdirSync(crashDir).filter(f => f.endsWith(".dmp")).slice(0, 5);
          for (const crashFile of crashFiles) {
            archive.file(path.join(crashDir, crashFile), { name: `crashes/${crashFile}` });
          }
        }

        // ── 5. Backups listing ──────────────────────────────
        const backupsDir = path.join(app.getPath("userData"), "backups");
        if (fs.existsSync(backupsDir)) {
          const backups = fs.readdirSync(backupsDir)
            .map(f => ({ name: f, sizeKB: Math.round(fs.statSync(path.join(backupsDir, f)).size / 1024) }))
            .sort((a, b) => b.sizeKB - a.sizeKB)
            .slice(0, 10);
          archive.append(JSON.stringify(backups, null, 2), { name: "backups-listing.json" });
        }

        archive.finalize();
      });

      logger.info("Diagnostics ZIP exported", { path: zipPath });
      return { saved: true, path: zipPath };
    } catch (err) {
      logger.error("Diagnostics export failed", { error: (err as Error).message });
      return { saved: false, error: (err as Error).message };
    }
  });
}
