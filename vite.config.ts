import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { createHash } from "node:crypto";
import { closeSync, openSync, readSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/* Media versions: each file in public/video/site gets a short fingerprint of its size and first bytes, which the site
   appends to its URL (?v=…). A film replaced under the same name gets a new URL, so no browser or CDN keeps showing
   the old one; an unchanged film keeps its URL and stays cached. */
function mediaVersions(): Plugin {
  const id = "virtual:media-v", rid = "\0" + id;
  const dir = join(__dirname, "public/video/site");
  const table = () => {
    const out: Record<string, string> = {};
    for (const f of readdirSync(dir)) {
      const p = join(dir, f), size = statSync(p).size, buf = Buffer.alloc(Math.min(65536, size)), fd = openSync(p, "r");
      readSync(fd, buf, 0, buf.length, 0); closeSync(fd);
      out[f] = createHash("sha1").update(String(size)).update(buf).digest("hex").slice(0, 8);
    }
    return out;
  };
  return {
    name: "media-versions",
    resolveId: (s) => (s === id ? rid : null),
    load: (s) => (s === rid ? `export default ${JSON.stringify(table())};` : null),
    // the page's own preloads of media get the same versioned URL the code asks for
    transformIndexHtml: (html) => { const t = table(); return html.replace(/(video\/site\/)([\w.-]+)"/g, (m, d, f) => (t[f] ? `${d}${f}?v=${t[f]}"` : m)); },
  };
}

// Relative base: the same build works at the root of a domain (demo.parsec.studio) and under a path (parsec.studio/demo/).
export default defineConfig({
  base: "./",
  plugins: [react(), mediaVersions()],
  server: { host: "127.0.0.1" },
  build: { outDir: "dist", emptyOutDir: true, assetsInlineLimit: 0, chunkSizeWarningLimit: 3000 },
});
