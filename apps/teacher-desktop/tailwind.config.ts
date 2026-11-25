import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./index.html",
    "./src/renderer/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // ── NOC Dark Base ──────────────────────────────────
        base: {
          900: "#0B1120",   // page background
          800: "#111827",   // elevated cards
          700: "#1F2937",   // secondary surfaces
          600: "#374151",   // borders, dividers
          500: "#4B5563",   // muted text
          400: "#6B7280",   // placeholder text
        },
        // ── Cobalt Primary ────────────────────────────────
        cobalt: {
          600: "#1D4ED8",
          500: "#3B82F6",
          400: "#60A5FA",
          300: "#93C5FD",
        },
        // ── Semantic Status ───────────────────────────────
        success: "#10B981",
        warning: "#F59E0B",
        danger:  "#EF4444",
        info:    "#06B6D4",
        // ── Difficulty Tiers ──────────────────────────────
        easy:   "#10B981",
        medium: "#F59E0B",
        hard:   "#EF4444",
      },
      fontFamily: {
        sans: ["Inter var", "Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "Fira Code", "ui-monospace", "monospace"],
      },
      animation: {
        "pulse-fast": "pulse 0.8s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        "ping-once": "ping 0.5s cubic-bezier(0, 0, 0.2, 1) forwards",
      },
    },
  },
  plugins: [],
};

export default config;
