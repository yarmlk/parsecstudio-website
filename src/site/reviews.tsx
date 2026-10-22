import { useEffect, useRef } from "react";
import { REVIEWS } from "../lib/facts";
import { useReduced } from "./ui";

/* 05 reviews: the cards drift, slowly and without end. On desk two columns run the whole height of the section,
   the left one up and the right one down at a slightly different speed, so the two always slide past each other;
   on the phone one column runs up. Each column holds its list twice and wraps by exactly one list, so the loop
   has no seam; the section's top and bottom fade the cards in and out. A card catches the light as it passes the
   middle of the section and loses it as it leaves. The pointer (or focus) over the columns brings them gently to
   rest for reading. Reduced motion: the columns stand still, every card in view. */

type Col = { ids: number[]; dir: 1 | -1; speed: number; start: number };
/** speed in px/s at the site's scale; start = phase of the loop at first paint (0..1) */
const DESK: Col[] = [
  { ids: [0, 2], dir: -1, speed: 16, start: 0.08 },
  { ids: [1, 3], dir: 1, speed: 12, start: 0.6 },
];
const MOB: Col[] = [{ ids: [0, 1, 2, 3], dir: -1, speed: 13, start: 0 }];
const SETTLE = 420; // ms, time constant of the ease into rest and back

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
  const hold = useRef(false);

  useEffect(() => {
    const v = view.current;
    if (!v || reduced) return;
    const tracks = Array.from(v.querySelectorAll<HTMLElement>(".st-rev__track"));
    let H = 0;
    let L: number[] = [];
    let cards: { lit: HTMLElement; col: number; mid: number; on: number }[] = [];
    const p = cols.map(() => 0);
    let phased = false;
    const measure = () => {
      H = v.clientHeight;
      L = tracks.map((t) => (t.firstElementChild as HTMLElement | null)?.offsetHeight ?? 0);
      cards = [];
      tracks.forEach((t, c) => t.querySelectorAll<HTMLElement>(".st-quote").forEach((q) => {
        cards.push({ lit: q.querySelector<HTMLElement>(".st-quote__lit")!, col: c, mid: q.offsetTop + q.offsetHeight / 2, on: -1 });
      }));
      if (!phased && L.every((l) => l > 0)) { cols.forEach((c, i) => { p[i] = c.start * L[i]; }); phased = true; }
    };
    const paint = () => {
      const y = cols.map((c, i) => {
        const l = L[i] || 1;
        const m = ((p[i] % l) + l) % l;
        const ty = c.dir < 0 ? -m : m - l;
        tracks[i].style.transform = `translate3d(0, ${ty.toFixed(2)}px, 0)`;
        return ty;
      });
      // the light sits a little below the middle of the section; a card is fully lit within ~a card of it
      const c0 = H * 0.52, reach = H * 0.46;
      for (const k of cards) {
        const d = Math.abs(y[k.col] + k.mid - c0) / reach;
        const t = Math.max(0, 1 - d);
        const lit = Math.round(t * t * (3 - 2 * t) * 100) / 100;
        if (lit !== k.on) { k.on = lit; k.lit.style.opacity = String(lit); }
      }
    };
    measure();
    paint();
    const ro = new ResizeObserver(() => { measure(); paint(); });
    ro.observe(v);
    tracks.forEach((t) => ro.observe(t));

    let raf = 0, last = 0, rate = 1;
    const tick = (now: number) => {
      const dt = last ? Math.min(250, now - last) : 16; // no jump after a stall
      last = now;
      const target = hold.current ? 0 : 1;
      rate += (target - rate) * (1 - Math.exp(-dt / SETTLE));
      if (Math.abs(target - rate) < 0.004) rate = target;
      if (rate > 0) {
        cols.forEach((c, i) => { p[i] += (c.speed * rate * dt) / 1000; });
        paint();
      }
      raf = requestAnimationFrame(tick);
    };
    // runs only while the columns are on screen
    const io = new IntersectionObserver(([e]) => {
      cancelAnimationFrame(raf);
      last = 0;
      if (e.isIntersecting) raf = requestAnimationFrame(tick);
    });
    io.observe(v);
    return () => { io.disconnect(); ro.disconnect(); cancelAnimationFrame(raf); };
  }, [cols, reduced]);

  const rest = (on: boolean) => () => { hold.current = on; };
  return (
    <div
      ref={view}
      className={`st-rev${reduced ? " is-still" : ""}`}
      role="region"
      aria-label="Client reviews"
      tabIndex={reduced ? undefined : 0}
      onPointerEnter={rest(true)}
      onPointerLeave={rest(false)}
      onFocus={rest(true)}
      onBlur={rest(false)}
    >
      {cols.map((c, ci) => (
        <div key={ci} className="st-rev__col">
          <div className="st-rev__track">
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
