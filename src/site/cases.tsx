import { useCallback, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent as RPointerEvent, type ReactNode, type Ref } from "react";
import { media } from "../lib/media";
import { AiFlux } from "../ui/AiFlux";
import { Icon } from "../ui/Icons";

/* Services and cases for the parsec.studio mock (site copy, English).
   Cases are the live site's own projects (parsec.studio, __NEXT_DATA__): titles, types and tools from its texts and
   the films' own credits, the films from its own media, re-encoded and hosted here (video/site), each poster the
   strongest frame of its film. AI works come from our Vimeo showcase, hosted here the same way.
   Nothing here is invented: a field we don't know is left out. */

export type Still = { src: string; pos: string; alt: string };
export type Film = { src: string; loop: string; loopWebm: string; poster: string; /** the poster made small, for cards */ card: string; /** and tiny, for the works pill */ thumb: string; dur: string; /** width / height of the picture (letterbox cut away) */ ar: number };

/* ── Cases ────────────────────────────────────────────────── */
export type Case = {
  id: string;
  title: string;
  type: string;
  client?: string;
  year?: string;
  dur?: string;
  tools?: string;
  line?: string;
  /** object-position of the poster inside the tall card */
  poster: string;
  /** the film, hosted on the site and played by its own player */
  film?: Film;
  stills: Still[];
};

const film = (id: string, dur: string, ar = 16 / 9): Film => ({ src: media(`${id}.mp4`), loop: media(`${id}-loop.mp4`), loopWebm: media(`${id}-loop.webm`), poster: media(`${id}.jpg`), card: media(`${id}-sm.webp`), thumb: media(`${id}-xs.jpg`), dur, ar });
const still = (id: string, alt: string, pos = "50% 50%"): Still => ({ src: media(`${id}.jpg`), pos, alt });

/** a work from one of our Vimeo showcases (title and running time from it), its film hosted here like the others */
const work = (id: string, title: string, type: string, dur: string): Case => ({ id, title, type, dur, poster: "50% 50%", film: film(id, dur), stills: [still(id, title)] });

/** our motion design, 3D and CGI: Centil, then the showcase "SaaS & Tech Explainers" in its order */
export const CRAFT_CASES: Case[] = [
  {
    id: "centil", title: "Centil", type: "3D Animation & CGI", client: "Centil", year: "2023", dur: "1:55",
    tools: "Unreal Engine 5 · 3ds Max · Cinema 4D · After Effects",
    line: "Satellites, a ground station and an operations room, modelled in 3ds Max and staged in Unreal Engine 5.",
    poster: "55% 50%", film: film("centil", "1:55", 1920 / 772), stills: [still("centil", "The Earth at night from orbit", "55% 50%")],
  },
  work("banxe", "Banxe", "Crypto & banking platform promo", "0:34"),
  work("google-meet", "Google Meet", "2D product explainer", "0:15"),
  work("vodafone", "Vodafone", "Field service software promo", "1:57"),
  work("nymcard", "NymCard", "Card issuing dashboard explainer", "0:43"),
  work("dehealth", "DeHealth", "Health super app promo", "0:28"),
  work("frontdesk", "Frontdesk", "AI voice emotions promo", "2:35"),
  work("scichart", "SciChart", "Data visualization library promo", "1:16"),
  work("contentstack", "Contentstack", "Content platform explainer", "0:22"),
  work("wilde", "WILDE", "Streaming platform promo", "1:26"),
  work("refuelrs", "ReFuelrs", "Fuel delivery app explainer", "0:44"),
  work("fifteen", "Fifteen", "Brand motion promo", "0:31"),
  work("translinguist", "TransLinguist", "Multilingual meetings explainer", "0:33"),
  work("microsoft-elearning", "Microsoft", "E-Learning explainer concept", "1:19"),
  work("retica", "Retica", "Product explainer", "1:06"),
  work("banxe-iban", "Banxe", "IBAN & crypto banking explainer", "0:37"),
  work("kiwus", "Kiwus Consulting", "Motion design", "0:14"),
  work("soundstamp", "Soundstamp", "Product story video", "1:37"),
];

/** AI works, in the order of our Vimeo showcase "AI Video Production" (titles and running times from it), the films
 *  re-encoded and hosted here like the cases; each poster a strong frame of its film */
