import { useCallback, useEffect, useState, type RefObject } from "react";

/**
 * The showreel lives behind the disc of the hero. On the desk the glass shows the 1080p film itself, muted and looping
 * (sharp behind the glass), and "Showreel" restarts the same element at 0 with sound: no source switch, no wait. The
 * phone loops a light 540p cut behind the glass and switches to the film on "Showreel". HeroLightB owns the element
 * and the transition; this file holds what the site around it needs: the sources, the phases and the player state.
 */
export const REEL_SRC = {
  /** behind the glass on the phone: 960×540, no sound track, ~5 MB */
  glass: "video/site/showreel-540.mp4",
  /** watching, and behind the glass on the desk: 1920×1080 with sound, ~31 MB */
  film: "video/site/showreel-1080.mp4",
  /** reduced motion, save-data */
  poster: "video/site/showreel.jpg",
  /** the film's own first frame (960×540, ~24 KB): on the glass at once, until the film's frames arrive, so the film
      starts from exactly this picture; also the <video>'s poster while a source loads */
  first: "video/site/showreel-first.jpg",
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
