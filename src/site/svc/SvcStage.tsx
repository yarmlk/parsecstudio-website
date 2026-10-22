import { useEffect, useRef, useState } from "react";
import { MOTION_VARS, ScenePrism, type MotionVar } from "./ScenePrism";

/* The services stage: one live scene behind the list, the prism at the centre of the section. The active service
   decides what the light does (ScenePrism). The scene is mounted ahead of time, when the section comes within about
   a window of the screen, so its large shader compiles (in the background where the browser can) before anyone
   arrives; it only starts drawing once a service is on, and fades in with its first frame. Then it is kept. */
export function SvcStage({ active, mode }: { active: number; mode: "desk" | "mob" }) {
  const [seen, setSeen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => { if (active >= 0) setSeen(true); }, [active]);
  useEffect(() => {
    const el = ref.current;
    if (!el || seen) return;
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) setSeen(true); }, { rootMargin: "100% 0px 100% 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, [seen]);
  return (
    <div ref={ref} className="st-stage" aria-hidden>
      <div className={`st-stage__scene${active >= 0 ? " is-on" : ""}`}>
        {seen && <ScenePrism active={active} mode={mode} />}
      </div>
      <i className="st-stage__shade" />
      {import.meta.env.DEV && <MotionSwitch />}
    </div>
  );
}

/** dev only: which object Motion shows, to compare on localhost (remembered in this browser) */
function MotionSwitch() {
  const [v, setV] = useState<MotionVar>(() => {
    let x: MotionVar = "shards";
    try { x = (localStorage.getItem("st-motion") as MotionVar) || x; } catch { /* no storage */ }
    window.__stMotion = x;
    return x;
  });
  const pick = (x: MotionVar) => { setV(x); window.__stMotion = x; try { localStorage.setItem("st-motion", x); } catch { /* no storage */ } };
  return (
    <div className="st-dev-switch" aria-hidden>
      Motion:
      {MOTION_VARS.map((x) => <button key={x} type="button" className={x === v ? "is-on" : undefined} onClick={() => pick(x)}>{x}</button>)}
    </div>
  );
}
