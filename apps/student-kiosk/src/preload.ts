// ============================================================
// SecureAssess Student Kiosk — Preload Script
// ============================================================

import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("kioskAPI", {
  getHardwareToken:  () => ipcRenderer.invoke("kiosk:getHardwareToken"),
  getSystemNo:       () => ipcRenderer.invoke("kiosk:getSystemNo"),
  getServerUrl:      () => ipcRenderer.invoke("kiosk:getServerUrl"),
  getLockdownMode:   () => ipcRenderer.invoke("kiosk:getLockdownMode"),
  setLockdownMode:   (mode: "KIOSK" | "WINDOWED") => ipcRenderer.invoke("kiosk:setLockdownMode", mode),
  unlock:            (code: string) => ipcRenderer.invoke("kiosk:unlock", code),

  // Environment security check — VM/RDP/multi-monitor
  getEnvironmentCheck: () => ipcRenderer.invoke("kiosk:getEnvironmentCheck"),

  // WINDOWED mode — main process emits these when window loses/gains focus
  onWindowBlur:  (cb: () => void) => ipcRenderer.on("kiosk:windowBlur",  () => cb()),
  onWindowFocus: (cb: () => void) => ipcRenderer.on("kiosk:windowFocus", () => cb()),

  // Auto-updater (student release channel; never downloads automatically)
  checkForUpdates: () => ipcRenderer.invoke("updater:check"),
  downloadUpdate:  () => ipcRenderer.invoke("updater:download"),
  installUpdate:   () => ipcRenderer.invoke("updater:install"),
  onUpdaterStatus: (cb: (data: {
    stage: string; channel: string; version?: string; percent?: number; message?: string;
  }) => void) => ipcRenderer.on("updater:status", (_e, data) => cb(data)),

  removeAllListeners: (ch: string) => ipcRenderer.removeAllListeners(ch),
});
