import { useCallback, useEffect, useId, useRef, useState, useSyncExternalStore, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import { useReduced } from "../ui";
import { REEL_SRC, type HeroCtl, type ReelPhase } from "./reel";
import "./reel-cta.css";

/**
 * The showreel's controls. The disc itself is the play control: over its glass the pointer becomes a frosted badge
 * (desk), and a click or a tap there opens the film. Keyboard users keep a button. Every control here is the site's
 * frost, lit from below the way the rim's light would light it.
 *
 * Three button variants are compared in DEV only (?cta=a|b|c and the small panel bottom-right); production renders A.
 *  A  Lens pill: a small lens shows the live film, then "Showreel" and its length.
 *  B  On the light: a frosted label rides the hottest point of the rim, just above it on the glass.
 *  C  Quiet pill: a frost circle with the play glyph, "Showreel", a hairline, its length.
 */

const VARIANTS = ["a", "b", "c"] as const;
export type CtaVariant = (typeof VARIANTS)[number];
type Mode = "desk" | "mob";
type Ctl = RefObject<HeroCtl | null>;
type Btn = RefObject<HTMLButtonElement | null>;
/** what warms the light: the pointer on the glass, a control hovered or focused. The strongest wins. */
export type Tease = (src: "glass" | "btn", v: number) => void;

export function useTease(ctl: Ctl): Tease {
  const src = useRef({ glass: 0, btn: 0 });
  return useCallback((k, v) => {
    src.current[k] = v;
    const c = ctl.current;
    if (!c) return;
    const ph = c.phase();
    // the anticipation holds through the flare; once the film is out, or on its way back, the light rests
    if (ph === "idle") c.tease(Math.max(src.current.glass, src.current.btn));
    else if (ph !== "opening") c.tease(0);
  }, [ctl]);
}

/** "0:55" → "55 seconds", for the accessible description */
const spoken = (d: string) => {
  const [m, s] = d.split(":").map(Number);
  const parts = [m ? `${m} minute${m > 1 ? "s" : ""}` : "", s ? `${s} second${s > 1 ? "s" : ""}` : ""].filter(Boolean);
  return parts.join(" ") || d;
};

/** the play glyph, optically centred in its box (the triangle's centroid sits on the centre) */
function Play({ size = 10 }: { size?: number }) {
  return (
    <svg className="rc-play" width={size} height={size} viewBox="0 0 10 10" aria-hidden>
      <path d="M3 1.5v7L8.7 5z" />
    </svg>
  );
}

/** the length, seen in mono and heard as words */
function Length({ id }: { id: string }) {
  return (
    <>
      <span className="rc-time" aria-hidden>{REEL_SRC.dur}</span>
      <span className="visually-hidden" id={id}>{spoken(REEL_SRC.dur)}</span>
    </>
  );
}

/** hover (not touch) and keyboard focus warm the light; the focus given back after a click does not */
const warmth = (tease: Tease) => ({
  onPointerEnter: (e: { pointerType: string }) => { if (e.pointerType !== "touch") tease("btn", 1); },
  onPointerLeave: () => tease("btn", 0),
  onFocus: (e: { currentTarget: HTMLElement }) => { if (e.currentTarget.matches(":focus-visible")) tease("btn", 1); },
  onBlur: () => tease("btn", 0),
});

/* ── A: the lens. A copy of the film behind the glass, ~14 fps, while the hero is on screen; the poster before
   the first frame (and always under reduced motion or save-data, where the film does not run). ── */
function Lens({ reel, live }: { reel: RefObject<HTMLVideoElement | null>; live: boolean }) {
  const cv = useRef<HTMLCanvasElement | null>(null);
  const [on, setOn] = useState(false);
  useEffect(() => {
    const c = cv.current;
    if (!c || !live) return;
    const ctx = c.getContext("2d", { alpha: false });
    if (!ctx) return;
    const sec = c.closest("section") ?? c;
    const STEP = 1000 / 14;
    let raf = 0, vis = true, last = 0, lastT = -1, shown = false;
    const tick = (now: number) => {
      raf = 0;
      if (!vis || document.hidden) return;
      raf = requestAnimationFrame(tick);
      if (now - last < STEP) return;
      last = now;
      const v = reel.current;
      if (!v || v.readyState < 2 || !v.videoWidth || v.currentTime === lastT) return;
      lastT = v.currentTime;
      // the middle of the frame, a little closer than the film itself
      const vw = v.videoWidth, vh = v.videoHeight, s = Math.min(vw, vh) * 0.86;
      try { ctx.drawImage(v, (vw - s) / 2, (vh - s) / 2, s, s, 0, 0, c.width, c.height); } catch { return; }
      if (!shown) { shown = true; setOn(true); }
    };
    const kick = () => { if (!raf && vis && !document.hidden) raf = requestAnimationFrame(tick); };
    const io = new IntersectionObserver((es) => { vis = es[es.length - 1].isIntersecting; kick(); });
    io.observe(sec);
    document.addEventListener("visibilitychange", kick);
    kick();
    return () => { cancelAnimationFrame(raf); io.disconnect(); document.removeEventListener("visibilitychange", kick); };
  }, [reel, live]);
  return (
    <span className={`rc-lens${on ? " is-live" : ""}`} aria-hidden>
      <img src={REEL_SRC.poster} alt="" decoding="async" />
      <canvas ref={cv} width={72} height={72} />
      <Play size={10} />
    </span>
  );
}

/** A and C: the Showreel button under the headline */
export function ReelButton({ variant, btnRef, reel, idle, onOpen, tease }: {
  variant: "a" | "c";
  btnRef: Btn;
  reel: RefObject<HTMLVideoElement | null>;
  idle: boolean;
  onOpen: () => void;
  tease: Tease;
}) {
  const dur = useId();
  return (
    <button ref={btnRef} type="button" className={`rc-pill rc-pill--${variant}`} onClick={onOpen} aria-label="Watch the showreel" aria-describedby={dur} {...warmth(tease)}>
      {variant === "a" ? <Lens reel={reel} live={idle} /> : <span className="rc-orb" aria-hidden><Play size={8} /></span>}
      <span className="rc-pill__l">Showreel</span>
      {variant === "c" && <span className="rc-pill__rule" aria-hidden />}
      <Length id={dur} />
    </button>
  );
}

/* ── B: the label that rides the light. It stands on spot() (hero px), just above the rim on the glass, and follows
   the hot spot (which follows the pointer's x), eased. Desk: its play circle sits over the hottest point and the
   words run on down the rim; phone: centred on the horizon's light. It is lifted to clear the rim along its whole
   width (the rim is found with onGlass). It holds still under the pointer and while focused, so it never slides
   away from a click. Gone while the film is out, back after. ── */
const RIDE = { desk: { gap: 16, at: 20, edge: 28 }, mob: { gap: 18, at: 0.5, edge: 16 } } as const;
export function RideLabel({ ctl, mode, idle, btnRef, onOpen, tease, onNoLight }: {
  ctl: Ctl;
  mode: Mode;
  idle: boolean;
  btnRef: Btn;
  onOpen: () => void;
  tease: Tease;
  /** no light to ride (no WebGL): the caller docks a plain button instead */
  onNoLight: () => void;
}) {
  const box = useRef<HTMLDivElement | null>(null);
  const [ready, setReady] = useState(false);
  const reduced = useReduced();
  const dur = useId();
  const live = useRef({ idle, noLight: onNoLight, kick: () => {}, hover: false, focus: false });
  useEffect(() => {
    live.current.idle = idle;
    live.current.noLight = onNoLight;
    // an inert label gets no pointerleave: whatever held it lets go with the film
    if (idle) live.current.kick(); else { live.current.hover = false; live.current.focus = false; }
  });
  const warm = warmth(tease);
  useEffect(() => {
    const el = box.current;
    const sec = el?.parentElement;
    const btn = el?.firstElementChild as HTMLElement | null;
    if (!el || !sec || !btn) return;
    const P = RIDE[mode];
    const t0 = performance.now();
    let raf = 0, vis = true, last = t0, x = NaN, y = NaN, first = 0, settled = false, snap = false;
    let memo = { sx: NaN, sy: NaN, w: 0, left: 0, bottom: 0 };
    /* the top of the light strip in column X (hero px): where the glass ends, found by bisection near the spot */
    const rimTop = (c: HeroCtl, X: number, Y: number, r: DOMRect, kx: number, ky: number) => {
      const on = (yy: number) => c.onGlass(r.left + X * kx, r.top + yy * ky);
      let lo = Y - 160, hi = Y + 60;
      if (!on(lo) || on(hi)) return null;
      for (let i = 0; i < 10; i++) { const m = (lo + hi) / 2; if (on(m)) lo = m; else hi = m; }
      return lo;
    };
    const place = (c: HeroCtl, sx: number, sy: number) => {
      const w = btn.offsetWidth;
      if (Math.abs(sx - memo.sx) < 0.25 && Math.abs(sy - memo.sy) < 0.25 && w === memo.w) return memo;
      const W = sec.offsetWidth;
      const anchor = P.at < 1 ? w * P.at : P.at;
      const left = Math.max(P.edge, Math.min(W - P.edge - w, sx - anchor));
      const r = sec.getBoundingClientRect();
      const kx = r.width / Math.max(1, W), ky = r.height / Math.max(1, sec.offsetHeight);
      // the highest the rim gets under the label: its ends, and its middle for the phone's dome
      let top = sy - 6;
      for (const X of [left + 2, left + w / 2, left + w - 2]) {
        const t = rimTop(c, Math.max(0, Math.min(W, X)), sy, r, kx, ky);
        if (t != null) top = Math.min(top, t);
      }
      memo = { sx, sy, w, left, bottom: top - P.gap };
      return memo;
    };
    const tick = (now: number) => {
      raf = 0;
      // while the film is out the label has faded where it was; the loop sleeps until the glass is back
      if (!vis || document.hidden || !live.current.idle) return;
      raf = requestAnimationFrame(tick);
      const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
      last = now;
      const c = ctl.current;
      const s = c?.spot() ?? null;
      if (!c || !s) {
        if (!settled && now - t0 > 3000) { settled = true; live.current.noLight(); }
        return;
      }
      if (c.phase() !== "idle" || ((live.current.hover || live.current.focus) && settled && !snap)) return;
      const m = place(c, s.x, s.y);
      if (Number.isNaN(x) || !settled || snap) { x = m.left; y = m.bottom; snap = false; if (!first) first = now; }
      else {
        const k = reduced ? 1 : 1 - Math.pow(1 - 0.22, dt * 60);
        x += (m.left - x) * k;
        y += (m.bottom - y) * k;
      }
      el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
      // it arrives once the light has come up (and the words under the headline have risen)
      if (!settled && now - first > 1300) { settled = true; setReady(true); }
    };
    // back from the film or from off screen: it takes its place unseen, then fades in there
    const kick = () => { if (!raf && vis && !document.hidden && live.current.idle) { last = performance.now(); snap = settled; raf = requestAnimationFrame(tick); } };
    live.current.kick = kick;
    const io = new IntersectionObserver((es) => { vis = es[es.length - 1].isIntersecting; kick(); });
    io.observe(sec);
    document.addEventListener("visibilitychange", kick);
    kick();
    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
      document.removeEventListener("visibilitychange", kick);
      live.current.kick = () => {};
    };
  }, [ctl, mode, reduced]);
  return (
    <div ref={box} className={`rc-ride rc-ride--${mode}${ready ? " is-ready" : ""}${idle ? "" : " is-away"}`} inert={!idle || !ready || undefined}>
      <button
        ref={btnRef}
        type="button"
        className="rc-ride__btn"
        onClick={onOpen}
        aria-label="Play showreel"
        aria-describedby={dur}
        onPointerEnter={(e) => { if (e.pointerType !== "touch") live.current.hover = true; warm.onPointerEnter(e); }}
        onPointerLeave={() => { live.current.hover = false; warm.onPointerLeave(); }}
        onFocus={(e) => { live.current.focus = e.currentTarget.matches(":focus-visible"); warm.onFocus(e); }}
        onBlur={() => { live.current.focus = false; warm.onBlur(); }}
      >
        <span className="rc-orb" aria-hidden><Play size={8} /></span>
        <span className="rc-pill__l">Play showreel</span>
        <Length id={dur} />
      </button>
    </div>
  );
}

