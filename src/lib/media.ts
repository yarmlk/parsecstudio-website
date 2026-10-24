import versions from "virtual:media-v";

/** where the films live: on the site by default, or on a media host (VITE_MEDIA_BASE, e.g. a CDN in front of a bucket,
 *  serving the same paths with CORS open, since the stage draws loops into WebGL) */
export const MEDIA = (import.meta.env.VITE_MEDIA_BASE as string | undefined) ?? "";

/** a file of public/video/site, with its version in the URL (see vite.config.ts) */
export const media = (file: string) => {
  const v = (versions as Record<string, string>)[file];
  return `${MEDIA}video/site/${file}${v ? `?v=${v}` : ""}`;
};
