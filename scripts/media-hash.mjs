/* A media file's version: a short fingerprint of its size and first 64 KB. The same one names the file on the media
   host (name.<v>.ext, see scripts/media-push.mjs) and versions its URL in dev (?v=<v>, see vite.config.ts), so a
   film replaced under the same name gets a new URL and no browser or CDN keeps the old one. */
import { createHash } from "node:crypto";
import { closeSync, openSync, readSync, statSync } from "node:fs";

export function mediaHash(path) {
  const size = statSync(path).size, buf = Buffer.alloc(Math.min(65536, size)), fd = openSync(path, "r");
  readSync(fd, buf, 0, buf.length, 0); closeSync(fd);
  return createHash("sha1").update(String(size)).update(buf).digest("hex").slice(0, 8);
}

/** the file's name on the media host: name.<v>.ext */
export const hostedName = (file, v) => file.replace(/(\.[^.]+)$/, `.${v}$1`);
