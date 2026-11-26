#!/usr/bin/env node
/**
 * SecureAssess — Electron main/preload bundler (esbuild)
 *
 * Bundles a desktop app's main process and preload script into
 *   dist/main/index.js      (package.json "main")
 *   dist/preload/index.js   (BrowserWindow webPreferences.preload)
 * plus dist/main/fuses.js when the app has a fuses entry (afterPack requires it).
 *
 * Dependencies are inlined so the packaged app does not depend on a
 * node_modules tree at runtime, except for items that cannot be bundled:
 *   electron            — provided by the runtime
 *   @prisma/client/.prisma — resolve generated engine artefacts at runtime
 *   *.node              — native addons (asarUnpack'd)
 *   pdf-parse           — evaluates module.parent at require time; bundling it
 *                         would switch it into debug mode and make it read a
 *                         fixture PDF at startup
 *
 * Usage (from an app directory):  node ../../scripts/build-electron.mjs .
 */
import path from "node:path";
import fs from "node:fs";
import { build } from "esbuild";

const appArg = process.argv[2];
if (!appArg) {
  console.error("usage: node scripts/build-electron.mjs <app-dir>");
  process.exit(1);
}

const appDir = path.resolve(process.cwd(), appArg);
const srcPath = (p) => path.join(appDir, "src", p);

function entry(input, out) {
  const abs = srcPath(input);
  return fs.existsSync(abs) ? { in: abs, out } : null;
}

const entryPoints = [
  entry("main/index.ts", "main/index"),
  entry("preload.ts", "preload/index"),
  entry("main/fuses.ts", "main/fuses"), // afterPack.js requires dist/main/fuses.js
].filter(Boolean);

if (entryPoints.length === 0) {
  console.error(`No entry points found under ${path.join(appDir, "src")}`);
  process.exit(1);
}

const EXTERNAL = [
  "electron",
  "@prisma/client",
  ".prisma",
  "*.node",
  "pdf-parse",
];

try {
  const result = await build({
    absWorkingDir: appDir,
    entryPoints,
    outdir: path.join(appDir, "dist"),
    bundle: true,
    platform: "node",
    format: "cjs",
    target: "node20",       // Electron 31 ships Node 20
    sourcemap: true,
    logLevel: "info",
    external: EXTERNAL,
    // Keep require()s of Node builtins intact — nothing to bundle there.
    packages: "bundle",
    metafile: true,
  });

  const outputs = Object.entries(result.metafile.outputs)
    .filter(([file]) => file.endsWith(".js"))
    .map(([file, meta]) => `${path.relative(appDir, path.resolve(appDir, file))} (${(meta.bytes / 1024).toFixed(0)} KB)`);

  console.log(`bundled: ${outputs.join(", ")}`);
} catch (err) {
  console.error("esbuild failed:", err instanceof Error ? err.message : err);
  process.exit(1);
}
