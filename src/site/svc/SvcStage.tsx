import { useEffect, useState } from "react";
import { ScenePrism } from "./ScenePrism";

/* The services stage: one live scene behind the list, the prism at the centre of the section. The active service
   decides what the light does (ScenePrism): Motion and Vertical throw a frame of warm light with a film in it, AI
   parts it into the spectrum. Mounted the first time the section is in play, then kept. */
export function SvcStage({ active, mode }: { active: number; mode: "desk" | "mob" }) {
  const [seen, setSeen] = useState(false);
  useEffect(() => { if (active >= 0) setSeen(true); }, [active]);
  return (
    <div className="st-stage" aria-hidden>
      <div className={`st-stage__scene${active >= 0 ? " is-on" : ""}`}>
        {seen && <ScenePrism active={active} mode={mode} />}
      </div>
      <i className="st-stage__shade" />
    </div>
  );
}
