#!/usr/bin/env node
/**
 * SecureAssess Server — production bundle
 *
 * Produces apps/server/dist/bundle.cjs: a single CommonJS file the Teacher
 * desktop app spawns with ELECTRON_RUN_AS_NODE (no Node install, no terminal,
 * no node_modules resolution beyond the packages copied next to it).
 *
 * External (must exist at runtime next to the bundle):
 *   @prisma/client + .prisma  — generated client + native query engine
 *   *.node                    — native addons
 *   pdf-parse                 — reads `module.parent` at require time; bundled
 *                               it would think it is in debug mode and try to
 *                               load a fixture PDF during startup
 */
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const here = path.dirname(fileURLToPath(import.meta.url));
const serverDir = path.resolve(here, "..");
const outFile = path.join(serverDir, "dist", "bundle.cjs");

fs.mkdirSync(path.dirname(outFile), { recursive: true });

try {
  const result = await build({
    absWorkingDir: serverDir,
    entryPoints: [path.join(serverDir, "src", "index.ts")],
    outfile: outFile,
    bundle: true,
    platform: "node",
    format: "cjs",
    target: "node20",
    sourcemap: "external",
    logLevel: "info",
    external: ["electron", "@prisma/client", ".prisma", "*.node", "pdf-parse"],
    define: {
      "process.env.NODE_ENV": JSON.stringify(process.env.NODE_ENV ?? "production"),
    },
    metafile: true,
  });

  const bytes = Object.values(result.metafile.outputs)[0]?.bytes ?? 0;
  console.log(`bundled: ${path.relative(serverDir, outFile)} (${(bytes / 1024).toFixed(0)} KB)`);
} catch (err) {
  console.error("esbuild failed:", err instanceof Error ? err.message : err);
  process.exit(1);
}
