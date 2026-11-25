/**
 * SecureAssess Teacher Desktop — electron-builder afterPack hook
 * Applies @electron/fuses to the built binary for production hardening.
 *
 * Usage in electron-builder.yml:
 *   afterPack: ./afterPack.js
 */
const { applyFuses } = require("./dist/main/fuses.js");

exports.default = async function afterPack(context) {
  const appPath = context.appOutDir;
  const electronPath = require("path").join(
    appPath,
    context.electronPlatformName === "win32" ? "SecureAssess Teacher.exe" : "SecureAssess Teacher"
  );
  try {
    await applyFuses(electronPath);
  } catch (err) {
    console.warn("afterPack: fuses failed (non-fatal):", err.message);
  }
};