export const AI_CASES: Case[] = [
  work("buldak", "Buldak", "Spicy noodles brand video", "1:37"),
  work("opencreator", "OpenCreator", "AI video platform promo", "1:09"),
  work("golfone", "GolfOne", "Golf club booking software promo", "1:00"),
  work("zenegy", "Zenegy", "Payroll & HR software brand video (Danish)", "1:12"),
  work("snappy", "Snappy", "Birthday reminder app promo", "0:50"),
  work("openclaw", "OpenClaw", "AI agent teaser spot", "0:39"),
  work("myclaw", "MyClaw", "AI agent product promo", "0:55"),
  work("kraken", "Kraken", "Trading platform product video", "1:14"),
  work("tavrix", "Tavrix", "Cinematic whisky cask brand spot", "0:30"),
  work("prism-air", "Prism", "Airline content platform demo", "2:42"),
  work("netflect", "Netflect", "Customer engagement platform explainer", "1:51"),
  work("rightcrowd-pass", "RightCrowd Pass", "Mobile biometric access product video", "1:10"),
  work("learn-music", "Learn Music Anywhere", "Online music lessons promo", "1:06"),
  work("rightcrowd-ai", "RightCrowd AI", "SaaS explainer", "0:57"),
];
/** our vertical series, 9:16 episodes (working cuts: the finished versions replace them) */
const tall = (id: string, title: string, type: string, dur: string): Case => ({ id, title, type, dur, poster: "50% 50%", film: film(id, dur, 9 / 16), stills: [still(id, title)] });
export const VERTICAL_CASES: Case[] = [
  tall("vd-blood-sisters", "Blood Sisters", "Vertical drama series", "3:01"),
  tall("vd-miami", "Miami", "Vertical crime drama", "2:54"),
  tall("vd-arena", "Arena", "Vertical historical drama", "2:47"),
];

/** the Cases row: the strongest, best-known names first, then the rest of the AI works, then the rest of motion */
const LEAD = ["buldak", "banxe", "google-meet", "snappy", "vodafone", "contentstack", "microsoft-elearning", "centil"];
const ALL = [...AI_CASES, ...CRAFT_CASES];
export const CASES: Case[] = [...LEAD.map((id) => ALL.find((c) => c.id === id)!), ...ALL.filter((c) => !LEAD.includes(c.id))];

/* ── Services ─────────────────────────────────────────────── */
export type Service = {
  id: string;
  name: string;
  /** AI Production carries the AI spectrum */
  ai?: boolean;
  /** one line under the name in the list */
  line: string;
  /** the short description in the sub-view */
  text: string;
  /** works inside the service, each opens like a case */
  works: Case[];
  items: string[];
};

export const SITE_SERVICES: Service[] = [
  {
    id: "craft", name: "Motion, 3D & CGI",
    line: "SaaS and product films, motion design, 3D and CGI.",
    text: "SaaS and product films, motion design, 3D animation and CGI. From script and storyboard to the edit, colour and sound.",
    works: CRAFT_CASES,
    items: [
      "SaaS and product films", "Motion design and explainers", "3D animation and CGI", "Game trailers and cinematics",
      "Brand and event films", "Script and storyboard", "Characters and environments", "Edit, colour and sound",
    ],
  },
  {
    id: "ai", name: "AI Production", ai: true,
    line: "Generated footage, directed and finished by hand.",
    text: "Generated footage, directed and finished by hand. Directors and artists make the decisions; AI speeds up exploration and production.",
    works: AI_CASES,
    items: ["Treatment and moodboard", "Storyboard", "Image generation", "Video generation", "Direction and selection", "Edit, colour and sound"],
  },
  {
    id: "vertical", name: "Vertical Series",
    line: "Episodes made for 9:16.",
    text: "Episodes made for 9:16, from the series treatment to the masters, delivered at 1080 × 1920.",
    works: VERTICAL_CASES,
    items: ["Series treatment", "Scripts and storyboards", "Production", "Edit, colour and sound", "Safe zones for platform UI", "1080 × 1920 masters"],
  },
];

