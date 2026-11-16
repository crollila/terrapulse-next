import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// Relative base so the same build works on GitHub Pages sub-paths and locally.
export default defineConfig({
  base: "./",
  plugins: [react()],
  build: { target: "es2022", chunkSizeWarningLimit: 1500 },
  server: { port: 5173, strictPort: false },
  test: { environment: "node", include: ["src/**/*.test.ts"] },
});
