import { useEffect, useRef, type CSSProperties } from "react";
import { REVIEWS } from "../lib/facts";
import { useReduced } from "./ui";

/* 05 reviews: the cards drift, slowly and without end, and never stop. On desk two columns run the whole height of
   the section, the left one up and the right one down at a slightly different speed, so the two always slide past
   each other; on the phone one column runs up. Each column holds its list twice and wraps by exactly one list, so
   the loop has no seam; the section's top and bottom fade the cards in and out.
   The drift is a CSS animation of the track's transform: the compositor runs it, so it stays smooth even while the
   page's script or the GPU is busy elsewhere. A light loop only reads where each track is and lets a card catch the
   light as it passes the middle of the section. Reduced motion: the columns stand still, every card in view. */

type Col = { ids: number[]; dir: 1 | -1; speed: number; start: number };
/** speed in px/s at the site's scale; start = phase of the loop at first paint (0..1) */
const DESK: Col[] = [
  { ids: [0, 2], dir: -1, speed: 16, start: 0.08 },
  { ids: [1, 3], dir: 1, speed: 12, start: 0.6 },
];
const MOB: Col[] = [{ ids: [0, 1, 2, 3], dir: -1, speed: 13, start: 0 }];

function Quote({ i, copy }: { i: number; copy: boolean }) {
  const r = REVIEWS[i];
  return (
    <figure className="st-quote">
      <span className="st-quote__lit" aria-hidden />
      <blockquote>{r.text.map((p, k) => <p key={k}>{p}</p>)}</blockquote>
      <figcaption><img src={r.logo} alt={copy ? "" : r.client} /></figcaption>
    </figure>
  );
}

export function ReviewColumns({ mode }: { mode: "desk" | "mob" }) {
  const reduced = useReduced();
  const cols = mode === "desk" ? DESK : MOB;
  const view = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const v = view.current;
    if (!v || reduced) return;
    const tracks = Array.from(v.querySelectorAll<HTMLElement>(".st-rev__track"));
    let H = 0;
    let L: number[] = [];
    let cards: { lit: HTMLElement; col: number; mid: number; on: number }[] = [];
    // each track's loop: its length decides its duration (speed in px/s), its phase is set once as a negative delay
    const measure = () => {
      H = v.clientHeight;
      const nL = tracks.map((t) => (t.firstElementChild as HTMLElement | null)?.offsetHeight ?? 0);
      nL.forEach((l, i) => {
        if (l > 0 && Math.abs(l - (L[i] ?? 0)) > 0.5) {
          const dur = l / cols[i].speed;
          tracks[i].style.setProperty("--rev-dur", `${dur.toFixed(2)}s`);
          tracks[i].style.setProperty("--rev-delay", `${(-cols[i].start * dur).toFixed(2)}s`);
        }
      });
      L = nL;
      cards = [];
      tracks.forEach((t, c) => t.querySelectorAll<HTMLElement>(".st-quote").forEach((q) => {
        cards.push({ lit: q.querySelector<HTMLElement>(".st-quote__lit")!, col: c, mid: q.offsetTop + q.offsetHeight / 2, on: -1 });
      }));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(v);
    tracks.forEach((t) => ro.observe(t));

    // the light: where each track is right now, read from its running animation (no layout reads)
    const where = (i: number) => {
      const a = tracks[i].getAnimations?.()[0];
      const l = L[i] || 1;
      const t = a && typeof a.currentTime === "number" ? a.currentTime / 1000 : 0;
      const dur = l / cols[i].speed;
      const f = (((t / dur) % 1) + 1) % 1;
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
      if (e.isIntersecting) raf = requestAnimationFrame(tick);
    });
    io.observe(v);
    return () => { io.disconnect(); ro.disconnect(); cancelAnimationFrame(raf); };
  }, [cols, reduced]);

  return (
    <div ref={view} className={`st-rev${reduced ? " is-still" : ""}`} role="region" aria-label="Client reviews">
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
