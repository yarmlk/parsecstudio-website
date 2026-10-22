import { useEffect, useState } from "react";
import { CASES } from "../cases";
import { useReduced } from "../ui";

/* "Selected works" under the headline: a frosted capsule with a small window in it where the works themselves pass by,
   one still after another, slowly. On hover the window opens wider and the capsule's edge catches the warm light.
   A click goes down to the cases. Reduced motion: one still, no passing. */

/** the stills that pass in the window: each case's own poster, in the row's order */
const STILLS = CASES.map((c) => ({ src: c.film?.poster ?? c.stills[0].src, pos: c.poster }));
const HOLD = 2600; // ms each still stays

export function WorksPill({ onGo }: { onGo: () => void }) {
  const reduced = useReduced();
  const [i, setI] = useState(0);
  // the stills come in only once the page has settled, one ahead of the one on show
  const [warm, setWarm] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setWarm(true), 1600);
    return () => clearTimeout(t);
  }, []);
  useEffect(() => {
    if (reduced || !warm) return;
    const t = setInterval(() => setI((x) => (x + 1) % STILLS.length), HOLD);
    return () => clearInterval(t);
  }, [reduced, warm]);
  const shown = warm ? [i, (i + 1) % STILLS.length] : [0];

  return (
    <button type="button" className="wp" onClick={onGo} aria-label="Selected works: go to the cases">
      <span className="wp__win" aria-hidden>
        {STILLS.map((s, k) => (shown.includes(k) || k === (i + STILLS.length - 1) % STILLS.length) && (
          <img key={s.src} src={s.src} alt="" decoding="async" className={k === i ? "is-on" : undefined} style={{ objectPosition: s.pos }} />
        ))}
      </span>
      <span className="wp__l">Selected works</span>
      <span className="wp__go" aria-hidden>
        <svg width="14" height="14" viewBox="0 0 14 14"><path d="M2 7h9M7.5 3.2 11.3 7l-3.8 3.8" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </span>
    </button>
  );
}
