import { useCallback, useEffect, useState, type RefObject } from "react";
import { media } from "../../lib/media";

/**
 * The showreel lives behind the disc of the hero. On the desk the glass shows the film itself, muted and looping
 * (sharp behind the glass), and "Showreel" restarts the same element at 0 with sound: no source switch, no wait. The
 * phone loops the light 540p behind the glass; "Showreel" unmutes it, or switches to a sharper rendition when the
 * screen needs one and the connection can carry it. HeroLightB owns the element and the transition; this file holds
 * what the site around it needs: the sources, the phases and the player state.
 */
/** the film in three renditions, all with sound (H.264 + AAC, the index up front, a keyframe at least every 2 s) */
export const REELS = [
  { src: media("showreel-540a.mp4"), w: 960, mbps: 0.84 },   // ~5.8 MB
  { src: media("showreel-720.mp4"), w: 1280, mbps: 2.05 },   // ~14 MB
  { src: media("showreel-1080.mp4"), w: 1920, mbps: 4.52 },  // ~31 MB
] as const;
export type Reel = (typeof REELS)[number];

type Conn = { saveData?: boolean; effectiveType?: string; downlink?: number };
/** navigator.connection, where the browser has it (not Safari, not Firefox): a firm "slow" (save-data, 2g/3g), and
    its downlink estimate in Mbps with headroom, 0 when unknown. Chrome rounds the estimate, caps it at 10 and starts
    from a guess before it has seen real traffic, so it is only a hint: what the film itself fetched comes first. */
export function connHint(): { slow: boolean; mbps: number } {
  const c = (navigator as Navigator & { connection?: Conn }).connection;
  if (!c) return { slow: false, mbps: 0 };
  const slow = !!c.saveData || (!!c.effectiveType && /2g|3g/.test(c.effectiveType));
  return { slow, mbps: c.downlink ? (c.downlink >= 10 ? 1000 : c.downlink * 0.7) : 0 };
}

/** the smallest rendition that fills `needPx` device pixels across, within `budget` Mbps (the 540p always) */
export function pickReel(needPx: number, budget: number): Reel {
  const ok = REELS.filter((r, i) => i === 0 || r.mbps <= budget);
  return ok.find((r) => r.w >= needPx * 0.85) ?? ok[ok.length - 1];
}
/** the next rendition down (itself when it is the lightest) */
export const lighter = (src: string): Reel => REELS[Math.max(0, REELS.findIndex((r) => r.src === src) - 1)];
export const reelOf = (src: string): Reel | undefined => REELS.find((r) => r.src === src);

export const REEL_SRC = {
  /** behind the glass on the phone: its first 12 s, small and silent (~0.3 MB), looping; "Play showreel" switches to
      the film itself */
  glass: media("showreel-glass.mp4"),
  /** reduced motion, save-data */
  poster: media("showreel.jpg"),
  /** the film's own first frame (960×540, ~24 KB): on the glass at once, until the film's frames arrive, so the film
      starts from exactly this picture; also the <video>'s poster while a source loads */
  first: media("showreel-first.jpg"),
  dur: "0:55",
} as const;

/** idle: behind the glass · opening: the rim flares and goes down · open: watching · closing: the rim comes back up */
export type ReelPhase = "idle" | "opening" | "open" | "closing";

export interface HeroCtl {
  open: () => void;
  close: () => void;
  phase: () => ReelPhase;
  /** hover anticipation 0..1, eased inside: the rim warms up and the glass clears a little, the film is about to come */
  tease: (v: number) => void;
  /** is this client point on the glass the film lives behind (desk: the disc above the lit rim; phone: above the horizon)? */
  onGlass: (clientX: number, clientY: number) => boolean;
  /** where the light is hottest on the rim, in hero-section px (for UI that rides the light); null before the first frame */
  spot: () => { x: number; y: number } | null;
}

/** time, length, play state and sound of the hero reel, for PlayerBar; listens only while `live` */
export function useReelPlayer(ref: RefObject<HTMLVideoElement | null>, live: boolean) {
  const [t, setT] = useState(0);
  const [d, setD] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  useEffect(() => {
    const v = ref.current;
    if (!v || !live) return;
    const sync = () => {
      setT(v.currentTime);
      setD(Number.isFinite(v.duration) ? v.duration : 0);
      setPlaying(!v.paused && !v.ended);
      setMuted(v.muted);
    };
    sync();
    const evs = ["timeupdate", "durationchange", "loadedmetadata", "play", "playing", "pause", "ended", "volumechange", "seeked"] as const;
    evs.forEach((e) => v.addEventListener(e, sync));
    return () => evs.forEach((e) => v.removeEventListener(e, sync));
  }, [ref, live]);
  const toggle = useCallback(() => {
    const v = ref.current;
    if (!v) return;
    if (v.paused || v.ended) v.play().catch(() => {});
    else v.pause();
  }, [ref]);
  const mute = useCallback(() => {
    const v = ref.current;
    if (!v) return;
    v.muted = !v.muted;
    if (!v.muted) {
      try { v.volume = 1; } catch { /* iOS: volume is fixed */ }
      if (v.paused) v.play().catch(() => {});
    }
  }, [ref]);
  const seek = useCallback((f: number) => {
    const v = ref.current;
    if (!v || !v.duration) return;
    v.currentTime = Math.max(0, Math.min(v.duration - 0.05, f * v.duration));
    setT(v.currentTime);
  }, [ref]);
  return { t, d, playing, muted, toggle, mute, seek };
}

/** native full screen for the film (iPhone has only the video's own) */
export function fullscreen(v: HTMLVideoElement | null) {
  if (!v) return;
  const el = v as HTMLVideoElement & { webkitEnterFullscreen?: () => void; webkitRequestFullscreen?: () => Promise<void> };
  if (el.requestFullscreen) el.requestFullscreen().catch(() => el.webkitEnterFullscreen?.());
  else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
  else el.webkitEnterFullscreen?.();
}
