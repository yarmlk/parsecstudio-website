import { useEffect, useState, type CSSProperties } from "react";
import { Site, type SiteMode } from "./site/Site";

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

export function App() {
  const [v, setV] = useState(measure);
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
        <Site key={v.mode} mode={v.mode} />
      </div>
    </div>
  );
}
