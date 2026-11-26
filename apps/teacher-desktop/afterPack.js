/**
 * SecureAssess — electron-builder afterPack hook
 * Applies @electron/fuses to the production binary.
 *
 * Binary path resolution:
 *   win32  ? <appOutDir>/<productFilename>.exe
 *   linux  ? <appOutDir>/<executableName>   (uses executableName, not productName)
 *   darwin ? <appOutDir>/<productFilename>.app/Contents/MacOS/<productFilename>
 */
const path = require("path");

exports.default = async function afterPack(context) {
  const { appOutDir, electronPlatformName, packager } = context;

  // Resolve the binary path correctly per platform
  let electronPath;
  if (electronPlatformName === "win32") {
    electronPath = path.join(appOutDir, `${packager.appInfo.productFilename}.exe`);
  } else if (electronPlatformName === "darwin") {
    const productName = packager.appInfo.productFilename;
    electronPath = path.join(appOutDir, `${productName}.app`, "Contents", "MacOS", productName);
  } else {
    // Linux — must use executableName (lowercase, hyphenated), NOT productFilename
    // productFilename would be "SecureAssess Teacher" which does not exist on disk
    const execName = packager.config.linux && packager.config.linux.executableName
      ? packager.config.linux.executableName
      : packager.appInfo.productFilename.toLowerCase().replace(/\s+/g, "-");
    electronPath = path.join(appOutDir, execName);
  }

  console.log(`afterPack: applying @electron/fuses to ${electronPath}`);

  try {
    const { applyFuses } = require("./dist/main/fuses.js");
    await applyFuses(electronPath);
    console.log("afterPack: fuses applied successfully");
  } catch (err) {
    console.warn("afterPack: fuses failed (non-fatal):", err.message);
  }
};