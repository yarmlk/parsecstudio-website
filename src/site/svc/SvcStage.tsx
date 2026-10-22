import { useEffect, useRef, useState } from "react";
import { ScenePrism } from "./ScenePrism";

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
    </div>
  );
}
