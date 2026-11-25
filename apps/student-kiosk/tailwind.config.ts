import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./index.html",
    "./src/renderer/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        cobalt: {
          600: "#1D4ED8",
          500: "#3B82F6",
          400: "#60A5FA",
        },
        easy:   "#10B981",
        medium: "#F59E0B",
        hard:   "#EF4444",
      },
      fontFamily: {
        sans: ["Inter var", "Inter", "ui-sans-serif", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
