import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Relative base: the same build works at the root of a domain (demo.parsec.studio) and under a path (parsec.studio/demo/).
export default defineConfig({
  base: "./",
  plugins: [react()],
  server: { host: "127.0.0.1" },
  build: { outDir: "dist", emptyOutDir: true, assetsInlineLimit: 0, chunkSizeWarningLimit: 3000 },
});
