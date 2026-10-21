import { useCallback, useEffect, useState, type RefObject } from "react";

/**
 * The showreel lives behind the disc of the hero. Behind the glass a light 540p cut loops, muted; "Showreel" switches
 * the same <video> to the full 1080p film with sound. HeroLightB owns the element and the transition; this file holds
 * what the site around it needs: the sources, the phases and the player state for the bar.
 */
export const REEL_SRC = {
  /** behind the glass: 960×540, no sound track, ~5 MB */
  glass: "video/site/showreel-540.mp4",
  /** watching: 1920×1080 with sound */
  film: "video/site/showreel-1080.mp4",
  /** reduced motion, save-data, before the first frame */
  poster: "video/site/showreel.jpg",
  dur: "0:55",
} as const;

/** idle: behind the glass · opening: the rim flares and goes down · open: watching · closing: the rim comes back up */
export type ReelPhase = "idle" | "opening" | "open" | "closing";

export interface HeroCtl {
  open: () => void;
  close: () => void;
  phase: () => ReelPhase;
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
