import { useEffect, useRef, useState } from "react";
import { ScenePrism, VARIANTS, VARIANTS_ON, type Variants } from "./ScenePrism";

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
      {VARIANTS_ON && <VariantSwitch />}
    </div>
  );
}

/** localhost and the review preview only: which alternative each service shows (remembered in this browser) */
function VariantSwitch() {
  const [v, setV] = useState<Variants>(() => {
    let x: Variants = { vertical: VARIANTS.vertical[0] };
    try {
      const saved = JSON.parse(localStorage.getItem("st-variants") || "{}") as Partial<Record<keyof Variants, string>>;
      (Object.keys(VARIANTS) as (keyof Variants)[]).forEach((k) => { const v = saved[k]; if (v && (VARIANTS[k] as readonly string[]).includes(v)) x = { ...x, [k]: v } as Variants; });
    } catch { /* no storage */ }
    window.__stVar = x;
    return x;
  });
  const pick = (k: keyof Variants, x: string) => {
    const nv = { ...v, [k]: x } as Variants;
    setV(nv); window.__stVar = nv;
    try { localStorage.setItem("st-variants", JSON.stringify(nv)); } catch { /* no storage */ }
  };
  return (
    <div className="st-dev-switch" aria-hidden>
      {(Object.keys(VARIANTS) as (keyof Variants)[]).map((k) => (
        <span key={k} className="st-dev-switch__row">
          Vertical
          {VARIANTS[k].map((x) => <button key={x} type="button" className={x === v[k] ? "is-on" : undefined} onClick={() => pick(k, x)}>{x}</button>)}
        </span>
      ))}
    </div>
  );
}
