import { memo } from "react";
import type { PointerEvent } from "react";
import { useReduced } from "./ui";

/* 04 clients: the logo grid. A tile has no hover state. The pointer coming in sends a slow pulse of warm light
   through the glass from where it entered: it swells for about half a second while it flows in towards the
   middle of the tile, then dies away over the next few seconds. Every tile keeps its own pulses, so a sweep
   across the grid leaves a trail of light that fades behind the pointer. Reduced motion: the same light, no
   travel (it only fades in and out). */

export type ClientLogo = { id: string; name: string; file: string };

const SWELL = 620; // ms to the peak
const DECAY = 2700; // ms from the peak back to dark
const TOTAL = SWELL + DECAY;
const PEAK = SWELL / TOTAL;
const MAX = 4; // pulses alive in one tile
const EASE_SWELL = "cubic-bezier(.45, 0, .2, 1)"; // --ease-move: the light gathers, then settles on the peak
const EASE_DECAY = "cubic-bezier(.3, 0, .35, 1)"; // a long, soft tail

function pulse(tile: HTMLElement, clientX: number, clientY: number, reduced: boolean) {
  const host = tile.querySelector<HTMLElement>(".st-logo__light");
  if (!host) return;
  // where the pointer came in, in the tile's own (unscaled) px: the site may be scaled inside a frame
  const r = tile.getBoundingClientRect();
  const w = tile.offsetWidth, h = tile.offsetHeight;
  const fx = Math.min(1, Math.max(0, (clientX - r.left) / (r.width || 1)));
  const fy = Math.min(1, Math.max(0, (clientY - r.top) / (r.height || 1)));
  // the light flows from the edge it came through towards the middle
  const dx = (0.5 - fx) * w * 0.55, dy = (0.5 - fy) * h * 0.55;

  while (host.childElementCount >= MAX * 2) host.firstElementChild?.remove();

  const bloom = document.createElement("i");
  bloom.className = "st-logo__bloom";
  bloom.style.left = `${fx * 100}%`;
  bloom.style.top = `${fy * 100}%`;
  const rim = document.createElement("i");
  rim.className = "st-logo__rim";
  host.append(rim, bloom);

  // reduced motion: the light stands still where the travelled pulse would peak, and only fades
  const at = (k: number, s: number) => (reduced
    ? `translate(-50%, -50%) translate(${dx * 0.55}px, ${dy * 0.55}px) scale(.82)`
    : `translate(-50%, -50%) translate(${dx * k}px, ${dy * k}px) scale(${s})`);
  const opts: KeyframeAnimationOptions = { duration: TOTAL, fill: "both" };
  const a = bloom.animate([
    { offset: 0, opacity: 0, transform: at(0, 0.3), easing: EASE_SWELL },
    { offset: PEAK, opacity: 1, transform: at(0.55, 0.82), easing: EASE_DECAY },
    { offset: 1, opacity: 0, transform: at(1, 1.12) },
  ], opts);
  rim.animate([
    { offset: 0, opacity: 0, easing: EASE_SWELL },
    { offset: PEAK, opacity: 1, easing: EASE_DECAY },
    { offset: 1, opacity: 0 },
  ], opts);
  a.onfinish = () => { bloom.remove(); rim.remove(); };
}

function LogoGridBase({ logos, widths }: { logos: ClientLogo[]; widths: Record<string, number> }) {
  const reduced = useReduced();
  const onEnter = (e: PointerEvent<HTMLLIElement>) => pulse(e.currentTarget, e.clientX, e.clientY, reduced);
  return (
    <ul className="st-logos">
      {logos.map((l) => (
        <li key={l.id} className="st-logo" onPointerEnter={onEnter}>
          <span className="st-logo__light" aria-hidden />
          <img src={l.file} alt={l.name} width={475} height={175} loading="lazy" style={{ ["--w" as string]: widths[l.id] ?? 220 }} />
        </li>
      ))}
    </ul>
  );
}

/** re-rendered only when its own props change (the services hover re-renders the page around it) */
export const LogoGrid = memo(LogoGridBase);
