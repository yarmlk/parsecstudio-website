/** All paths are relative to the page (files under public/). */

export const LOGO = {
  lockupWhite: "logo/parsec-studio-white.svg",
  markWhite: "logo/p-white.svg",
} as const;

/** White client logos on transparent, WebP (lossless), same optical box (public/img/clients): 320×118, and 640×236 for
 *  the three drawn wider than 160 px. */
export const CLIENT_LOGOS: { id: string; name: string; file: string }[] = [
  ["google", "Google"], ["microsoft", "Microsoft"], ["jnj", "Johnson & Johnson"], ["vodafone", "Vodafone"],
  ["tefal", "Tefal"], ["karcher", "Kärcher"], ["buldak", "Buldak"], ["kinder", "Kinder"],
  ["fifa", "FIFA"], ["henkel", "Henkel"], ["unilever", "Unilever"], ["nasa", "NASA"],
].map(([id, name]) => ({ id, name, file: `img/clients/${id}.webp` }));

/** 4K light plates (public/img/open). */
export const OPEN = {
  cut: "img/open/cut.jpg", horizon: "img/open/horizon.webp", reflection: "img/open/reflection.webp",
} as const;
