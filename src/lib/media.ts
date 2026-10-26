import versions from "virtual:media-v";

/** where the films live: on the site by default, or on a media host (VITE_MEDIA_BASE, e.g. a CDN in front of a bucket,
 *  serving the same paths with CORS open, since the stage draws loops into WebGL) */
export const MEDIA = (import.meta.env.VITE_MEDIA_BASE as string | undefined) ?? "";

/** a file of public/video/site at its current version (scripts/media-hash.mjs): on the media host under its hosted
 *  name, name.<v>.ext (a replaced film is a new file there, so no CDN cache serves the old one); in dev with ?v=<v> */
export const media = (file: string) => {
  const v = (versions as Record<string, string>)[file];
  if (!v) return `${MEDIA}video/site/${file}`;
  return MEDIA ? `${MEDIA}video/site/${file.replace(/(\.[^.]+)$/, `.${v}$1`)}` : `video/site/${file}?v=${v}`;
};
