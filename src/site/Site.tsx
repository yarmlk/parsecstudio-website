import { useCallback, useEffect, useLayoutEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { CLIENT_LOGOS, LOGO, OPEN, REEL } from "../lib/assets";
import { easeMove } from "../lib/ease";
import { CONTACT, REVIEWS } from "../lib/facts";
import { AiFlux } from "../ui/AiFlux";
import { CutProgress } from "../ui/Cut";
import { Icon } from "../ui/Icons";
import { CASES, CaseView, LoopVideo, PlayerBar, SITE_SERVICES, ServiceView, type Case, type Rect } from "./cases";
import { CutLine, useCutTrack, useReduced } from "./ui";
import { SvcStage } from "./svc/SvcStage";
import { HeroLightB } from "./hero/HeroLightB";
import { REEL_SRC, fullscreen, useReelPlayer, type HeroCtl, type ReelPhase } from "./hero/reel";
import { CtaDevPanel, GlassPlay, ReelButton, RideLabel, useCtaVariant, useTease } from "./hero/ReelCta";

/* parsec.studio, rebuilt in the FINAL look. Client-facing, so the site is English in both book languages.
   Structure, lines and rhythm follow the live site (Services · Cases · Clients · Reviews · Contact): one screen
   per section, a short rule over a big title, the ghost word behind it, the section number on the right. */

export type SiteMode = "desk" | "mob";
export type SecId = "hero" | "services" | "cases" | "clients" | "reviews" | "contact";

export const SECTIONS: { id: Exclude<SecId, "hero">; label: string }[] = [
  { id: "services", label: "Services" },
  { id: "cases", label: "Cases" },
  { id: "clients", label: "Clients" },
  { id: "reviews", label: "Reviews" },
  { id: "contact", label: "Contact" },
];
const navIndex = (id: SecId) => SECTIONS.findIndex((s) => s.id === id);
/** offsetTop of an element inside the scroller (sums the offsetParent chain). */
const topIn = (el: HTMLElement, root: HTMLElement) => {
  let y = 0;
  let n: HTMLElement | null = el;
  while (n && n !== root) { y += n.offsetTop; n = n.offsetParent as HTMLElement | null; }
  return y;
};

/** Client order of the live site (3 rows of 4). Logo width at deck scale (from the studio deck's client slide:
 *  equal visual area, heavy marks a little smaller); the site scales it with --k. */
const LOGO_ORDER = ["google", "microsoft", "subaru", "tefal", "porsche", "karcher", "rowenta", "kinder", "fifa", "henkel", "unilever", "nasa"];
const LOGO_W: Record<string, number> = {
  google: 193, tefal: 226, fifa: 178, nasa: 200, microsoft: 242, kinder: 197,
  karcher: 208, rowenta: 262, henkel: 242, subaru: 253, unilever: 243, porsche: 310,
};
const LOGOS = LOGO_ORDER.map((id) => CLIENT_LOGOS.find((c) => c.id === id)).filter((c): c is (typeof CLIENT_LOGOS)[number] => !!c);
/** the hero rail: six marks, one line */
const HERO_LOGOS = ["google", "microsoft", "fifa", "nasa", "tefal", "henkel"].map((id) => LOGOS.find((l) => l.id === id)!).filter(Boolean);

/* ── Navigation ───────────────────────────────────────────── */
function Nav({ mode, active, onGo, onMenu, solid, away }: { mode: SiteMode; active: number; onGo: (id: SecId) => void; onMenu: () => void; solid: boolean; away?: boolean }) {
  const [hover, setHover] = useState<number | null>(null);
  const { ref, pos, ready, hidden } = useCutTrack(hover ?? active, [mode]);
  return (
    <header className={`st-nav${solid ? " is-solid" : ""}${away ? " is-away" : ""}`} inert={away || undefined}>
      <button type="button" className="st-nav__brand" onClick={() => onGo("hero")} aria-label="parsec studio, back to top">
        <img src={LOGO.lockupWhite} alt="parsec studio" />
      </button>
      {mode === "desk" ? (
        <div className="st-nav__right">
          <nav ref={ref} className="st-nav__menu" aria-label="Site" onPointerLeave={() => setHover(null)}>
            {SECTIONS.map((n, i) => (
              <button
                key={n.id}
                type="button"
                className={`st-nav__item${i === active ? " is-on" : ""}`}
                aria-current={i === active ? "true" : undefined}
                onPointerEnter={() => setHover(i)}
                onFocus={() => setHover(i)}
                onBlur={() => setHover(null)}
                onClick={() => onGo(n.id)}
              >
                <span data-cut-t="">{n.label}</span>
              </button>
            ))}
            <CutLine pos={pos} ready={ready} hidden={hidden} gap={5} bend={2.2} />
          </nav>
          <button type="button" className="st-pill st-pill--paper st-nav__talk" onClick={() => onGo("contact")}>Let’s talk</button>
        </div>
      ) : (
        <button type="button" className="st-round st-round--sm" onClick={onMenu} aria-label="Open the menu"><Icon name="menu" size={17} /></button>
      )}
    </header>
  );
}

function MobileMenu({ active, onGo, onClose }: { active: number; onGo: (id: SecId) => void; onClose: () => void }) {
  const { ref, pos, ready, hidden } = useCutTrack(active);
  const close = useRef<HTMLButtonElement | null>(null);
  useEffect(() => { close.current?.focus({ preventScroll: true }); }, []);
  return (
    <div className="st-menu" role="dialog" aria-label="Menu" onKeyDown={(e) => { if (e.key === "Escape") { e.stopPropagation(); onClose(); } }}>
      <div className="st-menu__top">
        <img src={LOGO.lockupWhite} alt="parsec studio" className="st-menu__logo" />
        <button ref={close} type="button" className="st-round st-round--sm" onClick={onClose} aria-label="Close the menu"><Icon name="close" size={17} /></button>
      </div>
      <nav ref={ref} className="st-menu__list" aria-label="Site">
        {SECTIONS.map((n, i) => (
          <button key={n.id} type="button" className={`st-menu__item${i === active ? " is-on" : ""}`} onClick={() => onGo(n.id)}>
            <span data-cut-t="">{n.label}</span>
          </button>
        ))}
        <CutLine pos={pos} ready={ready} hidden={hidden} gap={4} bend={3} />
      </nav>
      <div className="st-menu__foot">
        <button type="button" className="st-pill st-pill--paper" onClick={() => onGo("contact")}>Let’s talk</button>
        <a className="st-menu__mail" href={`mailto:${CONTACT.email}`}>{CONTACT.email}</a>
      </div>
    </div>
  );
}

/* ── Section head, as on the live site: a short rule over a big title, the quiet giant word behind,
   the section number with its short line on the right ── */
function Head({ label, title, children }: { label: string; title: string; children?: ReactNode }) {
  return (
    <div className="st-head">
      <div className="st-head__t">
        <span className="st-head__rule" aria-hidden />
        <h2 className="st-h2">{title}</h2>
        <span className="st-lbl">{label}</span>
      </div>
      {children && <div className="st-head__r">{children}</div>}
    </div>
  );
}

/* ── Contact form (a mock: nothing is sent) ────────────────── */
function ContactForm() {
  const [sent, setSent] = useState<string | null>(null);
  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setSent(String(f.get("name") || "").trim().split(" ")[0] || "there");
  };
  if (sent) {
    return (
      <div className="st-form st-form--sent" aria-live="polite">
        <span className="spark" aria-hidden />
        <p className="st-form__thanks">Thank you, {sent}.</p>
        <p className="st-form__note">We reply from {CONTACT.email}.</p>
        <span className="st-lbl st-form__mock">Preview · nothing was sent</span>
        <button type="button" className="st-pill st-pill--sm" onClick={() => setSent(null)}>New message</button>
      </div>
    );
  }
  return (
    <form className="st-form" onSubmit={onSubmit}>
      <label className="st-field"><span className="st-field__l">Name</span><input name="name" required autoComplete="off" placeholder="Your name" /></label>
      <label className="st-field"><span className="st-field__l">Email</span><input name="email" type="email" required autoComplete="off" placeholder="you@company.com" /></label>
      <label className="st-field st-field--area"><span className="st-field__l">Message</span><textarea name="msg" rows={4} placeholder="The film, the timing, the budget" /></label>
      <div className="st-form__row">
        <button type="submit" className="st-pill st-pill--paper">Send<Icon name="arrow-right" size={15} /></button>
      </div>
    </form>
  );
}

