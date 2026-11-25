import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

// Teacher Desktop — Renderer Vite config (port 5173)
export default defineConfig({
  plugins: [react()],
  base: "./",
  server: {
    port: 5173,
    strictPort: true,
  },
  resolve: {
    alias: [
      {
        // Point to ESM build — Rollup handles it natively
        find: "@secureassess/shared",
        replacement: path.resolve(__dirname, "../../packages/shared/dist/esm/index.js"),
      },
      {
        find: "@",
        replacement: path.resolve(__dirname, "src/renderer"),
      },
    ],
    dedupe: ["react", "react-dom"],
  },
  build: {
    outDir: "dist/renderer",
    emptyOutDir: true,
    rollupOptions: {
      input: path.resolve(__dirname, "index.html"),
    },
  },
});
