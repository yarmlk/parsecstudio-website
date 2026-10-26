#!/usr/bin/env node
/* Sync public/video/site to the Bunny storage zone behind the media CDN (VITE_MEDIA_BASE). Each file goes up under its
   hosted name, name.<v>.ext (scripts/media-hash.mjs), the name the built site asks for: a changed film is a new file,
   so no CDN cache can serve the old one. Uploads only names not there yet; never deletes.
     BUNNY_STORAGE_KEY=<storage zone password> node scripts/media-push.mjs [--dry]
   Zone and host: BUNNY_ZONE (parsec-video), BUNNY_HOST (storage.bunnycdn.com). */
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { hostedName, mediaHash } from "./media-hash.mjs";

const KEY = process.env.BUNNY_STORAGE_KEY;
const ZONE = process.env.BUNNY_ZONE || "parsec-video";
const HOST = process.env.BUNNY_HOST || "storage.bunnycdn.com";
const DIR = "public/video/site";
const DEST = "video/site/";
const dry = process.argv.includes("--dry");
if (!KEY) { console.error("BUNNY_STORAGE_KEY is not set"); process.exit(1); }

const base = `https://${HOST}/${ZONE}/${DEST}`;
const remote = new Map();
const res = await fetch(base, { headers: { AccessKey: KEY, Accept: "application/json" } });
if (res.ok) {
  for (const f of await res.json()) if (!f.IsDirectory) remote.set(f.ObjectName, String(f.Checksum || "").toUpperCase());
} else if (res.status !== 404) { console.error("list failed", res.status, await res.text()); process.exit(1); }

const files = readdirSync(DIR).filter((f) => statSync(join(DIR, f)).isFile() && !f.startsWith("."));
const todo = [];
for (const f of files) {
  const name = hostedName(f, mediaHash(join(DIR, f)));
  if (remote.has(name)) continue;
  const buf = readFileSync(join(DIR, f));
  todo.push({ f, name, sha: createHash("sha256").update(buf).digest("hex").toUpperCase(), size: buf.length });
}
const mb = (n) => (n / 1e6).toFixed(1);
console.log(`${files.length} files, ${todo.length} to upload (${mb(todo.reduce((a, t) => a + t.size, 0))} MB)`);
if (dry) { for (const t of todo) console.log("  ", t.name); process.exit(0); }

let done = 0, failed = 0;
const put = async ({ f, name, sha }) => {
  for (let i = 0; i < 3; i++) {
    const r = await fetch(base + encodeURIComponent(name), {
      method: "PUT", body: readFileSync(join(DIR, f)),
      headers: { AccessKey: KEY, Checksum: sha, "Content-Type": "application/octet-stream" },
    }).catch((e) => ({ ok: false, status: String(e) }));
    if (r.ok) { done++; console.log(`  ${done}/${todo.length} ${name}`); return; }
    console.warn(`  retry ${f}: ${r.status}`);
  }
  failed++; console.error(`  FAILED ${f}`);
};
const queue = [...todo];
await Promise.all(Array.from({ length: 4 }, async () => { while (queue.length) await put(queue.shift()); }));
console.log(`uploaded ${done}, failed ${failed}`);
process.exit(failed ? 1 : 0);
