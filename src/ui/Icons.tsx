import type { CSSProperties } from "react";

/** Parsec icon geometry: 24 grid, 1.5 stroke, round caps and joins, no fills. Paper by default; never glowing. */
const P: Record<string, string> = {
  "arrow-left": "M19 12H5M11 6l-6 6 6 6",
  "arrow-right": "M5 12h14M13 6l6 6-6 6",
  "arrow-up-right": "M7 17 17 7M9 7h8v8",
  contents: "M4 5h7v6H4zM13 5h7v6h-7zM4 13h7v6H4zM13 13h7v6h-7z",
  search: "M10.5 17a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13zM15.5 15.5 20 20",
  download: "M12 4v11M7 10.5l5 5 5-5M5 19.5h14",
  copy: "M9 9h10v10H9zM5 15V5h10",
  check: "M5 12.5l4.2 4.2L19 7",
  expand: "M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5",
  collapse: "M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5",
  close: "M6 6l12 12M18 6 6 18",
  comment: "M5 5h14v10H10l-4 4v-4H5z",
  play: "M8 5.5v13l10.5-6.5z",
  pause: "M7.5 5v14M16.5 5v14",
  replay: "M5 12a7 7 0 1 0 2.1-5M5 4v4h4",
  external: "M14 5h5v5M19 5l-8 8M18 14v5H5V6h5",
  menu: "M4 8h16M4 16h16",
  minus: "M5 12h14",
  plus: "M12 5v14M5 12h14",
  camera: "M4 8h4l1.5-2h5L16 8h4v11H4zM12 16.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z",
  layers: "M12 4 3 9l9 5 9-5zM3 14l9 5 9-5",
  timeline: "M4 7h9M4 12h16M4 17h6M15 5v4M8 15v4",
  footage: "M4 6h16v12H4zM8 6v12M16 6v12M4 10h4M16 10h4M4 14h4M16 14h4",
  storyboard: "M4 5h7v6H4zM13 5h7v6h-7zM4 15h7M13 15h7M4 19h5M13 19h5",
  agent: "M12 3v3M12 18v3M3 12h3M18 12h3M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z",
  render: "M12 3 4 7.5v9L12 21l8-4.5v-9zM4 7.5l8 4.5 8-4.5M12 12v9",
  delivery: "M4 7h11v9H4zM15 10h3l2 3v3h-5M7.5 19a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM17.5 19a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z",
  deadline: "M12 20a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM12 8v4l3 2",
  approved: "M12 20a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM8.5 12.2l2.4 2.4 4.8-5",
  folder: "M4 6h6l2 2h8v10H4z",
  link: "M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1",
  sound: "M5 10v4h3l4 3V7L8 10zM16 9a4 4 0 0 1 0 6M18.5 6.5a7.5 7.5 0 0 1 0 11",
  mute: "M5 10v4h3l4 3V7L8 10zM16 9.5l5 5M21 9.5l-5 5",
  globe: "M12 20a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM4 12h16M12 4c2.2 2.3 3.2 5 3.2 8s-1 5.7-3.2 8c-2.2-2.3-3.2-5-3.2-8s1-5.7 3.2-8z",
};

export type IconName = keyof typeof P;
export const ICON_NAMES = Object.keys(P) as IconName[];

export function Icon({ name, size = 18, style, className, label }: { name: IconName | string; size?: number; style?: CSSProperties; className?: string; label?: string }) {
  const d = P[name] ?? P.plus;
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"
      style={{ flex: "none", ...style }} role={label ? "img" : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
      <path d={d} fill={name === "play" ? "currentColor" : "none"} stroke={name === "play" ? "none" : "currentColor"} />
    </svg>
  );
}

/** Raw SVG markup of an icon, for copy buttons. */
export const iconSvg = (name: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#F2F0EB" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="${P[name] ?? ""}"/></svg>`;
