import { useCallback, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent as RPointerEvent, type ReactNode, type Ref } from "react";
import { REEL } from "../lib/assets";
import { AiFlux } from "../ui/AiFlux";
import { Icon } from "../ui/Icons";
import { useReduced } from "./ui";

/* Services and cases for the parsec.studio mock (site copy, English).
   Cases are the live site's own projects (parsec.studio, __NEXT_DATA__): titles, types and tools from its texts and
   the films' own credits, the films from its own media, re-encoded and hosted here (video/site), each poster the
   strongest frame of its film. AI works come from our Vimeo showcase, hosted here the same way.
   Nothing here is invented: a field we don't know is left out. */

export type Still = { src: string; pos: string; alt: string };
export type Film = { src: string; loop: string; poster: string; dur: string; /** width / height of the picture (letterbox cut away) */ ar: number };

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

const V = "video/site/";
const film = (id: string, dur: string, ar = 16 / 9): Film => ({ src: `${V}${id}.mp4`, loop: `${V}${id}-loop.mp4`, poster: `${V}${id}.jpg`, dur, ar });
const still = (id: string, alt: string, pos = "50% 50%"): Still => ({ src: `${V}${id}.jpg`, pos, alt });

export const CASES: Case[] = [
  {
    id: "prison", title: "A Prison Without Walls", type: "3D short film", dur: "1:07",
    tools: "Unreal Engine 5 · MetaHuman · Maya · Substance Painter · Cascadeur",
    line: "A short film with its own story, directed by the studio: a woman and a small robot, sets and characters built from scratch in Unreal Engine 5.",
    poster: "58% 50%", film: film("prison", "1:07", 1920 / 676), stills: [still("prison", "A small robot by a window in warm light", "58% 50%")],
  },
  {
    id: "centil", title: "Centil", type: "3D Animation & CGI", client: "Centil", year: "2023", dur: "1:55",
    tools: "Unreal Engine 5 · 3ds Max · Cinema 4D · After Effects",
    line: "Satellites, a ground station and an operations room, modelled in 3ds Max and staged in Unreal Engine 5.",
    poster: "55% 50%", film: film("centil", "1:55", 1920 / 772), stills: [still("centil", "The Earth at night from orbit", "55% 50%")],
  },
  {
    id: "leave", title: "Leave It Alone", type: "Animated music video", client: "Tariq", dur: "3:36",
    tools: "Illustrator",
    line: "A music video for Tariq: every scene drawn from scratch and animated frame by frame.",
    poster: "50% 50%", film: film("leave", "3:36"), stills: [still("leave", "Two figures bound by a wire against a burst of light")],
  },
  {
    id: "blkmrkt", title: "BLKMRKT", type: "Game trailer", dur: "0:28",
    tools: "Unreal Engine 5 · Blender · Maya · Marvelous Designer · Cascadeur",
    line: "The trailer for a mobile game: streets in Unreal Engine 5, clothes in Marvelous Designer.",
    poster: "41% 50%", film: film("blkmrkt", "0:28", 1920 / 674), stills: [still("blkmrkt", "A neon alley in the rain", "41% 50%")],
  },
  {
    id: "medieval", title: "Medieval Age", type: "Game trailer", dur: "0:25",
    tools: "Cinema 4D",
    line: "One of three concept trailers for a medieval video game, built from the ground up.",
    poster: "48% 50%", film: film("medieval", "0:25"), stills: [still("medieval", "A figure climbing the stairs to a glowing portal", "48% 50%")],
  },
  {
    id: "pytannia", title: "Krechet feat. Alina Pash", type: "Music video", dur: "3:47",
    tools: "ARRI Alexa · Drone",
    line: "The music video for “Pytannia” (Question), shot on ARRI Alexa with drone aerials, then edited, graded and finished at the studio.",
    poster: "49% 50%", film: film("pytannia", "3:47", 1920 / 804), stills: [still("pytannia", "A figure in a hood and a gas mask", "49% 50%")],
  },
  {
    id: "fifa", title: "FIFA World Cup 2022", type: "3D Animation & CGI", client: "FIFA", year: "2022", dur: "0:17",
    tools: "Cinema 4D · Octane Render",
    line: "A 3D film for the FIFA collectible coin, made for the 2022 World Cup in Qatar.",
    poster: "55% 50%", film: film("fifa", "0:17"), stills: [still("fifa", "Two gold World Cup coins falling through red space", "55% 50%")],
  },
  {
    id: "tefal", title: "Tefal Unlimited", type: "3D product film", client: "Tefal", dur: "0:15",
    tools: "Cinema 4D · DaVinci Resolve",
    line: "A digital double of the cookware in Cinema 4D, graded to the brand’s colours.",
    poster: "48% 50%", film: film("tefal", "0:15", 2), stills: [still("tefal", "The heat indicator under a fan of light", "48% 50%")],
  },
  {
    id: "arch", title: "Architecture Visualization", type: "3D Animation & CGI", dur: "0:19",
    tools: "Unreal Engine 5",
    line: "A house and its interiors, rendered in real time in Unreal Engine 5.",
    poster: "38% 50%", film: film("arch", "0:19"), stills: [still("arch", "A modern house among pines", "38% 50%")],
  },
];