/* ── The glass as the play control. Desk: over the glass the pointer becomes a frosted badge (A, C) or a hand (B)
   and the light warms (tease 0.6). Anywhere: a click or a tap on the glass opens the film. ── */
export function GlassPlay({ hero, ctl, mode, variant, phase, tease }: {
  hero: RefObject<HTMLElement | null>;
  ctl: Ctl;
  mode: Mode;
  variant: CtaVariant;
  phase: ReelPhase;
  tease: Tease;
}) {
  const badgeRef = useRef<HTMLDivElement | null>(null);
  const reduced = useReduced();
  const badge = mode === "desk" && variant !== "b";
  const off = useRef<() => void>(() => {});
  useEffect(() => {
    const sec = hero.current;
    if (!sec) return;
    const scroller = sec.closest<HTMLElement>(".st-site__scroll");
    const st = { on: false, cx: NaN, cy: NaN, x: 0, y: 0, tx: 0, ty: 0, raf: 0, last: 0 };
    // client px → hero px (the site may sit scaled in its stage)
    const local = (cx: number, cy: number) => {
      const r = sec.getBoundingClientRect();
      return { x: ((cx - r.left) / r.width) * sec.offsetWidth, y: ((cy - r.top) / r.height) * sec.offsetHeight };
    };
    const paint = () => {
      const el = badgeRef.current;
      if (!el) return;
      el.style.transform = `translate3d(${st.x.toFixed(1)}px, ${st.y.toFixed(1)}px, 0)`;
      // the nearer the hot spot of the rim, the warmer its underside
      const s = ctl.current?.spot();
      const w = s ? Math.exp(-Math.hypot(s.x - st.x, s.y - st.y) / 240) : 0;
      el.style.setProperty("--rc-warm", w.toFixed(3));
    };
    const loop = (now: number) => {
      st.raf = 0;
      const dt = Math.min(0.05, Math.max(0, (now - st.last) / 1000));
      st.last = now;
      const k = reduced ? 1 : 1 - Math.pow(1 - 0.2, dt * 60);
      st.x += (st.tx - st.x) * k;
      st.y += (st.ty - st.y) * k;
      paint();
      if (st.on || Math.abs(st.tx - st.x) + Math.abs(st.ty - st.y) > 0.2) st.raf = requestAnimationFrame(loop);
    };
    const kick = () => { if (badge && !st.raf) { st.last = performance.now(); st.raf = requestAnimationFrame(loop); } };
    const set = (on: boolean) => {
      if (on === st.on) return;
      st.on = on;
      if (on) sec.dataset.glass = badge ? "badge" : "hand";
      else delete sec.dataset.glass;
      tease("glass", on ? 0.6 : 0);
      const el = badgeRef.current;
      if (el) {
        // it appears where the pointer is, it never flies in from where it left
        if (on) { st.x = st.tx; st.y = st.ty; paint(); }
        el.classList.toggle("is-on", on);
        if (!on) el.classList.remove("is-press");
      }
      if (on) kick();
    };
    off.current = () => set(false);
    const test = (target: Element | null) => {
      const c = ctl.current;
      if (!c || Number.isNaN(st.cx) || target?.closest("button, a")) { set(false); return; }
      set(c.onGlass(st.cx, st.cy));
    };
    const onMove = (e: PointerEvent) => {
      if (e.pointerType === "touch") return;
      st.cx = e.clientX; st.cy = e.clientY;
      const p = local(e.clientX, e.clientY);
      st.tx = p.x; st.ty = p.y;
      test(e.target as Element | null);
      if (st.on) kick();
    };
    const onLeave = (e: PointerEvent) => { if (e.pointerType !== "touch") { st.cx = NaN; set(false); } };
    // the page moves under a still pointer: ask again what is under it
    const onScroll = () => {
      if (Number.isNaN(st.cx)) return;
      const t = document.elementFromPoint(st.cx, st.cy);
      if (!t || !sec.contains(t)) { set(false); return; }
      const p = local(st.cx, st.cy);
      st.tx = p.x; st.ty = p.y;
      test(t);
      if (st.on) kick();
    };
    const onDown = (e: PointerEvent) => { if (st.on && e.pointerType !== "touch" && !reduced) badgeRef.current?.classList.add("is-press"); };
    const onUp = () => badgeRef.current?.classList.remove("is-press");
    // straight from the click, so the film may start with sound; the light keeps its warmth into the flare
    const onClick = (e: MouseEvent) => {
      if ((e.target as Element | null)?.closest("button, a")) return;
      // a drag that selected words is not a click on the glass
      if (window.getSelection?.()?.isCollapsed === false) return;
      const c = ctl.current;
      if (!c || c.phase() !== "idle" || !c.onGlass(e.clientX, e.clientY)) return;
      c.open();
      set(false);
    };
    sec.addEventListener("pointermove", onMove);
    sec.addEventListener("pointerleave", onLeave);
    sec.addEventListener("pointerdown", onDown);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    sec.addEventListener("click", onClick);
    scroller?.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(st.raf);
      sec.removeEventListener("pointermove", onMove);
      sec.removeEventListener("pointerleave", onLeave);
      sec.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      sec.removeEventListener("click", onClick);
      scroller?.removeEventListener("scroll", onScroll);
      delete sec.dataset.glass;
      tease("glass", 0);
      off.current = () => {};
    };
  }, [hero, ctl, badge, reduced, tease]);
  // the film takes over: the badge and the hand go at once; the warmth holds through the flare and rests once the
  // film is out (or on its way back, if it was called back before it arrived)
  useEffect(() => {
    if (phase === "idle") return;
    off.current();
    if (phase !== "opening") { tease("glass", 0); tease("btn", 0); }
  }, [phase, tease]);
  if (!badge) return null;
  return (
    <div ref={badgeRef} className="rc-cursor" aria-hidden>
      <div className="rc-cursor__in">
        <Play size={11} />
        <span className="rc-cursor__l">Showreel</span>
        <span className="rc-time">{REEL_SRC.dur}</span>
      </div>
    </div>
  );
}

