import { useEffect, useState, type ComponentType } from "react";
import type { SceneProps } from "./types";
import { SceneCut } from "./SceneCut";
import { ScenePrism } from "./ScenePrism";
import { SceneEpisodes } from "./SceneEpisodes";

/* The services stage: one live scene behind the list, one per line of the studio.
     0  Motion, 3D & CGI  — SceneCut:      light makes the form; the cut finds a product in the dark
     1  AI Production     — ScenePrism:    one light in, many out; Ember through a prism
     2  Vertical Series   — SceneEpisodes: the cut stands up; 9:16 frames of light, one after another
   Changing scene: the old one softens out, the new one comes into focus (blur + fade, as everywhere). */

const SCENES: ComponentType<SceneProps>[] = [SceneCut, ScenePrism, SceneEpisodes];

export function SvcStage({ active, mode }: { active: number; mode: "desk" | "mob" }) {
  const [seen, setSeen] = useState<boolean[]>(() => SCENES.map(() => false));
  useEffect(() => {
    if (active < 0) return;
    setSeen((s) => (s[active] ? s : s.map((v, i) => v || i === active)));
  }, [active]);
  return (
    <div className="st-stage" aria-hidden>
      {SCENES.map((Scene, i) => (
        <div key={i} className={`st-stage__scene${i === active ? " is-on" : ""}`}>
          {seen[i] && <Scene on={i === active} mode={mode} />}
        </div>
      ))}
      <i className="st-stage__shade" />
    </div>
  );
}
