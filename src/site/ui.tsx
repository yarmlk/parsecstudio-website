import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from "react";
import { useLang } from "../lib/i18n";
import { CutArc } from "../ui/Cut";

/* ── Media queries ───────────────────────────────────────── */
function useMedia(q: string) {
  const [m, setM] = useState(() => (typeof window !== "undefined" ? !!window.matchMedia?.(q).matches : false));
  useEffect(() => {
    const mq = window.matchMedia?.(q);
    if (!mq) return;
    const on = () => setM(mq.matches);
    on();
    mq.addEventListener?.("change", on);
    return () => mq.removeEventListener?.("change", on);
  }, [q]);
  return m;
}
/** True at the book's narrow breakpoint (pages scroll, columns stack). */
export const useNarrow = () => useMedia("(max-width: 900px)");
export const useReduced = () => useMedia("(prefers-reduced-motion: reduce)");

/* ── The cut as a travelling marker ─────────────────────────
   Measures the active item's text in layout px (offsetLeft/offsetWidth), so it stays correct inside a
   Scaler transform. Width = text, travels in 320 ms (the Nav role of the cut). With no active item the cut
   fades out where it was, so it never sweeps in from the corner. */
export type CutPos = { x: number; y: number; w: number };
export function useCutTrack(active: number, deps: unknown[] = []) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState<CutPos | null>(null);
  const [hidden, setHidden] = useState(true);
  const [ready, setReady] = useState(false);
  const { lang } = useLang();
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const t = active >= 0 ? el.querySelectorAll<HTMLElement>("[data-cut-t]")[active] : undefined;
      if (!t) { setHidden(true); return; }
      let x = 0, y = 0;
      let n: HTMLElement | null = t;
      while (n && n !== el) { x += n.offsetLeft; y += n.offsetTop; n = n.offsetParent as HTMLElement | null; }
      setPos({ x, y: y + t.offsetHeight, w: t.offsetWidth });
      setHidden(false);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    el.querySelectorAll("[data-cut-t]").forEach((n) => ro.observe(n));
    document.fonts?.ready.then(measure).catch(() => {});
    const raf = requestAnimationFrame(() => requestAnimationFrame(() => setReady(true)));
    return () => { ro.disconnect(); cancelAnimationFrame(raf); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, lang, ...deps]);
  return { ref, pos, ready: ready && !!pos, hidden };
}

export function CutLine({ pos, ready, hidden, steel, gap = 7, bend = 2.4 }: { pos: CutPos | null; ready: boolean; hidden?: boolean; steel?: boolean; gap?: number; bend?: number }) {
  return (
    <span
      className={`st-cut${ready ? " is-ready" : ""}`}
      style={{ transform: `translate(${pos?.x ?? 0}px, ${(pos?.y ?? 0) + gap}px)`, width: pos?.w ?? 0, opacity: pos && !hidden ? 1 : 0 }}
      aria-hidden
    >
      <CutArc width={100} bend={bend} stroke={1.35} steel={steel} style={{ width: "100%" }} />
    </span>
  );
}

/** Text tabs with the cut travelling under the active one. Arrow keys move between tabs. */
export function StTabs<T extends string>({
  items, value, onChange, steel = true, label, className, style,
}: {
  items: { id: T; label: ReactNode; meta?: ReactNode }[];
  value: T;
  onChange: (v: T) => void;
  steel?: boolean;
  label: string;
  className?: string;
  style?: CSSProperties;
}) {
  const active = Math.max(0, items.findIndex((i) => i.id === value));
  const { ref, pos, ready, hidden } = useCutTrack(active, [items.length]);
  const vertical = !!className?.includes("st-tabs--v");
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const fwd = vertical ? "ArrowDown" : "ArrowRight";
    const back = vertical ? "ArrowUp" : "ArrowLeft";
    if (e.key !== fwd && e.key !== back) return;
    e.preventDefault();
    const n = (active + (e.key === fwd ? 1 : items.length - 1)) % items.length;
    onChange(items[n].id);
    requestAnimationFrame(() => ref.current?.querySelectorAll<HTMLButtonElement>("[role=tab]")[n]?.focus());
  };
  return (
    <div ref={ref} className={`st-tabs${className ? ` ${className}` : ""}`} style={style} role="tablist" aria-label={label} aria-orientation={vertical ? "vertical" : "horizontal"} data-own-keys="" onKeyDown={onKey}>
      {items.map((it) => {
        const on = it.id === value;
        return (
          <button key={it.id} type="button" role="tab" aria-selected={on} tabIndex={on ? 0 : -1} className={`st-tab${on ? " is-on" : ""}`} onClick={() => onChange(it.id)}>
            <span data-cut-t="">{it.label}</span>
            {it.meta != null && <span className="st-tab__meta t-data">{it.meta}</span>}
          </button>
        );
      })}
      <CutLine pos={pos} ready={ready} hidden={hidden} steel={steel} gap={vertical ? 2 : 4} />
    </div>
  );
}

/** Index as an arcsecond: 1 → "01″". */
export const arc = (n: number) => `${String(n).padStart(2, "0")}″`;