/* ── DEV only: the variants under comparison. ?cta=a|b|c and ?glass=a|b in the URL, and a small panel that switches
   them without a reload. GLASS sets window.__hlbGlass for the hero shader. Everything below sits behind
   import.meta.env.DEV, so none of it reaches the production build (which renders A). ── */
type Store = { get: () => CtaVariant; sub: (f: () => void) => () => void; set: (v: CtaVariant) => void };
const ctaA = (): CtaVariant => "a";
const store: Store | null = import.meta.env.DEV
  ? (() => {
    const read = (k: string, ok: readonly string[]) => {
      try { const v = new URLSearchParams(window.location.search).get(k)?.toLowerCase() ?? ""; return ok.includes(v) ? v : null; } catch { return null; }
    };
    let cta = (read("cta", VARIANTS) ?? "a") as CtaVariant;
    // before the hero mounts, so the shader sees it from its first frame
    const g = read("glass", ["a", "b"]);
    if (g) (window as Window & { __hlbGlass?: string }).__hlbGlass = g;
    const subs = new Set<() => void>();
    return {
      get: () => cta,
      sub: (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; },
      set: (v: CtaVariant) => { cta = v; subs.forEach((f) => f()); },
    };
  })()
  : null;

/** the variant on screen: A in production */
export const useCtaVariant: () => CtaVariant = import.meta.env.DEV
  ? () => useSyncExternalStore(store!.sub, store!.get, ctaA)
  : ctaA;