/* ── A muted loop that plays only while `on` (hover, or the row in focus on a phone) ── */
export function LoopVideo({ src, webm, mp4First, on, warm, className, poster, pos }: { src: string; /** its VP9 copy (else derived from src) */ webm?: string; /** phones: H.264 first, which every phone decodes in hardware (Safari would take the VP9 and decode it in software) */ mp4First?: boolean; on: boolean; /** load ahead, before the first hover */ warm?: boolean; className?: string; poster?: string; /** object-position, to frame the loop like its poster */ pos?: string }) {
  const ref = useRef<HTMLVideoElement | null>(null);
  const [armed, setArmed] = useState(false);
  useEffect(() => { if (on || warm) setArmed(true); }, [on, warm]);
  /* a card that has stayed in view for a moment loads its loop ahead, so the hover plays at once (only those in view:
     a row of cards loads a handful of loops, not all of them) */
  useEffect(() => {
    const v = ref.current;
    if (!v || armed || typeof IntersectionObserver === "undefined") return;
    let t = 0;
    const io = new IntersectionObserver(([e]) => {
      window.clearTimeout(t);
      if (e.isIntersecting) t = window.setTimeout(() => setArmed(true), 350);
    }, { threshold: 0.5 });
    io.observe(v);
    return () => { io.disconnect(); window.clearTimeout(t); };
  }, [armed]);
  useEffect(() => { if (armed) ref.current?.load(); }, [armed]);
  useEffect(() => {
    const v = ref.current;
    if (!v || !armed) return;
    // plays on the visitor's own hover or tap, so also with reduced motion on (Windows turns that on with its
    // "animation effects" off, and the loops would then never play)
    if (on) v.play().catch(() => {});
    else v.pause();
  }, [on, armed]);
  // VP9 first (small, plays everywhere Chromium does), H.264 for Safari and the rest
  return (
    <video
      ref={ref}
      className={`${className ?? ""}${on ? " is-on" : ""}`}
      poster={poster}
      style={pos ? { objectPosition: pos } : undefined}
      muted
      loop
      playsInline
      preload={armed ? "auto" : "none"}
      aria-hidden
      tabIndex={-1}
    >
      {armed && mp4First && <source src={src} type="video/mp4" />}
      {armed && <source src={webm ?? src.replace(/\.mp4(\?.*)?$/, ".webm")} type="video/webm" />}
      {armed && !mp4First && <source src={src} type="video/mp4" />}
    </video>
  );
}

/* ── The back control: the cut, drawn as an arrow. It grows and warms on hover. ── */
export function BackArrow({ label, onClick, ai, className, btnRef }: { label: string; onClick: () => void; ai?: boolean; className?: string; btnRef?: Ref<HTMLButtonElement> }) {
  return (
    <button ref={btnRef} type="button" className={`st-back${ai ? " st-back--ai" : ""}${className ? ` ${className}` : ""}`} onClick={onClick} aria-label={`Back to ${label}`}>
      <span className="st-back__arrow" aria-hidden>
        <svg className="st-back__head" width="12" height="14" viewBox="0 0 12 14"><path d="M9 1.5 3 7l6 5.5" /></svg>
        {ai ? <AiFlux form="line" className="st-back__shaft" /> : <span className="st-back__shaft" />}
      </span>
      <span className="st-back__l">{label}</span>
    </button>
  );
}