/** AI works, in the order of our Vimeo showcase "AI Video Production" (titles and running times from it), the films
 *  re-encoded and hosted here like the cases; each poster a strong frame of its film */
const ai = (id: string, title: string, type: string, dur: string): Case => ({ id, title, type, dur, poster: "50% 50%", film: film(id, dur), stills: [still(id, title)] });
export const AI_CASES: Case[] = [
  ai("buldak", "Buldak", "Spicy noodles brand video", "1:37"),
  ai("opencreator", "OpenCreator", "AI video platform promo", "1:09"),
  ai("golfone", "GolfOne", "Golf club booking software promo", "1:00"),
  ai("zenegy", "Zenegy", "Payroll & HR software brand video (Danish)", "1:12"),
  ai("snappy", "Snappy", "Birthday reminder app promo", "0:50"),
  ai("openclaw", "OpenClaw", "AI agent teaser spot", "0:39"),
  ai("myclaw", "MyClaw", "AI agent product promo", "0:55"),
  ai("kraken", "Kraken", "Trading platform product video", "1:14"),
  ai("tavrix", "Tavrix", "Cinematic whisky cask brand spot", "0:30"),
  ai("prism-air", "Prism", "Airline content platform demo", "2:42"),
  ai("netflect", "Netflect", "Customer engagement platform explainer", "1:51"),
  ai("rightcrowd-pass", "RightCrowd Pass", "Mobile biometric access product video", "1:10"),
  ai("learn-music", "Learn Music Anywhere", "Online music lessons promo", "1:06"),
  ai("rightcrowd-ai", "RightCrowd AI", "SaaS explainer", "0:57"),
];
/** the AI films' loops, for the projector */
export const AI_LOOPS = AI_CASES.map((c) => c.id);

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
  /** 9:16 frames, for a line with no public work yet */
  frames?: Still[];
  items: string[];
};

export const SITE_SERVICES: Service[] = [
  {
    id: "craft", name: "Motion, 3D & CGI",
    line: "SaaS and product films, motion design, 3D and CGI.",
    text: "SaaS and product films, motion design, 3D animation and CGI. From script and storyboard to the edit, colour and sound.",
    works: CASES.filter((c) => c.type !== "Music video"),
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
    works: [],
    frames: [
      { src: REEL.portrait, pos: "44% 40%", alt: "A woman’s face in warm light" },
      { src: REEL.road, pos: "50% 50%", alt: "A man walking down a forest road" },
      { src: REEL.forest, pos: "48% 50%", alt: "A woman in a sunlit forest" },
      { src: REEL.medieval, pos: "47% 50%", alt: "A woman walking down a medieval street" },
      { src: REEL.astronaut, pos: "76% 50%", alt: "An astronaut walking through a meadow" },
      { src: REEL.robot, pos: "42% 50%", alt: "A small robot in a warm apartment" },
    ],
    items: ["Series treatment", "Scripts and storyboards", "Production", "Edit, colour and sound", "Safe zones for platform UI", "1080 × 1920 masters"],
  },
];

