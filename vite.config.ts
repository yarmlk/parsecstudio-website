import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { readdirSync, rmSync, statSync } from "node:fs";
import { hostedName, mediaHash } from "./scripts/media-hash.mjs";
import { join } from "node:path";

/* Media versions (scripts/media-hash.mjs): in dev each file of public/video/site is asked for with ?v=<v>; built for a
   media host (VITE_MEDIA_BASE) it is asked for by its hosted name, name.<v>.ext, so a replaced film is a new file there
   and no CDN cache can serve the old one under the new URL. */
function mediaVersions(base: string): Plugin {
  const id = "virtual:media-v", rid = "\0" + id;
  const dir = join(__dirname, "public/video/site");
  const table = () => {
    const out: Record<string, string> = {};
    for (const f of readdirSync(dir)) if (statSync(join(dir, f)).isFile() && !f.startsWith(".")) out[f] = mediaHash(join(dir, f));
    return out;
  };
  const url = (f: string, v: string) => (base ? `${base}video/site/${hostedName(f, v)}` : `video/site/${f}?v=${v}`);
  let outDir = "";
  return {
    name: "media-versions",
    configResolved: (c) => { outDir = c.build.outDir.startsWith("/") ? c.build.outDir : join(c.root, c.build.outDir); },
    // media.json: each file's URL as built (the /diag.html check reads it)
    generateBundle() {
      const t = table();
      this.emitFile({ type: "asset", fileName: "media.json", source: JSON.stringify(Object.fromEntries(Object.entries(t).map(([f, v]) => [f, url(f, v)]))) });
    },
    // built for a media host, the films are not shipped with the site (public/ is copied into the build by default)
    closeBundle() { if (base && outDir) rmSync(join(outDir, "video"), { recursive: true, force: true }); },
    resolveId: (s) => (s === id ? rid : null),
    load: (s) => (s === rid ? `export default ${JSON.stringify(table())};` : null),
    // the page's own preloads of media get the same URL the code asks for: on the media host, versioned. Each preload
    // states its own CORS mode in index.html (crossorigin only where the code fetches with CORS, as the light does for
    // what it draws into WebGL): a preload whose mode differs from the request's is fetched twice
    // and the media host's connections open with the page: one for the images (no CORS), one for what is fetched with
    // CORS (the hero's film and what the light draws), as the browser keeps the two apart
    transformIndexHtml: (html) => {
      const t = table();
      const out = html.replace(/"video\/site\/([\w.-]+)"/g, (m, f) => (t[f] ? `"${url(f, t[f])}"` : m));
      if (!base) return out;
      const origin = new URL(base).origin;
      return out.replace(/(<meta name="viewport"[^>]*>\n)/, `$1<link rel="preconnect" href="${origin}">\n<link rel="preconnect" href="${origin}" crossorigin>\n`);
    },
  };
}

// Relative base: the same build works at the root of a domain (demo.parsec.studio) and under a path (parsec.studio/demo/).
export default defineConfig(({ mode }) => ({
  base: "./",
  // the films' host (.env.production: the Bunny CDN); empty in dev, where they come from public/
  plugins: [react(), mediaVersions(loadEnv(mode, __dirname, "VITE_").VITE_MEDIA_BASE ?? "")],
  server: { host: "127.0.0.1" },
  build: { outDir: "dist", emptyOutDir: true, assetsInlineLimit: 0, chunkSizeWarningLimit: 3000 },
}));
