/** All paths are relative to the page (files under public/). */

export const LOGO = {
  lockupWhite: "logo/parsec-studio-white.svg",
  markWhite: "logo/p-white.svg",
} as const;

/** 1920×1080 stills from the Parsec showreel (public/img/reel). */
export const REEL = {
  portrait: "img/reel/portrait.webp", robot: "img/reel/robot.webp", medieval: "img/reel/medieval.webp",
  forest: "img/reel/forest.webp", astronaut: "img/reel/astronaut.webp", road: "img/reel/road.webp",
} as const;

/** White client logos, 475×175 PNG, same optical box (public/img/clients). */
export const CLIENT_LOGOS: { id: string; name: string; file: string }[] = [
  ["google", "Google"], ["tefal", "Tefal"], ["fifa", "FIFA"], ["nasa", "NASA"], ["microsoft", "Microsoft"], ["kinder", "Kinder"],
  ["karcher", "Kärcher"], ["rowenta", "Rowenta"], ["henkel", "Henkel"], ["subaru", "Subaru"], ["unilever", "Unilever"], ["porsche", "Porsche"],
].map(([id, name]) => ({ id, name, file: `img/clients/${id}.png` }));

/** 4K light plates (public/img/open). */
export const OPEN = {
  cut: "img/open/cut.jpg", horizon: "img/open/horizon.webp", reflection: "img/open/reflection.webp",
} as const;
