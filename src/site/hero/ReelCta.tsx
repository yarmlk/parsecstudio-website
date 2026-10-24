import { useCallback, useEffect, useId, useRef, type RefObject } from "react";
import { useReduced } from "../ui";
import { REEL_SRC, type HeroCtl, type ReelPhase } from "./reel";
import "./reel-cta.css";

/**
 * The showreel's control. The disc itself plays the film: a click (or a tap) anywhere on its glass opens it.
 *
 * With a mouse, "Play showreel" is the pointer while it is over the glass: a small frosted pill held on the pointer
 * (its play circle where the pointer is), written straight from the pointer event, no easing; it comes up where the
 * pointer enters the glass and fades where it leaves, a short opacity and a breath of scale, nothing that replays. Without hover (touch) the same pill stands still on the light, just above the rim. For the
 * keyboard it is a real button in the hero's tab order, unseen until it is focused, then it shows on the light.
 * With no light at all (no WebGL) a plain button docks under the headline instead (ReelButton).
 */

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

/** the length: not shown on the button (the label says enough), only heard as words */
function Length({ id }: { id: string }) {
  return <span className="visually-hidden" id={id}>{spoken(REEL_SRC.dur)}</span>;
}

/** No light to ride (no WebGL): a plain frost pill under the headline. Hover and keyboard focus warm the light. */
export function ReelButton({ btnRef, onOpen, tease }: { btnRef: Btn; onOpen: () => void; tease: Tease }) {
  const dur = useId();
  return (
    <button
      ref={btnRef}
      type="button"
      className="rc-pill"
      onClick={onOpen}
      aria-label="Play showreel"
      aria-describedby={dur}
      onPointerEnter={(e) => { if (e.pointerType !== "touch") tease("btn", 1); }}
      onPointerLeave={() => tease("btn", 0)}
      onFocus={(e) => { if (e.currentTarget.matches(":focus-visible")) tease("btn", 1); }}
      onBlur={() => tease("btn", 0)}
    >
      <span className="rc-orb" aria-hidden><Play size={8} /></span>
      <span className="rc-pill__l">Play showreel</span>
      <Length id={dur} />
    </button>
  );
}

/** at rest the pill stands on the light: desk, its play circle over the hottest point and the words on down the rim;
    phone, centred on the horizon's light. `gap` above the rim, `edge` from the frame's sides (hero px). */
const REST = { desk: { gap: 16, at: 20, edge: 28 }, mob: { gap: 18, at: 0.5, edge: 16 } } as const;
/** on the pointer: the play circle's centre from the pill's top left, and the pill's margin to the frame (hero px) */
const HOLD = { x: 19, y: 19, edge: 12 } as const;

type Show = "off" | "follow" | "rest";

/**
 * "Play showreel": on the pointer over the glass (mouse), on the light (touch, keyboard focus). Also owns the glass as
 * the play control: the pointer's cursor over it, its warmth, the click anywhere on it.
 */
