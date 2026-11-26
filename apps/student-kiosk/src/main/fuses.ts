// ============================================================
// SecureAssess Student Kiosk — @electron/fuses Configuration
// This file is imported by electron-builder's afterPack hook
// (dist/main/fuses.js) to flip Electron fuses on the built binary.
//
// In production:
//   • runAsNode: OFF   — prevents `ELECTRON_RUN_AS_NODE` env injection
//   • nodeCliInspect: OFF  — blocks --inspect / --inspect-brk
//   • onlyLoadAppFromAsar: ON  — prevents loading from loose dirs
//   • loadBrowserProcessSpecificV8SnapshotFile: OFF
//   • grantFileProtocolExtraPrivileges: OFF
// ============================================================

// eslint-disable-next-line @typescript-eslint/no-require-imports
export async function applyFuses(buildPath: string): Promise<void> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { flipFuses, FuseVersion, FuseV1Options } = require("@electron/fuses");
    const isDev = process.env.NODE_ENV === "development";
    if (isDev) return; // skip in dev

    const options: typeof FuseV1Options = {
      version: FuseVersion.V1,
      resetAdditionalFuses: true,
      override: {
        runAsNode: false,                         // ← disable
        nodeCliInspect: false,                    // ← disable --inspect
        enableEmbeddedAsarIntegrityValidation: true,
        onlyLoadAppFromAsar: true,                // ← enforce asar
        loadBrowserProcessSpecificV8SnapshotFile: false,
        grantFileProtocolExtraPrivileges: false,  // ← no extra file:// power
      },
    };

    await flipFuses(buildPath, options);
    console.log("@electron/fuses applied to production binary");
  } catch (err) {
    console.warn("@electron/fuses not available or failed:", (err as Error).message);
    // Non-fatal — fuses are defense-in-depth, not a hard gate
  }
}