/**
 * The site. `jump` scrolls to a section (from the book's rail); `onSection` reports the section in view.
 * `startCase` opens a case right away (the second phone).
 */
export function Site({
  mode, jump, onSection, startCase,
}: { mode: SiteMode; jump?: { id: SecId; n: number }; onSection?: (id: SecId) => void; startCase?: number }) {
  const desk = mode === "desk";
  const reduced = useReduced();
  const root = useRef<HTMLDivElement | null>(null);
  const scroller = useRef<HTMLDivElement | null>(null);
  const row = useRef<HTMLDivElement | null>(null);
  const reviewsRef = useRef<HTMLDivElement | null>(null);
  const [sec, setSec] = useState<SecId>("hero");
  const [scrolled, setScrolled] = useState(false);
  const [navOn, setNavOn] = useState(-1);
  const [svc, setSvc] = useState(-1);
  const [svcHover, setSvcHover] = useState<number | null>(null);
  const [svOpen, setSvOpen] = useState<number | null>(null);
  const [menu, setMenu] = useState(false);
  /* the showreel behind the disc: HeroLightB runs the light and the film, the site around it reacts to the phase */
  const heroRef = useRef<HTMLElement | null>(null);
  const heroCtl = useRef<HeroCtl | null>(null);
  const reelRef = useRef<HTMLVideoElement | null>(null);
  const reelBtn = useRef<HTMLButtonElement | null>(null);
  const reelClose = useRef<HTMLButtonElement | null>(null);
  const refocus = useRef(false);
  const [reelPh, setReelPh] = useState<ReelPhase>("idle");
  const [reelIdle, setReelIdle] = useState(false);
  const idleT = useRef<number | undefined>(undefined);
  const reelPl = useReelPlayer(reelRef, reelPh === "open" || reelPh === "opening");
  /* the showreel's controls (hero/ReelCta): the glass itself plays the film; the button is A, B or C (DEV compares) */
  const cta = useCtaVariant();
  const tease = useTease(heroCtl);
  const [rideDock, setRideDock] = useState(false);
  const openReel = useCallback(() => heroCtl.current?.open(), []);
  /** focus goes back to the Showreel control once it is interactive again (it leaves `inert` with the idle render) */
  const focusReelBtn = useCallback(() => {
    let n = 0;
    const go = () => {
      const b = reelBtn.current;
      b?.focus({ preventScroll: true });
      if ((!b || document.activeElement !== b) && ++n < 10) requestAnimationFrame(go);
    };
    requestAnimationFrame(go);
  }, []);
  const onReelPhase = useCallback((p: ReelPhase) => {
    setReelPh(p);
    if (p === "open") requestAnimationFrame(() => reelClose.current?.focus({ preventScroll: true }));
    if (p === "idle" && refocus.current) {
      refocus.current = false;
      focusReelBtn();
    }
  }, [focusReelBtn]);
  const closeReel = useCallback(() => { refocus.current = true; heroCtl.current?.close(); }, []);
  /* the bar and the close step aside while the film plays and nothing moves */
  const wake = useCallback(() => {
    setReelIdle(false);
    window.clearTimeout(idleT.current);
    idleT.current = window.setTimeout(() => setReelIdle(true), 2600);
  }, []);
  useEffect(() => { if (reelPh === "open") wake(); return () => window.clearTimeout(idleT.current); }, [reelPh, wake]);
  useEffect(() => {
    if (reelPh === "idle") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); closeReel(); return; }
      if (reelPh !== "open") return;
      const t = e.target as HTMLElement | null;
      if (e.key === " " && !(t instanceof HTMLButtonElement)) { e.preventDefault(); reelPl.toggle(); }
      else if (e.key === "m" || e.key === "M") reelPl.mute();
      else if (e.key === "f" || e.key === "F") fullscreen(reelRef.current);
      wake();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [reelPh, reelPl, closeReel, wake]);
  const [open, setOpen] = useState<{ list: Case[]; i: number; from: Rect | null; src: "row" | "sv" } | null>(
    startCase != null ? { list: CASES, i: startCase, from: null, src: "row" } : null,
  );
  const [rowHover, setRowHover] = useState<number | null>(null);
  const [rev, setRev] = useState(0);
  const lock = useRef(0);

  /* site-local rect of an element (the site may be scaled inside a frame) */
  const local = useCallback((el: Element): Rect => {
    const s = root.current!;
    const sr = s.getBoundingClientRect();
    const k = sr.width / s.offsetWidth || 1;
    const r = el.getBoundingClientRect();
    return { x: (r.left - sr.left) / k, y: (r.top - sr.top) / k, w: r.width / k, h: r.height / k };
  }, []);

  const goTo = useCallback((id: SecId) => {
    const sc = scroller.current;
    const el = sc?.querySelector<HTMLElement>(`[data-sec="${id}"]`);
    if (!sc || !el) return;
    setNavOn(navIndex(id));
    lock.current = performance.now() + 900;
    const top = id === "hero" ? 0 : Math.min(el.offsetTop, sc.scrollHeight - sc.clientHeight);
    sc.scrollTo({ top, behavior: reduced ? "auto" : "smooth" });
    setMenu(false);
    setSvOpen(null);
  }, [reduced]);
  const closeSv = () => {
    const i = svOpen;
    setSvOpen(null);
    if (i != null) requestAnimationFrame(() => scroller.current?.querySelectorAll<HTMLElement>(".st-svc__item")[i]?.focus({ preventScroll: true }));
  };

  // scroll spy + progressive reveal of the services list
  useEffect(() => {
    const sc = scroller.current;
    if (!sc) return;
    const on = () => {
      const y = sc.scrollTop;
      setScrolled(y > 24);
      const ph = heroCtl.current?.phase();
      if ((ph === "open" || ph === "opening") && y > sc.clientHeight * 0.3) heroCtl.current?.close();
      const secs = Array.from(sc.querySelectorAll<HTMLElement>("[data-sec]"));
      let cur = "hero" as SecId;
      for (const s of secs) if (s.offsetTop - sc.clientHeight * 0.45 <= y) cur = s.dataset.sec as SecId;
      if (y + sc.clientHeight >= sc.scrollHeight - 2) cur = "contact";
      setSec(cur);
      if (performance.now() > lock.current) setNavOn(navIndex(cur));
      const focal = y + sc.clientHeight * 0.56;
      const items = Array.from(sc.querySelectorAll<HTMLElement>("[data-svc]"));
      let a = -1;
      items.forEach((it, i) => { if (topIn(it, sc) + it.offsetHeight / 2 <= focal) a = i; });
      setSvc(a);
    };
    on();
    sc.addEventListener("scroll", on, { passive: true });
    return () => sc.removeEventListener("scroll", on);
  }, []);
  useEffect(() => { onSection?.(sec); }, [sec, onSection]);
  useEffect(() => { if (jump) goTo(jump.id); }, [jump, goTo]);

  // second phone: start on the cases, with one open
  useLayoutEffect(() => {
    if (startCase == null) return;
    const sc = scroller.current;
    const el = sc?.querySelector<HTMLElement>(`[data-sec="cases"]`);
    if (sc && el) sc.scrollTop = el.offsetTop;
  }, [startCase]);

  /* cases row */
  const [rowAt, setRowAt] = useState(0);
  const rowAnim = useRef(0);
  /** one card's step (the narrowest: the card under the pointer opens wider) */
  const step = () => {
    const cards = row.current?.querySelectorAll<HTMLElement>(".st-card");
    if (!cards?.length) return 300;
    return Math.min(cards[0].offsetWidth, cards[1]?.offsetWidth ?? Infinity);
  };
  const onRow = () => { const r = row.current; if (r) setRowAt(Math.round(r.scrollLeft / step())); };
  /* the arrows turn the whole row: as many cards as are in view (four on desk), with our move */
  const rowGo = (d: number) => {
    const r = row.current;
    if (!r) return;
    const s = step();
    const per = desk ? Math.max(1, Math.floor((r.clientWidth - 72) / s)) : 1;
    const max = r.scrollWidth - r.clientWidth;
    const from = r.scrollLeft;
    // to the next page boundary (0, 4, 8 … the end), so back from the end returns to the same pages
    const cur = from / s;
    const page = d > 0 ? Math.floor(cur / per + 0.01) + 1 : Math.ceil(cur / per - 0.01) - 1;
    const to = Math.max(0, Math.min(max, page * per * s));
    cancelAnimationFrame(rowAnim.current);
    if (reduced || Math.abs(to - from) < 1) { r.style.scrollSnapType = ""; r.scrollLeft = to; return; }
    // snapping would fight the tween: off while it runs, back on at a snapped stop
    r.style.scrollSnapType = "none";
    const t0 = performance.now(), dur = 640 + Math.min(1, Math.abs(to - from) / 1400) * 380;
    const tick = (now: number) => {
      const k = Math.min(1, (now - t0) / dur);
      r.scrollLeft = from + (to - from) * easeMove(k);
      if (k < 1) rowAnim.current = requestAnimationFrame(tick);
      else { rowAnim.current = 0; r.style.scrollSnapType = ""; }
    };
    rowAnim.current = requestAnimationFrame(tick);
  };
  useEffect(() => () => cancelAnimationFrame(rowAnim.current), []);
  const rowMax = Math.max(1, CASES.length - (desk ? 4 : 1));
  /* the case grows out of the card's frame and shrinks back into it */
  const frameOf = (card: Element) => card.querySelector(".st-card__img") ?? card;
  const openCase = (i: number, el: HTMLElement) => setOpen({ list: CASES, i, from: local(frameOf(el)), src: "row" });
  const openWork = (list: Case[], i: number, el: HTMLElement) => setOpen({ list, i, from: local(el.querySelector(".st-wk__img") ?? el), src: "sv" });
  /** where a work sits inside the open service view (scrolled into view first) */
  const workRect = (id: string): Rect | null => {
    const sv = root.current?.querySelector<HTMLElement>(".st-sv__scroll");
    const tile = sv?.querySelector<HTMLElement>(`[data-work="${id}"]`);
    if (!sv || !tile) return null;
    const top = topIn(tile, sv);
    if (top < sv.scrollTop + 90 || top + tile.offsetHeight > sv.scrollTop + sv.clientHeight) sv.scrollTop = Math.max(0, top - 120);
    return local(tile.querySelector(".st-wk__img") ?? tile);
  };
  const rectOf = (i: number): Rect | null => {
    if (open?.src === "sv") return workRect(open.list[i].id);
    const r = row.current;
    const card = r?.querySelectorAll<HTMLElement>(".st-card")[i];
    const s = root.current;
    if (!r || !card || !s) return null;
    const pad = desk ? 72 : 20;
    if (card.offsetLeft - pad < r.scrollLeft || card.offsetLeft + card.offsetWidth > r.scrollLeft + r.clientWidth) {
      r.scrollLeft = Math.max(0, card.offsetLeft - pad);
    }
    const rect = local(frameOf(card));
    if (rect.y + rect.h < 0 || rect.y > s.offsetHeight) return null;
    return rect;
  };
  const closeCase = () => {
    const o = open;
    setOpen(null);
    if (!o) return;
    requestAnimationFrame(() => {
      const el = o.src === "sv"
        ? root.current?.querySelector<HTMLElement>(`.st-sv [data-work="${o.list[o.i].id}"]`)
        : row.current?.querySelectorAll<HTMLElement>(".st-card")[o.i];
      el?.focus({ preventScroll: true });
    });
  };

  /* reviews: one line cut in four; the light runs along the current piece for 8 s, then the next review comes.
     Pauses on hover and focus. */
  const [pause, setPause] = useState(false);
  const revW = desk ? 640 : 330;
  const revMax = desk ? REVIEWS.length - 2 : REVIEWS.length - 1;
  const revShift = Math.min(rev, revMax) * revW;

  const svcOn = svcHover ?? Math.max(0, svc);

  return (
    <div ref={root} className={`st-site st-site--${mode}`}>
      <div className="st-site__scroll" ref={scroller}>
        {/* 01 hero */}
        <section ref={heroRef} data-sec="hero" className={`st-hero${reelPh !== "idle" ? " is-reeling" : ""}${reelPh === "open" ? " is-watching" : ""}`}>
          <HeroLightB mode={mode} ctl={heroCtl} reelRef={reelRef} onPhase={onReelPhase} />
          <div className="st-hero__shade" aria-hidden />
          <div className="st-hero__in" inert={reelPh !== "idle" || undefined}>
            <h1 className="st-hero__h" data-rim="">Director-led<br />video production.</h1>
            <div className="st-hero__acts" data-rim="">
              <button type="button" className="st-pill st-pill--paper st-pill--lg" onClick={() => goTo("cases")}>Selected works</button>
              {(cta !== "b" || rideDock) && (
                <ReelButton variant={cta === "b" ? "c" : cta} btnRef={reelBtn} reel={reelRef} idle={reelPh === "idle"} onOpen={openReel} tease={tease} />
              )}
            </div>
          </div>
          {cta === "b" && !rideDock && (
            <RideLabel ctl={heroCtl} mode={mode} idle={reelPh === "idle"} btnRef={reelBtn} onOpen={openReel} tease={tease} onNoLight={() => setRideDock(true)} />
          )}
          <GlassPlay hero={heroRef} ctl={heroCtl} mode={mode} variant={cta} phase={reelPh} tease={tease} />
          {desk && (
            <div className="st-hero__rail" data-rim="" inert={reelPh !== "idle" || undefined}>
              <span className="st-hero__proof">Full-cycle video production<i aria-hidden /> 500+ projects for 100+ brands</span>
              <ul className="st-hero__logos" aria-label="Clients">
                {HERO_LOGOS.map((l) => <li key={l.id}><img src={l.file} alt={l.name} style={{ ["--w" as string]: LOGO_W[l.id] ?? 220 }} /></li>)}
              </ul>
            </div>
          )}
          {reelPh !== "idle" && (
            <div
              className={`st-watch${reelPh === "open" ? " is-on" : ""}${reelIdle && reelPl.playing ? " is-idle" : ""}`}
              role="group"
              aria-label="Showreel"
              onPointerMove={wake}
              onPointerDown={wake}
            >
              <button type="button" className="st-watch__hit" tabIndex={-1} aria-hidden onClick={reelPl.toggle} />
              <button ref={reelClose} type="button" className="st-round st-watch__close" onClick={closeReel} aria-label="Close the showreel"><Icon name="close" size={17} /></button>
              <PlayerBar pl={reelPl} dur={REEL_SRC.dur} className="st-watch__bar">
                <button type="button" className="st-round" onClick={() => fullscreen(reelRef.current)} aria-label="Full screen"><Icon name="expand" size={16} /></button>
              </PlayerBar>
            </div>
          )}
        </section>

        {/* 02 services: one block on the left (the head, the rule, three names); the stage owns the centre and the
            right. Each name ends well left of the centre so the light can leave it for the prism. The open arrow
            follows the active line; on the AI line its shaft is the AI spectrum, as on the way back. */}
        <section data-sec="services" className="st-sec st-svc">
          <SvcStage active={sec === "services" || svcHover != null ? svcOn : -1} mode={mode} />
          <Head label="From treatment to master" title="Services" />
          <span className="st-rule" aria-hidden />
          <ol className="st-svc__list" onPointerLeave={() => setSvcHover(null)}>
            {SITE_SERVICES.map((s, i) => (
              <li key={s.id} data-svc="" className={`st-svc__li${(desk ? svcHover === i : svc === i) ? " is-play" : ""}`}>
                <button
                  type="button"
                  className={`st-svc__item${i === svcOn ? " is-on" : i < svcOn ? " is-seen" : ""}`}
                  onPointerEnter={() => desk && setSvcHover(i)}
                  onFocus={() => setSvcHover(i)}
                  onBlur={() => setSvcHover(null)}
                  onClick={() => setSvOpen(i)}
                  aria-label={`${s.name}. ${s.line} Open the service`}
                >
                  <span className="st-svc__name">{s.name}</span>
                  <span className="st-svc__line">
                    {s.line.slice(0, s.line.lastIndexOf(" ") + 1)}
                    {/* the last word keeps the arrow with it if the line ever wraps */}
                    <span className="st-svc__tail">
                      {s.line.slice(s.line.lastIndexOf(" ") + 1)}
                      <span className="st-svc__go" aria-hidden>
                        {s.ai ? <AiFlux form="line" className="st-svc__shaft" /> : <span className="st-svc__shaft" />}
                        <svg className="st-svc__head" width="12" height="14" viewBox="0 0 12 14"><path d="M3 1.5 9 7l-6 5.5" /></svg>
                      </span>
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ol>
        </section>

        {/* 03 cases */}
        <section data-sec="cases" className="st-sec st-cases">
          <Head label="Selected works" title="Cases">
            {desk && (
              <div className="st-rowctl">
                <div className="st-rowctl__arc" aria-hidden><CutProgress value={((Math.min(rowAt, rowMax) + 1) / (rowMax + 1)) * 100} width={120} bend={3} /></div>
                <button type="button" className="st-round" onClick={() => rowGo(-1)} aria-label="Previous cases" disabled={rowAt <= 0}><Icon name="arrow-left" size={16} /></button>
                <button type="button" className="st-round" onClick={() => rowGo(1)} aria-label="More cases" disabled={rowAt >= rowMax}><Icon name="arrow-right" size={16} /></button>
              </div>
            )}
          </Head>
          <span className="st-rule" aria-hidden />
          <div className={`st-row${rowHover != null ? " is-pointing" : ""}`} ref={row} onScroll={onRow} data-own-keys="">
            {CASES.map((c, i) => (
              <button
                key={c.id}
                type="button"
                className={`st-card${open?.src === "row" && open.i === i ? " is-lifted" : ""}${rowHover === i ? " is-hover" : ""}`}
                onClick={(e) => openCase(i, e.currentTarget)}
                onPointerEnter={() => desk && setRowHover(i)}
                onPointerLeave={() => setRowHover(null)}
                onFocus={() => setRowHover(i)}
                onBlur={() => setRowHover(null)}
                aria-label={`Open the case: ${c.title}, ${c.type}`}
              >
                <span className="st-card__img grain">
                  <img src={c.film?.poster ?? c.stills[0].src} alt="" decoding="async" style={{ objectPosition: c.poster }} />
                  {c.film && <LoopVideo src={c.film.loop} on={rowHover === i} className="st-card__vid" />}
                  <span className="st-card__plus" aria-hidden><Icon name={c.film ? "play" : "plus"} size={c.film ? 12 : 15} /></span>
                </span>
                <span className="st-card__cap">
                  <span className="st-card__t">{c.title}</span>
                  <span className="st-card__k">{c.type}</span>
                </span>
              </button>
            ))}
          </div>
        </section>

        {/* 04 clients: 3 rows of 4, white logos in glass over the light (the deck's client slide) */}
        <section data-sec="clients" className="st-sec st-clients">
          <div className="st-clients__plate grain" aria-hidden><img src={OPEN.reflection} alt="" loading="lazy" /></div>
          <Head label="100+ happy customers" title="Clients" />
          <ul className="st-logos">
            {LOGOS.map((l) => (
              <li key={l.id} className="st-logo"><img src={l.file} alt={l.name} loading="lazy" style={{ ["--w" as string]: LOGO_W[l.id] ?? 220 }} /></li>
            ))}
          </ul>
        </section>

        {/* 05 reviews */}
        <section
          data-sec="reviews"
          className="st-sec st-reviews"
          onPointerEnter={() => setPause(true)}
          onPointerLeave={() => setPause(false)}
          onFocus={() => setPause(true)}
          onBlur={() => setPause(false)}
        >
          <Head label="In their words" title="Reviews">
            <div className="st-rowctl" data-own-keys="">
              <div className={`st-revbar${pause || reduced ? " is-paused" : ""}`} role="tablist" aria-label="Reviews">
                {REVIEWS.map((r, i) => (
                  <button
                    key={r.client}
                    type="button"
                    role="tab"
                    aria-selected={i === rev}
                    aria-label={`${r.client} review`}
                    className={`st-revbar__seg${i === rev ? " is-on" : i < rev ? " is-done" : ""}`}
                    onClick={() => setRev(i)}
                  >
                    {i === rev && <i key={`run-${rev}`} className="st-revbar__run" onAnimationEnd={() => setRev((x) => (x + 1) % REVIEWS.length)} />}
                  </button>
                ))}
              </div>
              <button type="button" className="st-round" onClick={() => setRev((r) => (r + REVIEWS.length - 1) % REVIEWS.length)} aria-label="Previous review"><Icon name="arrow-left" size={16} /></button>
              <button type="button" className="st-round" onClick={() => setRev((r) => (r + 1) % REVIEWS.length)} aria-label="Next review"><Icon name="arrow-right" size={16} /></button>
            </div>
          </Head>
          <div className="st-rev" ref={reviewsRef}>
            <div className="st-rev__track" style={{ transform: `translate3d(${-revShift}px, 0, 0)` }}>
              {REVIEWS.map((r, i) => (
                <figure key={r.client} className={`st-quote${i === rev ? " is-on" : ""}`} aria-hidden={desk ? i < Math.min(rev, revMax) || i > Math.min(rev, revMax) + 1 : i !== rev}>
                  <blockquote>{r.text.map((p, k) => <p key={k}>{p}</p>)}</blockquote>
                  <figcaption>
                    <img src={r.logo} alt={r.client} />
                  </figcaption>
                </figure>
              ))}
            </div>
          </div>
        </section>

        {/* 06 contact + footer */}
        <section data-sec="contact" className="st-sec st-contact">
          <div className="st-contact__plate grain" aria-hidden><img src={desk ? OPEN.horizon : "img/plates/horizon-vertical.jpg"} alt="" loading="lazy" /></div>
          <Head label="Contact" title="Let’s talk" />
          <div className="st-contact__in">
            <div className="st-contact__l">
              <div className="st-contact__top">
                <span className="st-lbl">Write to us</span>
                <a className="st-contact__mail" href={`mailto:${CONTACT.email}`}>{CONTACT.email}</a>
                <p className="st-contact__p">Or leave the brief here: the idea, the timing, the budget.</p>
              </div>
              <div className="st-next">
                <span className="st-lbl">What happens next</span>
                <ol className="st-next__list">
                  {["Treatment", "Moodboard", "Storyboard", "Video draft"].map((t, i) => (
                    <li key={t}><span className="st-next__t">{t}</span></li>
                  ))}
                </ol>
              </div>
            </div>
            <ContactForm />
          </div>
          <footer className="st-foot">
            <div className="st-foot__brand">
              <img src={LOGO.lockupWhite} alt="parsec studio" />
              <span className="st-foot__tag">We direct the light.</span>
            </div>
            {desk && (
              <nav className="st-foot__nav" aria-label="Footer">
                {SECTIONS.slice(0, 4).map((n) => <button key={n.id} type="button" onClick={() => goTo(n.id)}>{n.label}</button>)}
              </nav>
            )}
            <span className="st-foot__c">© 2026 Parsec Studio</span>
          </footer>
        </section>
      </div>

      {svOpen != null && (
        <ServiceView key={svOpen} index={svOpen} mode={mode} onClose={closeSv} onWork={openWork} openId={open?.src === "sv" ? open.list[open.i].id : undefined} />
      )}
      <Nav mode={mode} active={navOn} onGo={goTo} onMenu={() => setMenu(true)} solid={scrolled || svOpen != null} away={reelPh !== "idle"} />
      {menu && !desk && <MobileMenu active={navOn} onGo={goTo} onClose={() => setMenu(false)} />}
      <CtaDevPanel />
      {open && (
        <CaseView
          key={open.from ? `${open.from.x}-${open.from.y}` : "start"}
          list={open.list}
          backLabel={open.src === "sv" && svOpen != null ? SITE_SERVICES[svOpen].name : "Cases"}
          index={open.i}
          from={open.from}
          mode={mode}
          onIndex={(i) => setOpen((o) => (o ? { ...o, i } : o))}
          onClosed={closeCase}
          rectOf={rectOf}
        />
      )}
    </div>
  );
}