export function ReelCursor({ hero, ctl, mode, phase, btnRef, docked, onOpen, tease, onNoLight }: {
  hero: RefObject<HTMLElement | null>;
  ctl: Ctl;
  mode: Mode;
  phase: ReelPhase;
  btnRef: Btn;
  /** no light: the pill stays away (the docked button stands in for it); the glass still opens the film */
  docked: boolean;
  onOpen: () => void;
  tease: Tease;
  onNoLight: () => void;
}) {
  const box = useRef<HTMLDivElement | null>(null);
  const reduced = useReduced();
  const dur = useId();
  const idle = phase === "idle";
  const live = useRef({ idle, docked, noLight: onNoLight, update: () => {} });
  useEffect(() => {
    live.current.idle = idle;
    live.current.docked = docked;
    live.current.noLight = onNoLight;
    live.current.update();
  });

  useEffect(() => {
    const el = box.current;
    const sec = hero.current;
    const btn = el?.firstElementChild as HTMLButtonElement | null;
    if (!el || !sec || !btn) return;
    const scroller = sec.closest<HTMLElement>(".st-site__scroll");
    const mq = window.matchMedia?.("(hover: hover) and (pointer: fine)");
    const P = REST[mode];
    const t0 = performance.now();
    const st = {
      show: "off" as Show, canHover: !!mq?.matches,
      /** the pointer (client px; NaN off the hero) and whether it is on the glass */
      cx: NaN, cy: NaN, on: false, over: null as Element | null,
      /** focused from the keyboard (Tab), and whether the focus given back after the film may show it (the film was
          opened from the keyboard) */
      focus: false, kbd: false, back: false,
      /** the last update saw the glass idle (no film) */
      wasIdle: true,
      /** the light: found (ready), or given up on */
      ready: false, lightAt: 0, gaveUp: false,
      x: 0, y: 0, snap: true, raf: 0, last: t0, vis: true,
    };
    let memo = { sx: NaN, sy: NaN, w: 0, left: 0, top: 0 };

    // client px → hero px (the site may sit scaled in its stage)
    const local = (cx: number, cy: number) => {
      const r = sec.getBoundingClientRect();
      return { x: ((cx - r.left) / r.width) * sec.offsetWidth, y: ((cy - r.top) / r.height) * sec.offsetHeight, r };
    };
    /* the top of the light strip in column X (hero px): where the glass ends, found by bisection near the spot */
    const rimTop = (c: HeroCtl, X: number, Y: number, r: DOMRect, kx: number, ky: number) => {
      const on = (yy: number) => c.onGlass(r.left + X * kx, r.top + yy * ky);
      let lo = Y - 160, hi = Y + 60;
      if (!on(lo) || on(hi)) return null;
      for (let i = 0; i < 10; i++) { const m = (lo + hi) / 2; if (on(m)) lo = m; else hi = m; }
      return lo;
    };
    /* at rest: on the light, lifted to clear the rim along its whole width (its ends, and its middle for the dome) */
    const restAt = (c: HeroCtl) => {
      const s = c.spot();
      if (!s) return null;
      const w = btn.offsetWidth, h = btn.offsetHeight;
      if (Math.abs(s.x - memo.sx) < 0.25 && Math.abs(s.y - memo.sy) < 0.25 && w === memo.w) return memo;
      const W = sec.offsetWidth;
      const anchor = P.at < 1 ? w * P.at : P.at;
      const left = Math.max(P.edge, Math.min(W - P.edge - w, s.x - anchor));
      const r = sec.getBoundingClientRect();
      const kx = r.width / Math.max(1, W), ky = r.height / Math.max(1, sec.offsetHeight);
      let top = s.y - 6;
      for (const X of [left + 2, left + w / 2, left + w - 2]) {
        const t = rimTop(c, Math.max(0, Math.min(W, X)), s.y, r, kx, ky);
        if (t != null) top = Math.min(top, t);
      }
      // the phone: a plain button on the black under the disc (nothing to hover there, so it sits clear of the film);
      // the desk keeps it on the light, just above the rim
      memo = { sx: s.x, sy: s.y, w, left, top: mode === "mob" ? s.y + P.gap * 2 : top - P.gap - h };
      return memo;
    };
    /* on the pointer: the play circle where the pointer is, the pill kept inside the frame */
    const followAt = () => {
      const { x, y } = local(st.cx, st.cy);
      const w = btn.offsetWidth, h = btn.offsetHeight;
      return {
        left: Math.max(HOLD.edge, Math.min(sec.offsetWidth - HOLD.edge - w, x - HOLD.x)),
        top: Math.max(HOLD.edge, Math.min(sec.offsetHeight - HOLD.edge - h, y - HOLD.y)),
      };
    };

    const paint = () => { el.style.transform = `translate3d(${st.x.toFixed(1)}px, ${st.y.toFixed(1)}px, 0)`; };
    /* on the pointer it is the pointer: placed in the same frame as the event, never eased */
    const follow = () => {
      const to = followAt();
      st.x = to.left; st.y = to.top; st.snap = false;
      paint();
    };
    const loop = (now: number) => {
      st.raf = 0;
      const dt = Math.min(0.05, Math.max(0, (now - st.last) / 1000));
      st.last = now;
      const c = ctl.current;
      // the light: once it is there and has come up, the pill can stand on it; no light for 3 s, a button docks
      if (!st.ready && c?.spot()) { if (!st.lightAt) st.lightAt = now; else if (now - st.lightAt > 1300) { st.ready = true; update(); } }
      if (!st.ready && !st.gaveUp && !c?.spot() && now - t0 > 3000) { st.gaveUp = true; live.current.noLight(); }
      let to: { left: number; top: number } | null = null;
      // on the pointer: the glass under a still pointer can change (the camera eases), so ask again each frame
      if (st.show === "follow") test();
      else if (c && (st.show === "rest" || (!st.canHover && !st.ready))) to = restAt(c);
      if (to) {
        // at rest it rides the light, which eases on its own
        if (st.snap || reduced) { st.x = to.left; st.y = to.top; st.snap = false; }
        else {
          const k = 1 - Math.pow(1 - 0.22, dt * 60);
          st.x += (to.left - st.x) * k;
          st.y += (to.top - st.y) * k;
        }
        paint();
      }
      // it rides on while it is shown (the light moves with the scroll on the phone), sleeps once it is gone
      const moving = to != null && (Math.abs(to.left - st.x) + Math.abs(to.top - st.y) > 0.2);
      if (!st.raf && st.vis && !document.hidden && live.current.idle && (st.show !== "off" || !st.ready || moving)) st.raf = requestAnimationFrame(loop);
    };
    const kick = () => { if (!st.raf && st.vis && !document.hidden) { st.last = performance.now(); st.raf = requestAnimationFrame(loop); } };

    /* what the pill is now: on the pointer, on the light, or away */
    const update = () => {
      const L = live.current;
      const ph = ctl.current?.phase() ?? "idle";
      const idleNow = L.idle && ph === "idle";
      if (st.wasIdle && !idleNow) {
        // the film takes over: whatever the pill was doing is over. It comes back only once the pointer is on the
        // glass again; the focus given back when the film closes shows it only if the film was opened from the keyboard
        st.on = false; st.cx = NaN; st.over = null; st.focus = false;
      }
      st.wasIdle = idleNow;
      let next: Show = "off";
      if (idleNow && !L.docked && st.vis && !document.hidden) {
        if (st.canHover && st.on) next = "follow";
        else if ((!st.canHover && st.ready) || st.focus) next = "rest";
      }
      if (next === st.show) return;
      const prev = st.show;
      st.show = next;
      // it comes up where it is going to be, it never flies in from where it was last seen
      if (next === "follow") follow();
      else if (prev === "off") st.snap = true;
      el.dataset.show = next;
      if (next === "follow") sec.dataset.glass = "follow"; else delete sec.dataset.glass;
      tease("glass", next === "follow" ? 0.6 : 0);
      if (next !== "follow") el.classList.remove("is-press");
      kick();
    };
    live.current.update = update;

    /* is the pointer on the glass (and not on a control)? On it, the pill is placed at once */
    const test = () => {
      const c = ctl.current;
      st.on = !!c && !Number.isNaN(st.cx) && !st.over?.closest("button, a") && c.onGlass(st.cx, st.cy);
      if (st.on && st.show === "follow") follow();
      update();
    };
    const onMove = (e: PointerEvent) => {
      if (e.pointerType === "touch") return;
      st.cx = e.clientX; st.cy = e.clientY; st.over = e.target as Element | null;
      test();
    };
    const onLeave = (e: PointerEvent) => { if (e.pointerType !== "touch") { st.cx = NaN; st.over = null; st.on = false; update(); } };
    // the page moves under a still pointer: ask again what is under it, and keep the pill on it
    const onScroll = () => {
      if (Number.isNaN(st.cx)) { kick(); return; }
      const t = document.elementFromPoint(st.cx, st.cy);
      st.over = t;
      if (!t || !sec.contains(t)) st.on = false;
      else { test(); return; }
      update();
    };
    const onDown = (e: PointerEvent) => { if (st.show === "follow" && e.pointerType !== "touch" && !reduced) el.classList.add("is-press"); };
    const onUp = () => el.classList.remove("is-press");
    // straight from the click, so the film may start with sound; the light keeps its warmth into the flare
    const onClick = (e: MouseEvent) => {
      if ((e.target as Element | null)?.closest("button, a")) return;
      // a drag that selected words is not a click on the glass
      if (window.getSelection?.()?.isCollapsed === false) return;
      const c = ctl.current;
      if (!c || c.phase() !== "idle" || !c.onGlass(e.clientX, e.clientY)) return;
      c.open();
    };
    // keyboard focus brings it onto the light, and warms the light: focus that came with Tab, or given back after a
    // film that was opened from the keyboard. Not the focus given back after a film opened with the pointer, which the
    // browser may still mark :focus-visible (Escape is a key): that left the pill standing on the rim.
    const onKey = (e: KeyboardEvent) => { st.kbd = e.key === "Tab"; };
    const onAnyDown = () => { st.kbd = false; st.back = false; };
    const onBtnClick = () => { st.back = st.focus; };
    const onFocusIn = () => {
      st.focus = btn.matches(":focus-visible") && (st.kbd || st.back);
      st.back = false;
      if (st.focus) tease("btn", 1);
      update();
    };
    const onFocusOut = () => { st.focus = false; tease("btn", 0); update(); };
    const onHoverChange = () => { st.canHover = !!mq?.matches; update(); };
    // the hero out of view, or the page hidden: the pill goes, and waits for the pointer to come back
    const io = new IntersectionObserver((es) => {
      st.vis = es[es.length - 1].isIntersecting;
      if (!st.vis) st.on = false;
      update();
      kick();
    });
    const onVis = () => {
      if (document.hidden) { st.on = false; st.cx = NaN; st.over = null; }
      update();
      kick();
    };

    el.dataset.show = "off";
    sec.addEventListener("pointermove", onMove);
    sec.addEventListener("pointerleave", onLeave);
    sec.addEventListener("pointerdown", onDown);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    sec.addEventListener("click", onClick);
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("pointerdown", onAnyDown, true);
    btn.addEventListener("click", onBtnClick);
    btn.addEventListener("focus", onFocusIn);
    btn.addEventListener("blur", onFocusOut);
    mq?.addEventListener?.("change", onHoverChange);
    scroller?.addEventListener("scroll", onScroll, { passive: true });
    document.addEventListener("visibilitychange", onVis);
    io.observe(sec);
    kick();
    return () => {
      cancelAnimationFrame(st.raf);
      sec.removeEventListener("pointermove", onMove);
      sec.removeEventListener("pointerleave", onLeave);
      sec.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      sec.removeEventListener("click", onClick);
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("pointerdown", onAnyDown, true);
      btn.removeEventListener("click", onBtnClick);
      btn.removeEventListener("focus", onFocusIn);
      btn.removeEventListener("blur", onFocusOut);
      mq?.removeEventListener?.("change", onHoverChange);
      scroller?.removeEventListener("scroll", onScroll);
      document.removeEventListener("visibilitychange", onVis);
      io.disconnect();
      delete sec.dataset.glass;
      tease("glass", 0);
      live.current.update = () => {};
    };
  }, [hero, ctl, mode, reduced, tease]);

  // the film takes over: the pill goes at once; the warmth holds through the flare and rests once the film is out
  // (or on its way back, if it was called back before it arrived)
  useEffect(() => {
    if (phase === "idle") return;
    if (phase !== "opening") { tease("glass", 0); tease("btn", 0); }
  }, [phase, tease]);

  return (
    <div ref={box} className={`rc-ride rc-ride--${mode}`} inert={!idle || docked || undefined} aria-hidden={docked || undefined}>
      <button
        ref={docked ? undefined : btnRef}
        type="button"
        className="rc-ride__btn"
        onClick={onOpen}
        aria-label="Play showreel"
        aria-describedby={dur}
        tabIndex={docked ? -1 : undefined}
      >
        <span className="rc-orb" aria-hidden><Play size={8} /></span>
        <span className="rc-pill__l">Play showreel</span>
        <Length id={dur} />
      </button>
    </div>
  );
}
