// ============================================================
// SecureAssess Teacher Desktop — IPC Handler Registration
// SECURITY: Every handler validates event.senderFrame origin.
// ============================================================

import { IpcMain, IpcMainInvokeEvent, dialog, shell } from "electron";
import fs from "fs";

// ── Frame origin allowlist ────────────────────────────────────
const ALLOWED_ORIGINS = new Set([
  "http://localhost:5173",
  "file://",
  "null",
]);

function isFrameAllowed(event: IpcMainInvokeEvent): boolean {
  try {
    const frame = event.senderFrame;
    if (!frame) return false;
    const origin = frame.origin ?? "null";
    return ALLOWED_ORIGINS.has(origin) || origin.startsWith("file://");
  } catch {
    return false;
  }
}

// Wrap any handler with frame-origin validation
function secure<T>(
  ipcMain: IpcMain,
  channel: string,
  handler: (event: IpcMainInvokeEvent, ...args: any[]) => T | Promise<T>
): void {
  ipcMain.handle(channel, async (event, ...args) => {
    if (!isFrameAllowed(event)) {
      console.warn(`IPC blocked: unauthorized frame for "${channel}"`);
      return null;
    }
    return handler(event, ...args);
  });
}

export function registerIpcHandlers(
  ipcMain: IpcMain,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  store: any,
  openProjector: () => Promise<void>
): void {

  // ── Settings ─────────────────────────────────────────────
  secure(ipcMain, "store:get", (_event, key: string) => store.get(key));
  secure(ipcMain, "store:set", (_event, key: string, value: unknown) => store.set(key, value));

  // ── File dialogs ─────────────────────────────────────────
  secure(ipcMain, "dialog:openFile", async (_event, filters: Electron.FileFilter[]) => {
    const result = await dialog.showOpenDialog({ filters, properties: ["openFile"] });
    return result.canceled ? null : result.filePaths[0];
  });

  secure(ipcMain, "dialog:saveFile", async (_event, options: Electron.SaveDialogOptions) => {
    const result = await dialog.showSaveDialog(options);
    return result.canceled ? null : result.filePath;
  });

  secure(ipcMain, "dialog:openDirectory", async () => {
    const result = await dialog.showOpenDialog({ properties: ["openDirectory"] });
    return result.canceled ? null : result.filePaths[0];
  });

  // ── File system ───────────────────────────────────────────
  secure(ipcMain, "fs:readFile", async (_event, filePath: string) =>
    fs.readFileSync(filePath)
  );

  secure(ipcMain, "fs:writeFile", async (_event, filePath: string, data: Buffer) => {
    fs.writeFileSync(filePath, data);
    return true;
  });

  secure(ipcMain, "fs:openPath", async (_event, filePath: string) => {
    shell.showItemInFolder(filePath);
  });

  // ── PDF extraction ────────────────────────────────────────
  secure(ipcMain, "pdf:extractText", async (_event, filePath: string) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pdfParse = require("pdf-parse");
    const buffer   = fs.readFileSync(filePath);
    const result   = await pdfParse(buffer);
    return { text: result.text, pages: result.numpages };
  });

  // ── Projector ─────────────────────────────────────────────
  secure(ipcMain, "projector:open", async () => {
    await openProjector();
    return true;
  });

  // ── App info ─────────────────────────────────────────────
  secure(ipcMain, "app:getVersion", () =>
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require("electron").app.getVersion()
  );
  secure(ipcMain, "app:getPlatform", () => process.platform);
}
