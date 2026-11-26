// ============================================================
// SecureAssess Teacher Desktop — Preload Script
// ============================================================

import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("electronAPI", {
  // Store
  storeGet: (key: string)                       => ipcRenderer.invoke("store:get", key),
  storeSet: (key: string, value: unknown)        => ipcRenderer.invoke("store:set", key, value),

  // Dialogs
  openFileDialog:      (filters: Electron.FileFilter[]) => ipcRenderer.invoke("dialog:openFile", filters),
  saveFileDialog:      (options: Electron.SaveDialogOptions) => ipcRenderer.invoke("dialog:saveFile", options),
  openDirectoryDialog: ()                        => ipcRenderer.invoke("dialog:openDirectory"),

  // File system
  readFile:  (filePath: string)                 => ipcRenderer.invoke("fs:readFile", filePath),
  writeFile: (filePath: string, data: Buffer)   => ipcRenderer.invoke("fs:writeFile", filePath, data),
  openPath:  (filePath: string)                 => ipcRenderer.invoke("fs:openPath", filePath),

  // PDF
  extractPdfText: (filePath: string)            => ipcRenderer.invoke("pdf:extractText", filePath),

  // Projector
  openProjector: ()                             => ipcRenderer.invoke("projector:open"),

  // Embedded API server (spawned by the main process in HOME / LAB_SERVER)
  getServerInfo: ()                             => ipcRenderer.invoke("server:info"),
  restartServer: ()                             => ipcRenderer.invoke("server:restart"),
  getDatabaseUrl:()                             => ipcRenderer.invoke("app:getDatabaseUrl"),
  onServerStatus: (cb: (data: unknown) => void) =>
    ipcRenderer.on("server:status", (_event, data) => cb(data)),
  onServerLog: (cb: (data: { level: string; line: string }) => void) =>
    ipcRenderer.on("server:log", (_event, data) => cb(data)),

  // App info & data paths
  getVersion:     ()                            => ipcRenderer.invoke("app:getVersion"),
  getPlatform:    ()                            => ipcRenderer.invoke("app:getPlatform"),
  getUserDataPath:()                            => ipcRenderer.invoke("app:getUserDataPath"),
  getDbPath:      ()                            => ipcRenderer.invoke("app:getDbPath"),

  // Auto-updater controls (renderer-initiated). Teacher release channel.
  checkForUpdates:  ()                          => ipcRenderer.invoke("updater:check"),
  downloadUpdate:   ()                          => ipcRenderer.invoke("updater:download"),
  installUpdate:    ()                          => ipcRenderer.invoke("updater:install"),

  // Event subscriptions from main → renderer
  onDiscoveryServerFound: (callback: (data: unknown) => void) =>
    ipcRenderer.on("discovery:serverFound", (_event, data) => callback(data)),

  onCctvCalibrationRequest: (callback: (data: unknown) => void) =>
    ipcRenderer.on("cctv:calibrationRequest", (_event, data) => callback(data)),

  onUpdaterStatus: (callback: (data: { stage: string; version?: string; percent?: number; message?: string }) => void) =>
    ipcRenderer.on("updater:status", (_event, data) => callback(data)),

  // CCTV service lifecycle
  cctvStart:  (env: Record<string, string>) => ipcRenderer.invoke("cctv:start", env),
  cctvStop:   ()                             => ipcRenderer.invoke("cctv:stop"),
  cctvStatus: ()                             => ipcRenderer.invoke("cctv:status"),
  cctvHealth: ()                             => ipcRenderer.invoke("cctv:health"),
  onCctvHealth: (cb: (data: { healthy: boolean; pid?: number; restarts?: number; reason?: string; restartInMs?: number }) => void) =>
    ipcRenderer.on("cctv:health", (_e, d) => cb(d)),
  onCctvLog:  (cb: (data: { level: string; line: string }) => void) =>
    ipcRenderer.on("cctv:log",     (_e, d) => cb(d)),
  onCctvStopped: (cb: (data: { code: number | null }) => void) =>
    ipcRenderer.on("cctv:stopped", (_e, d) => cb(d)),

  // Diagnostics ZIP export (1-click)
  exportDiagnostics: () => ipcRenderer.invoke("diagnostics:export"),

  removeAllListeners: (channel: string) => ipcRenderer.removeAllListeners(channel),
});
