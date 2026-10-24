import { useEffect, useRef } from "react";
import { Icon } from "../../ui/Icons";
import { REELS, REEL_SRC, connHint } from "./reel";

/**
 * The phone's hero, kept plain: a few calm seconds of the showreel loop muted behind a still horizon (one small H.264
 * file, no WebGL, no per-frame work), and "Play showreel" opens the film in a player of its own over the whole
 * screen, with the phone's own controls. The page under it is locked while it is open.
 */
export function HeroMob() {
  const ref = useRef<HTMLVideoElement | null>(null);
  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    // iOS plays a muted video by itself only if it is muted before it loads (React sets the property, not the
    // attribute) and inline; and the phone's own big play button never shows over it
    v.muted = true; v.defaultMuted = true; v.setAttribute("muted", ""); v.setAttribute("playsinline", ""); v.setAttribute("webkit-playsinline", "");
    // the source only once it is muted, so the phone sees a muted inline video from the start
    v.src = REEL_SRC.glass;
    v.load();
    let seen = true;
    const sync = () => { if (seen && !document.hidden) v.play().catch(() => {}); else v.pause(); };
    // a phone that would not start it on its own (low power mode) starts it on the first touch anywhere
    const nudge = () => { if (v.paused && seen) v.play().catch(() => {}); };
    document.addEventListener("touchstart", nudge, { passive: true });
    const io = new IntersectionObserver(([e]) => { seen = e.isIntersecting; sync(); });
    io.observe(v);
    document.addEventListener("visibilitychange", sync);
    return () => { io.disconnect(); document.removeEventListener("visibilitychange", sync); document.removeEventListener("touchstart", nudge); };
  }, []);
  return (
    <div className="hm" aria-hidden>
      <video ref={ref} className="hm__film" poster={REEL_SRC.glassPoster} muted loop playsInline autoPlay preload="auto" disablePictureInPicture disableRemotePlayback />
      <i className="hm__fade" />
      <i className="hm__horizon" />
    </div>
  );
}

/** the film, full screen: the 720p on a connection that is not marked slow, else the light 540p (both with sound) */
export function ReelMob({ onClose }: { onClose: () => void }) {
  const ref = useRef<HTMLVideoElement | null>(null);
  const close = useRef<HTMLButtonElement | null>(null);
  const src = connHint().slow ? REELS[0].src : REELS[1].src;
  useEffect(() => {
    const v = ref.current;
    if (v) { try { v.volume = 0.75; } catch { /* fixed volume (iOS) */ } v.play().catch(() => {}); }
    close.current?.focus({ preventScroll: true });
    // the page under it stays where it is
    const sc = document.querySelector<HTMLElement>(".st-site__scroll");
    const prev = sc?.style.overflowY ?? "";
    if (sc) sc.style.overflowY = "hidden";
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => { if (sc) sc.style.overflowY = prev; window.removeEventListener("keydown", onKey); };
  }, [onClose]);
  return (
    <div className="rm" role="dialog" aria-modal="true" aria-label="Showreel" onTouchMove={(e) => e.stopPropagation()}>
      <video ref={ref} className="rm__film" src={src} poster={REEL_SRC.first} playsInline controls autoPlay preload="auto" onEnded={onClose} />
      <button ref={close} type="button" className="st-round rm__close" onClick={onClose} aria-label="Close the showreel"><Icon name="close" size={17} /></button>
    </div>
  );
}
