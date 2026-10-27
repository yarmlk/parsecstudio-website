import { useEffect, useRef, type CSSProperties, memo } from "react";
import { CLIENT_LOGOS } from "../lib/assets";
import { REVIEWS } from "../lib/facts";
import { useReduced } from "./ui";

/* 05 reviews: the cards drift, slowly and without end. On desk two columns run the whole height of
   the section, the left one up and the right one down at a slightly different speed, so the two always slide past
   each other; on the phone one column runs up. Each column holds its list twice and wraps by exactly one list, so
   the loop has no seam; the section's top and bottom fade the cards in and out.
   The drift is a CSS animation of the track's transform: the compositor runs it, so it stays smooth even while the
   page's script or the GPU is busy elsewhere. A light loop only reads where each track is and lets a card catch the
   light as it passes the middle of the section. The drift holds still while the pointer is over the reviews or the
   keyboard is on them (the section takes the focus), so a quote can be read to the end. Reduced motion: the columns
   stand still, every card in view. */

type Col = { ids: number[]; dir: 1 | -1; speed: number; start: number };
/** speed in px/s at the site's scale; start = phase of the loop at first paint (0..1) */
const DESK: Col[] = [
  { ids: [0, 2], dir: -1, speed: 16, start: 0.08 },
  { ids: [1, 3], dir: 1, speed: 12, start: 0.6 },
];
const MOB: Col[] = [{ ids: [0, 1, 2, 3], dir: -1, speed: 13, start: 0 }];

function Quote({ i, copy }: { i: number; copy: boolean }) {
  const r = REVIEWS[i];
  // the client's logo as the clients grid shows it (the same file, so it is fetched once)
  const logo = CLIENT_LOGOS.find((c) => c.name === r.client)?.file ?? r.logo;
  return (
    <figure className="st-quote">
      <span className="st-quote__lit" aria-hidden />
      <blockquote>{r.text.map((p, k) => <p key={k}>{p}</p>)}</blockquote>
      <figcaption><img src={logo} alt={copy ? "" : r.client} /></figcaption>
    </figure>
  );
}

function ReviewColumnsBase({ mode }: { mode: "desk" | "mob" }) {
  const reduced = useReduced();
  const cols = mode === "desk" ? DESK : MOB;
  const view = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const v = view.current;
    if (!v || reduced) return;
    const tracks = Array.from(v.querySelectorAll<HTMLElement>(".st-rev__track"));
    let H = 0;
    let L: number[] = [];
    /* each track's running drift and the duration it was given: kept here, so the light only reads a number per frame
       (asking the element for its animations every frame cost ~150 ms of main thread per 5 s) */
    let anims: (Animation | undefined)[] = [];
    const D: number[] = cols.map((c) => 60 / c.speed);
    const grab = () => { anims = tracks.map((t) => t.getAnimations?.()[0]); };
    let cards: { lit: HTMLElement; col: number; mid: number; on: number }[] = [];
    // each track's loop: its length decides its duration (speed in px/s), its phase is set once as a negative delay
    const measure = () => {
      H = v.clientHeight;
      const nL = tracks.map((t) => (t.firstElementChild as HTMLElement | null)?.offsetHeight ?? 0);
      nL.forEach((l, i) => {
        if (l > 0 && Math.abs(l - (L[i] ?? 0)) > 0.5) {
          const dur = Number((l / cols[i].speed).toFixed(2));
          D[i] = dur;
          tracks[i].style.setProperty("--rev-dur", `${dur}s`);
          tracks[i].style.setProperty("--rev-delay", `${(-cols[i].start * dur).toFixed(2)}s`);
        }
      });
      L = nL;
      grab();
      cards = [];
      tracks.forEach((t, c) => t.querySelectorAll<HTMLElement>(".st-quote").forEach((q) => {
        cards.push({ lit: q.querySelector<HTMLElement>(".st-quote__lit")!, col: c, mid: q.offsetTop + q.offsetHeight / 2, on: -1 });
      }));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(v);
    tracks.forEach((t) => ro.observe(t));

    // the light: where each track is right now, from its animation's clock and the phase it started at (no layout or
    // style reads); a paused drift keeps its clock still, so the light stays on the card it was on
    const where = (i: number) => {
      const a = anims[i];
      const l = L[i] || 1;
      const t = a && typeof a.currentTime === "number" ? a.currentTime / 1000 : 0;
      const f = (((t / D[i] + cols[i].start) % 1) + 1) % 1;
      return cols[i].dir < 0 ? -f * l : -l + f * l;
    };
    let raf = 0;
    const tick = () => {
      const y = cols.map((_, i) => where(i));
      // the light sits a little below the middle of the section; a card is fully lit within ~a card of it
      const c0 = H * 0.52, reach = H * 0.46;
      for (const k of cards) {
        const d = Math.abs(y[k.col] + k.mid - c0) / reach;
        const t = Math.max(0, 1 - d);
        const lit = Math.round(t * t * (3 - 2 * t) * 50) / 50;
        if (lit !== k.on) { k.on = lit; k.lit.style.opacity = String(lit); }
      }
      raf = requestAnimationFrame(tick);
    };
    // the light follows only while the columns are on screen (the drift itself never stops)
    const io = new IntersectionObserver(([e]) => {
      cancelAnimationFrame(raf);
      if (e.isIntersecting) { grab(); raf = requestAnimationFrame(tick); }
    });
    io.observe(v);
    return () => { io.disconnect(); ro.disconnect(); cancelAnimationFrame(raf); };
  }, [cols, reduced]);

  return (
    <div ref={view} className={`st-rev${reduced ? " is-still" : ""}`} role="region" aria-label="Client reviews" tabIndex={reduced ? undefined : 0}>
      {cols.map((c, ci) => (
        <div key={ci} className="st-rev__col">
          <div className={`st-rev__track${reduced ? "" : c.dir < 0 ? " is-up" : " is-down"}`} style={{ "--rev-dur": `${60 / c.speed}s` } as CSSProperties}>
            {(reduced ? [0] : [0, 1]).map((n) => (
              <div key={n} className="st-rev__set" aria-hidden={n > 0 || undefined}>
                {c.ids.map((i) => <Quote key={i} i={i} copy={n > 0} />)}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/** re-rendered only when its own props change (the services hover re-renders the page around it) */
export const ReviewColumns = memo(ReviewColumnsBase);