export const CtaDevPanel: () => ReactNode = import.meta.env.DEV
  ? function CtaDevPanel() {
    type W = Window & { __hlbGlass?: string };
    const cta = useCtaVariant();
    const [glass, setGlass] = useState(() => (window as W).__hlbGlass ?? "a");
    const url = (k: string, v: string) => {
      try { const u = new URL(window.location.href); u.searchParams.set(k, v); window.history.replaceState(window.history.state, "", u); } catch { /* fine */ }
    };
    const pickCta = (v: CtaVariant) => { url("cta", v); store?.set(v); };
    const pickGlass = (g: string) => {
      (window as W).__hlbGlass = g;
      url("glass", g);
      window.dispatchEvent(new CustomEvent("hlb:glass", { detail: g }));
      setGlass(g);
    };
    const seg = (k: string, list: readonly string[], on: string, pick: (v: string) => void) => (
      <span className="rc-dev__seg" role="group" aria-label={k}>
        <span className="rc-dev__k" aria-hidden>{k}</span>
        {list.map((v) => (
          <button key={v} type="button" aria-pressed={on === v} aria-label={`${k} ${v.toUpperCase()}`} onClick={() => pick(v)}>{v.toUpperCase()}</button>
        ))}
      </span>
    );
    return createPortal(
      <div className="rc-dev" role="group" aria-label="Hero variants, dev only">
        <style>{`
.rc-dev { position: fixed; right: 14px; bottom: 100px; z-index: 2147483000; display: flex; align-items: center; gap: 14px; height: 34px; padding: 0 5px 0 14px;
  border-radius: 999px; font: 400 11px/1 "Geist Mono", ui-monospace, Menlo, monospace; letter-spacing: .08em; color: #8e8c88;
  background: rgba(242, 240, 235, .08); -webkit-backdrop-filter: blur(24px) saturate(1.3); backdrop-filter: blur(24px) saturate(1.3);
  box-shadow: inset 0 1px 0 rgba(157, 176, 194, .4), inset 0 0 0 1px rgba(255, 255, 255, .07), 0 14px 34px -14px rgba(0, 0, 0, .8); }
.rc-dev__seg { display: flex; align-items: center; gap: 2px; }
.rc-dev__k { margin-right: 6px; }
.rc-dev button { width: 24px; height: 24px; border: 0; padding: 0; border-radius: 50%; background: none; color: #b4b2ad; font: inherit; letter-spacing: 0; cursor: pointer;
  transition: background-color 160ms cubic-bezier(.2, .7, .1, 1), color 160ms cubic-bezier(.2, .7, .1, 1); }
.rc-dev button:hover { color: #f2f0eb; background: rgba(242, 240, 235, .1); }
.rc-dev button[aria-pressed="true"] { color: #0b0b0d; background: #f2f0eb; }
.rc-dev button:focus-visible { outline: 1.5px solid #9db0c2; outline-offset: 2px; }`}</style>
        {seg("CTA", VARIANTS, cta, (v) => pickCta(v as CtaVariant))}
        {seg("GLASS", ["a", "b"], glass, pickGlass)}
      </div>,
      document.body,
    );
  }
  : () => null;