/* ── A muted loop that plays only while `on` (hover, or the row in focus on a phone) ── */
export function LoopVideo({ src, on, warm, className, poster, pos }: { src: string; on: boolean; /** load ahead, before the first hover */ warm?: boolean; className?: string; poster?: string; /** object-position, to frame the loop like its poster */ pos?: string }) {
  const ref = useRef<HTMLVideoElement | null>(null);
  const [armed, setArmed] = useState(false);
  const reduced = useReduced();
  useEffect(() => { if (on || warm) setArmed(true); }, [on, warm]);
  useEffect(() => { if (armed) ref.current?.load(); }, [armed]);
  useEffect(() => {
    const v = ref.current;
    if (!v || !armed) return;
    if (on && !reduced) v.play().catch(() => {});
    else v.pause();
  }, [on, armed, reduced]);
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
      {armed && <source src={src.replace(/\.mp4$/, ".webm")} type="video/webm" />}
      {armed && <source src={src} type="video/mp4" />}
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
    <div className={`st-sv${s.ai ? " st-sv--ai" : ""}`} role="dialog" aria-modal="true" aria-label={`Service: ${s.name}`} onKeyDown={onKey} data-own-keys="">
      <div className="st-sv__scroll">
        <div className="st-sv__head">
          <div className="st-sv__t">
            <BackArrow label="Services" onClick={onClose} ai={s.ai} btnRef={back} />
            <h2 className="st-sv__title">{s.name}</h2>
          </div>
          <p className="st-sv__text">{s.text}</p>
        </div>

        {s.works.length > 0 && (
          <div className="st-sv__works" onPointerLeave={() => setHover(null)}>
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
                  <img src={c.film?.poster ?? c.stills[0].src} alt="" decoding="async" loading="lazy" style={{ objectPosition: c.stills[0].pos }} />
                  {c.film && <LoopVideo src={c.film.loop} on={hover === k} className="st-wk__vid" />}
                  <span className="st-wk__play" aria-hidden><Icon name={c.film ? "play" : "plus"} size={c.film ? 12 : 14} /></span>
                </span>
                <span className="st-wk__cap">
                  <span className="st-wk__t">{c.title}</span>
                  <span className="st-wk__k">{c.type}{c.dur ? ` · ${c.dur}` : ""}</span>
                </span>
              </button>
            ))}
          </div>
        )}

        {s.frames && (
          <div className="st-sv__frames">
            {s.frames.map((st, k) => (
              <figure key={st.src} className="st-sv__frame grain" style={{ animationDelay: `${160 + k * 70}ms` }}>
                <img src={st.src} alt={st.alt} decoding="async" style={{ objectPosition: st.pos }} />
              </figure>
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
    v.play().catch(() => {
      // no sound without a gesture: start muted instead
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
  const reduced = useReduced();
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
  const pl = usePlayer(c.film?.src, phase === "open");

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
    if (e.key === " " && c.film && !(e.target instanceof HTMLButtonElement)) { e.preventDefault(); pl.toggle(); }
    if (e.key === "m" && c.film) pl.mute();
  };

  const st = c.stills[Math.min(shot, c.stills.length - 1)];
  const pos = phase !== "open" || (mode === "mob" && shot === 0) ? c.poster : st.pos;
  const ar = c.film?.ar;
  const fit = ar && vp ? Math.min(vp.w, vp.h * ar) : 0;
  const style = box
    ? { left: box.x, top: box.y, width: box.w, height: box.h, borderRadius: mode === "desk" ? 14 : 12 }
    : fit && vp
      // phone: the film sits under the back control and the text reads on the black below it
      ? { left: (vp.w - fit) / 2, top: mode === "mob" ? Math.min((vp.h - fit / ar!) / 2, 112) : (vp.h - fit / ar!) / 2, width: fit, height: fit / ar!, borderRadius: 0 }
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
      className={`st-cv st-cv--${phase}${ready ? " is-ready" : ""}${rest ? " is-idle" : ""}${c.film ? " st-cv--film" : ""}`}
      role="dialog" aria-modal="true" aria-label={`Case: ${c.title}`}
      onKeyDown={onKey} onPointerMove={wake} onPointerDown={wake} data-own-keys="" ref={root}
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

      <div className="st-cv__ui">
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