/** A service, opened inside the site: the description, its works (each opens like a case), what's inside. */
export function ServiceView({ index, mode, onClose, onWork, openId }: {
  index: number; mode: "desk" | "mob"; onClose: () => void;
  onWork: (list: Case[], i: number, el: HTMLElement) => void; openId?: string;
}) {
  const s = SITE_SERVICES[index];
  const back = useRef<HTMLButtonElement | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  useEffect(() => { back.current?.focus({ preventScroll: true }); }, []);
  const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && !openId) { e.stopPropagation(); onClose(); } };
  return (
    <div className={`st-sv${s.ai ? " st-sv--ai" : ""}`} role="dialog" aria-modal="true" aria-label={`Service: ${s.name}`} onKeyDown={onKey} data-own-keys="" tabIndex={-1}>
      <div className="st-sv__scroll">
        <div className="st-sv__head">
          <div className="st-sv__t">
            <BackArrow label="Services" onClick={onClose} ai={s.ai} btnRef={back} />
            <h2 className="st-sv__title">{s.name}</h2>
          </div>
          <p className="st-sv__text">{s.text}</p>
        </div>

        {s.works.length > 0 && (
          <div className={`st-sv__works${s.works[0].film && s.works[0].film.ar < 1 ? " st-sv__works--tall" : ""}`} onPointerLeave={() => setHover(null)}>
            {s.works.map((c, k) => (
              <button
                key={c.id}
                type="button"
                data-work={c.id}
                className={`st-wk${openId === c.id ? " is-lifted" : ""}`}
                style={{ animationDelay: `${140 + k * 50}ms` }}
                onPointerEnter={() => mode === "desk" && setHover(k)}
                onFocus={() => setHover(k)}
                onBlur={() => setHover(null)}
                onClick={(e) => onWork(s.works, k, e.currentTarget)}
                aria-label={`Open the work: ${c.title}, ${c.type}`}
              >
                <span className="st-wk__img grain">
                  <img src={c.film?.card ?? c.stills[0].src} alt="" width={c.film && c.film.ar < 1 ? 428 : 1100} height={c.film && c.film.ar < 1 ? 760 : 619} decoding="async" loading="lazy" style={{ objectPosition: c.stills[0].pos }} />
                  {c.film && <LoopVideo src={c.film.loop} webm={c.film.loopWebm} on={hover === k} className="st-wk__vid" />}
                </span>
                <span className="st-wk__cap">
                  <span className="st-wk__t">{c.title}</span>
                  <span className="st-wk__k">{c.type}{c.dur ? ` · ${c.dur}` : ""}</span>
                </span>
              </button>
            ))}
          </div>
        )}

        <div className="st-sv__inside">
          <span className="st-lbl">What’s inside</span>
          <ul className={`st-sv__items st-sv__items--${s.items.length > 6 ? 4 : 3}`}>
            {s.items.map((it, k) => (
              <li key={it} style={{ animationDelay: `${380 + k * 40}ms` }}>
                <span className="st-sv__it">{it}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

export type Rect = { x: number; y: number; w: number; h: number };

/** the key goes into a text field */
export const typing = (t: EventTarget | null) => t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
/** a click on a control (a button, a link, the timeline), which keeps its own meaning */
export const onControl = (t: EventTarget | null) => t instanceof Element && !!t.closest("button, a, input, textarea, select, [role=slider], .st-pl");
const DUR = 720;

/** A frame that crossfades to its next source (light first: the new frame opens over the old one). */
function Frame({ still, pos }: { still: Still; pos: string }) {
  const [layers, setLayers] = useState<{ s: Still; k: number }[]>([{ s: still, k: 0 }]);
  const key = useRef(0);
  useEffect(() => {
    setLayers((l) => (l[l.length - 1].s.src === still.src ? l : [...l.slice(-1), { s: still, k: ++key.current }]));
  }, [still]);
  return (
    <div className="st-cv__frame grain">
      {layers.map((l, i) => (
        <img
          key={l.k}
          src={l.s.src}
          alt={i === layers.length - 1 ? l.s.alt : ""}
          className={i > 0 ? "is-new" : undefined}
          style={{ objectPosition: i === layers.length - 1 ? pos : l.s.pos }}
          onAnimationEnd={() => setLayers((cur) => cur.slice(-1))}
        />
      ))}
    </div>
  );
}

/* ── The player: the site's own. The film is hosted with the site; the timeline is the cut. ── */
export const mmss = (t: number) => { const s = Math.max(0, Math.floor(t)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };

export function usePlayer(src: string | undefined, live: boolean, startMuted = true) {
  const ref = useRef<HTMLVideoElement | null>(null);
  const [t, setT] = useState(0);
  const [d, setD] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(startMuted);
  useEffect(() => { setT(0); setD(0); setPlaying(false); }, [src]);
  useEffect(() => {
    const v = ref.current;
    if (!v || !src || !live) return;
    v.muted = muted;
    // with sound, but not at full volume: the visitor turns it up if they want
    try { v.volume = 0.75; } catch { /* fixed volume (iOS) */ }
    v.play().catch((e: unknown) => {
      // no sound without a gesture: start muted instead (any other failure is not about sound)
      if ((e as { name?: string } | null)?.name !== "NotAllowedError") return;
      if (!v.muted) { v.muted = true; setMuted(true); v.play().catch(() => setPlaying(false)); } else setPlaying(false);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src, live]);
  const toggle = useCallback(() => { const v = ref.current; if (!v) return; if (v.paused) v.play().catch(() => {}); else v.pause(); }, []);
  const mute = useCallback(() => { const v = ref.current; if (!v) return; v.muted = !v.muted; setMuted(v.muted); if (!v.muted && v.paused) v.play().catch(() => {}); }, []);
  const seek = useCallback((f: number) => { const v = ref.current; if (!v || !v.duration) return; v.currentTime = Math.max(0, Math.min(v.duration - 0.05, f * v.duration)); setT(v.currentTime); }, []);
  const bind = {
    ref,
    onTimeUpdate: () => setT(ref.current?.currentTime ?? 0),
    onLoadedMetadata: () => setD(ref.current?.duration ?? 0),
    onPlay: () => setPlaying(true),
    onPause: () => setPlaying(false),
    onEnded: () => setPlaying(false),
  };
  return { bind, t, d, playing, muted, toggle, mute, seek };
}

export type Player = ReturnType<typeof usePlayer>;
/** what the bar needs from a player (the hero reel has its own, see hero/reel.ts) */
export type PlayerLike = Pick<Player, "t" | "d" | "playing" | "muted" | "toggle" | "mute" | "seek">;

/** play · time · the cut as timeline · length · sound. `children` go at the end (e.g. a close button). */
export function PlayerBar({ pl, dur, children, className }: { pl: PlayerLike; dur?: string; children?: ReactNode; className?: string }) {
  return (
    <div className={`st-pl${className ? ` ${className}` : ""}`}>
      <button type="button" className="st-round st-pl__play" onClick={pl.toggle} aria-label={pl.playing ? "Pause" : "Play"}>
        <Icon name={pl.playing ? "pause" : "play"} size={pl.playing ? 15 : 13} />
      </button>
      <span className="st-pl__time">{mmss(pl.t)}</span>
      <Timeline t={pl.t} d={pl.d} onSeek={pl.seek} />
      <span className="st-pl__time st-pl__time--d">{pl.d ? mmss(pl.d) : dur ?? "0:00"}</span>
      <button type="button" className={`st-round st-pl__snd${pl.muted ? "" : " is-on"}`} onClick={pl.mute} aria-label={pl.muted ? "Sound on" : "Sound off"}>
        <Icon name={pl.muted ? "mute" : "sound"} size={16} />
      </button>
      {children}
    </div>
  );
}

function Timeline({ t, d, onSeek }: { t: number; d: number; onSeek: (f: number) => void }) {
  const track = useRef<HTMLDivElement | null>(null);
  const [drag, setDrag] = useState(false);
  const [hov, setHov] = useState<number | null>(null);
  const at = (e: RPointerEvent<HTMLDivElement>) => {
    const r = track.current!.getBoundingClientRect();
    return Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
  };
  const f = d ? t / d : 0;
  return (
    <div
      ref={track}
      className={`st-pl__track${drag ? " is-drag" : ""}`}
      role="slider"
      tabIndex={0}
      aria-label="Seek"
      aria-valuemin={0}
      aria-valuemax={Math.round(d)}
      aria-valuenow={Math.round(t)}
      aria-valuetext={`${mmss(t)} of ${mmss(d)}`}
      onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); setDrag(true); onSeek(at(e)); }}
      onPointerMove={(e) => { setHov(at(e)); if (drag) onSeek(at(e)); }}
      onPointerUp={() => setDrag(false)}
      onPointerLeave={() => setHov(null)}
      onKeyDown={(e) => {
        if (e.key === "ArrowRight" || e.key === "ArrowLeft") { e.preventDefault(); e.stopPropagation(); onSeek(Math.max(0, Math.min(1, f + (e.key === "ArrowRight" ? 5 : -5) / (d || 1)))); }
      }}
    >
      <span className="st-pl__base" />
      <span className="st-pl__fill" style={{ width: `${f * 100}%` }} />
      <span className="st-pl__head" style={{ left: `${f * 100}%` }} />
      {hov != null && d > 0 && <span className="st-pl__tip" style={{ left: `${hov * 100}%` }}>{mmss(hov * d)}</span>}
    </div>
  );
}

/**
 * The opened case. It grows out of the card (`from`, in site px) to the full window, and shrinks back into
 * the card of the current case on close. `rectOf` measures that card at close time (null = fade out).
 * `list` is the set it browses: all cases, or the works of one service.
 */
export function CaseView({
  list, index, from, mode, onIndex, onClosed, rectOf, backLabel,
}: {
  list: Case[];
  index: number;
  from: Rect | null;
  mode: "desk" | "mob";
  onIndex: (i: number) => void;
  onClosed: () => void;
  rectOf: (i: number) => Rect | null;
  backLabel: string;
}) {
  /* the case opens and closes on a click: its move plays with reduced motion on too (see LoopVideo) */
  const reduced = false;
  const c = list[index];
  const [box, setBox] = useState<Rect | null>(reduced ? null : from);
  const [phase, setPhase] = useState<"enter" | "open" | "leave">(from && !reduced ? "enter" : "open");
  const [shot, setShot] = useState(0);
  const [idle, setIdle] = useState(false);
  const [ready, setReady] = useState(false);
  const idleT = useRef<number | undefined>(undefined);
  const back = useRef<HTMLButtonElement | null>(null);
  const root = useRef<HTMLDivElement | null>(null);
  const [vp, setVp] = useState<{ w: number; h: number } | null>(null);
  // opened by a click, so the film may start with its sound
  const pl = usePlayer(c.film?.src, phase === "open", false);

  // the window in site px: a film opens to its own frame inside it (no bars of its own), so the card grows into the
  // picture without a jump; the black around it is the veil
  useLayoutEffect(() => {
    const el = root.current;
    if (!el) return;
    const on = () => setVp({ w: el.offsetWidth, h: el.offsetHeight });
    on();
    const ro = new ResizeObserver(on);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useLayoutEffect(() => {
    if (phase !== "enter") return;
    const r = requestAnimationFrame(() => requestAnimationFrame(() => { setBox(null); setPhase("open"); }));
    return () => cancelAnimationFrame(r);
  }, [phase]);
  useEffect(() => { back.current?.focus({ preventScroll: true }); }, []);
  useEffect(() => { setShot(0); }, [index]);

  // once the panel is in, the controls answer at once; while the film plays they step back after 3 s without the pointer
  useEffect(() => {
    if (phase !== "open") return;
    const r = window.setTimeout(() => setReady(true), reduced ? 0 : 1300);
    return () => window.clearTimeout(r);
  }, [phase, reduced]);
  const wake = useCallback(() => {
    setIdle(false);
    window.clearTimeout(idleT.current);
    idleT.current = window.setTimeout(() => setIdle(true), 3000);
  }, []);
  useEffect(() => { if (ready) wake(); return () => window.clearTimeout(idleT.current); }, [wake, index, ready]);

  const close = () => {
    if (phase === "leave") return;
    const r = reduced ? null : rectOf(index);
    if (!r) { onClosed(); return; }
    setShot(0);
    setPhase("leave");
    setBox(r);
    window.setTimeout(onClosed, DUR);
  };
  const go = (d: number) => onIndex((index + d + list.length) % list.length);
  const onKey = (e: KeyboardEvent) => {
    wake();
    if (e.key === "Escape") { e.stopPropagation(); close(); }
    if (e.key === "ArrowRight") { e.preventDefault(); go(1); }
    if (e.key === "ArrowLeft") { e.preventDefault(); go(-1); }
    // space plays and pauses, wherever the focus is (also on the back or next button: the space would press them)
    if (e.key === " " && c.film && !typing(e.target)) { e.preventDefault(); pl.toggle(); }
    if (e.key === "m" && c.film) pl.mute();
  };

  const st = c.stills[Math.min(shot, c.stills.length - 1)];
  const pos = phase !== "open" || (mode === "mob" && shot === 0) ? c.poster : st.pos;
  const ar = c.film?.ar;
  // a film that nearly fills the window fills it (a few px of black at the top and bottom read as a bar)
  const fill = !!(ar && vp && mode === "desk" && Math.abs(vp.w / vp.h - ar) / ar < 0.06);
  const fit = ar && vp && !fill ? Math.min(vp.w, vp.h * ar) : 0;
  // a 9:16 episode stands in the middle of the screen, its text and controls over its lower part (as a phone shows one)
  const upright = !!(ar && ar < 1);
  const under = mode === "mob" && !upright;
  const style = box
    ? { left: box.x, top: box.y, width: box.w, height: box.h, borderRadius: mode === "desk" ? 14 : 12 }
    : fit && vp
      // phone: the film a little above the middle of the screen, its controls and the text under it
      ? { left: (vp.w - fit) / 2, top: under ? Math.max(112, (vp.h - fit / ar!) / 2 - 70) : (vp.h - fit / ar!) / 2, width: fit, height: fit / ar!, borderRadius: 0 }
      : { left: 0, top: 0, width: "100%", height: "100%", borderRadius: 0 };
  const meta: [string, string][] = [];
  if (c.client) meta.push(["Client", c.client]);
  if (c.year) meta.push(["Year", c.year]);
  if (c.dur) meta.push(["Length", c.dur]);
  if (c.tools) meta.push(["Made in", c.tools]);
  const rest = ready && idle && pl.playing && phase === "open";
  const next = list[(index + 1) % list.length];

  return (
    <div
      className={`st-cv st-cv--${phase}${ready ? " is-ready" : ""}${rest ? " is-idle" : ""}${c.film ? " st-cv--film" : ""}${upright ? " st-cv--tall" : ""}`}
      role="dialog" aria-modal="true" aria-label={`Case: ${c.title}`}
      onKeyDown={onKey} onKeyUp={(e) => { if (e.key === " " && c.film && !typing(e.target)) e.preventDefault(); }}
      onPointerMove={wake} onPointerDown={wake} data-own-keys="" ref={root}
      // a click on the film keeps the focus here (else it falls to the page and the keys stop reaching the player)
      tabIndex={-1}
      // the phone: where the film ends, so its controls and the text follow right under it
      style={under && fit && vp ? ({ ["--fb" as string]: `${Math.round(Math.max(112, (vp.h - fit / ar!) / 2 - 70) + fit / ar!)}px` }) : undefined}
    >
      <div className="st-cv__veil" aria-hidden />
      <div className="st-cv__box" style={style}>
        {c.film ? (
          <div className="st-cv__frame">
            <video
              key={c.id}
              {...pl.bind}
              className="st-cv__video"
              src={c.film.src}
              poster={c.film.poster}
              style={{ objectPosition: phase === "open" ? "50% 50%" : c.poster }}
              playsInline
              preload="metadata"
              onClick={pl.toggle}
            />
          </div>
        ) : (
          <Frame still={st} pos={pos} />
        )}
      </div>
      <div className="st-cv__shade" aria-hidden />

      {/* a click anywhere on the film (not on a control) plays and pauses it, as people expect */}
      <div className="st-cv__ui" onClick={(e) => { if (c.film && phase === "open" && !onControl(e.target)) pl.toggle(); }}>
        <div className="st-cv__top">
          <BackArrow label={backLabel} onClick={close} btnRef={back} className="st-cv__back" />
        </div>

        <div className="st-cv__bottom">
          <section className="st-cv__panel" key={c.id}>
            <span className="st-lbl">{c.type}</span>
            <h3 className="st-cv__title">{c.title}</h3>
            {c.line && <p className="st-cv__line">{c.line}</p>}
            {meta.length > 0 && (
              <dl className="st-cv__meta">
                {meta.map(([k, v]) => <div key={k} className={k === "Made in" ? "is-wide" : undefined}><dt>{k}</dt><dd>{v}</dd></div>)}
              </dl>
            )}
          </section>

          <div className="st-cv__side">
            {!c.film && c.stills.length > 1 && (
              <div className="st-cv__stills" role="group" aria-label="Stills">
                {c.stills.map((s, i) => (
                  <button key={s.src} type="button" className={`st-cv__still${i === shot ? " is-on" : ""}`} onClick={() => setShot(i)} aria-pressed={i === shot} aria-label={`Still ${i + 1}: ${s.alt}`}>
                    <img src={s.src} alt="" style={{ objectPosition: s.pos }} />
                  </button>
                ))}
              </div>
            )}
            {!c.film && <span className="st-lbl st-cv__note">Film file to come · still</span>}
            <div className="st-cv__nav">
              <button type="button" className="st-round" onClick={() => go(-1)} aria-label="Previous work"><Icon name="arrow-left" size={16} /></button>
              <button type="button" className="st-pill st-cv__next" onClick={() => go(1)} aria-label={`Next: ${next.title}`}>
                <span className="st-cv__nextl">Next</span><span className="st-cv__nextt">{next.title}</span><Icon name="arrow-right" size={15} />
              </button>
            </div>
          </div>
        </div>

        {c.film && <PlayerBar pl={pl} dur={c.film.dur} />}
      </div>
    </div>
  );
}
