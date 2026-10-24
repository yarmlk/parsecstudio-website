import { useCallback, useEffect, useState, type CSSProperties } from "react";
import { Site, type SecId, type SiteMode } from "./site/Site";

/* The site is drawn at its design width — 1440 on a desktop, 390 on a phone — and scaled to the window, so every line
   sits exactly where it was designed. The scale is capped so very large screens get more room rather than larger type.
   The page scrolls inside the site (its own scroller), which also drives the section spy, the reveals and the scenes. */

const DESK = 1440, MOB = 390;

function measure() {
  // the layout viewport, not the visual one: the phone's keyboard shrinks the visual viewport, and following it would
  // squeeze the whole site into the space above the keyboard and leave the rest black
  const w = Math.round(window.innerWidth);
  const h = Math.round(window.innerHeight);
  const mode: SiteMode = w < 900 ? "mob" : "desk";
  const base = mode === "desk" ? DESK : MOB;
  const maxK = mode === "desk" ? 1.22 : 1.18;
  const k = Math.min(w / base, maxK);
  return { w, h, mode, k, W: w / k, H: h / k };
}

/* Shown inside the brand book (an iframe): the book's rail scrolls the site to a section ({type: "parsec-jump", id}),
   the site tells the book which section is in view ({type: "parsec-sec", id}), and ?case=N opens on that case. */
const EMBED = typeof window !== "undefined" && window.parent !== window;
const START_CASE = (() => { const n = Number(new URLSearchParams(location.search).get("case")); return Number.isInteger(n) && n >= 0 && location.search.includes("case=") ? n : undefined; })();

export function App() {
  const [v, setV] = useState(measure);
  const [jump, setJump] = useState<{ id: SecId; n: number } | undefined>(undefined);
  useEffect(() => {
    if (!EMBED) return;
    const on = (e: MessageEvent) => { const d = e.data as { type?: string; id?: SecId } | null; if (d?.type === "parsec-jump" && d.id) setJump((j) => ({ id: d.id!, n: (j?.n ?? 0) + 1 })); };
    window.addEventListener("message", on);
    return () => window.removeEventListener("message", on);
  }, []);
  const onSection = useCallback((id: SecId) => { if (EMBED) window.parent.postMessage({ type: "parsec-sec", id }, "*"); }, []);
  useEffect(() => {
    const on = () => setV(measure());
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, []);
  const stage: CSSProperties = {
    width: v.W, height: v.H, transform: `scale(${v.k})`,
    ["--stage-h" as string]: `${v.H}px`,
  };
  return (
    <div className="app" style={{ width: v.w, height: v.h }}>
      <div className={`app__stage app__stage--${v.mode}`} style={stage}>
        <Site key={v.mode} mode={v.mode} jump={jump} onSection={onSection} startCase={START_CASE} />
      </div>
    </div>
  );
}
