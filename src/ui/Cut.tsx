import { useId, type CSSProperties } from "react";

/**
 * The cut — the arc of light from the logo. It glows (core + bloom), it is never an outline.
 * One warm arc per screen; a second one goes steel (`steel` prop).
 */
export function CutArc({
  width = 64, bend = 8, intensity = 1, steel, stroke = 1.5, style, className,
}: { width?: number; bend?: number; intensity?: number; steel?: boolean; stroke?: number; style?: CSSProperties; className?: string }) {
  const id = useId().replace(/:/g, "");
  const h = Math.max(4, bend + 4);
  const d = `M0 2 Q${width / 2} ${2 + bend * 2} ${width} 2`;
  const core = steel ? "#B9C7D4" : "#FFF1D6";
  const bloom = steel ? "#9DB0C2" : "#F6C88C";
  return (
    <svg className={className} width={width} height={h} viewBox={`0 0 ${width} ${h}`} preserveAspectRatio="none" style={{ overflow: "visible", ...style }} aria-hidden>
      <defs>
        <filter id={`b${id}`} x="-20%" y="-600%" width="140%" height="1300%"><feGaussianBlur stdDeviation={2.2 + stroke * 0.4} /></filter>
        <linearGradient id={`g${id}`} x1="0" x2="1">
          <stop offset="0" stopColor={core} stopOpacity="0" />
          <stop offset=".24" stopColor={core} />
          <stop offset=".76" stopColor={core} />
          <stop offset="1" stopColor={core} stopOpacity="0" />
        </linearGradient>
        <linearGradient id={`h${id}`} x1="0" x2="1">
          <stop offset="0" stopColor={bloom} stopOpacity="0" />
          <stop offset=".3" stopColor={bloom} />
          <stop offset=".7" stopColor={bloom} />
          <stop offset="1" stopColor={bloom} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={d} fill="none" stroke={`url(#h${id})`} strokeWidth={stroke * 3.2} opacity={0.8 * intensity} filter={`url(#b${id})`} vectorEffect="non-scaling-stroke" />
      <path d={d} fill="none" stroke={`url(#g${id})`} strokeWidth={stroke} strokeLinecap="round" opacity={intensity} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/** A straight line of light (horizon line): bright centre, ends fade. For dividers between big sections — one per page. */
export function LightLine({ intensity = 1, steel, style, className }: { intensity?: number; steel?: boolean; style?: CSSProperties; className?: string }) {
  return <span className={`light-line${steel ? " light-line--steel" : ""}${className ? ` ${className}` : ""}`} style={{ opacity: intensity, ...style }} aria-hidden />;
}

/** Progress = length of the arc. Steel track; light fills it left to right. */
export function CutProgress({ value, width = 240, bend = 5, steel, style, className }: { value: number; width?: number; bend?: number; steel?: boolean; style?: CSSProperties; className?: string }) {
  const id = useId().replace(/:/g, "");
  const v = Math.max(0, Math.min(100, value));
  const h = bend * 2 + 8;
  const d = `M2 4 Q${width / 2} ${4 + bend * 2} ${width - 2} 4`;
  const fill = (v / 100) * width;
  const core = steel ? "#B9C7D4" : "#FFF1D6";
  return (
    <svg className={className} width="100%" height={h} viewBox={`0 0 ${width} ${h}`} preserveAspectRatio="none" style={{ overflow: "visible", ...style }} aria-hidden>
      <defs>
        <filter id={`p${id}`} x="-10%" y="-600%" width="120%" height="1300%"><feGaussianBlur stdDeviation="2.2" /></filter>
        <clipPath id={`c${id}`}><rect x="-6" y="-12" width={fill + 6} height={h + 24} /></clipPath>
        <linearGradient id={`g${id}`} gradientUnits="userSpaceOnUse" x1="0" x2={Math.max(fill, 1)}>
          <stop offset="0" stopColor={core} stopOpacity=".35" />
          <stop offset=".8" stopColor={core} />
          <stop offset="1" stopColor={core} stopOpacity=".55" />
        </linearGradient>
      </defs>
      <path d={d} fill="none" stroke="rgba(157,176,194,.2)" strokeWidth={1.1} vectorEffect="non-scaling-stroke" />
      {v > 0 && (
        <g clipPath={`url(#c${id})`}>
          <path d={d} fill="none" stroke={steel ? "#9DB0C2" : "#F6C88C"} strokeWidth={4} opacity={steel ? 0.35 : 0.7} filter={`url(#p${id})`} vectorEffect="non-scaling-stroke" />
          <path d={d} fill="none" stroke={`url(#g${id})`} strokeWidth={1.5} strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        </g>
      )}
    </svg>
  );
}

/** Loader: the arc opens from the centre and fades, 1.2 s loop. Static under reduced motion. */
export function CutLoader({ width = 72, style }: { width?: number; style?: CSSProperties }) {
  return (
    <span className="cut-loader" style={{ width, ...style }} role="status" aria-label="Loading">
      <CutArc width={width} bend={4} />
    </span>
  );
}

/** Marker: a short arc under the current item (scene, step, active tab). */
export function CutMarker({ width = 28, style, steel }: { width?: number; style?: CSSProperties; steel?: boolean }) {
  return <CutArc width={width} bend={2.5} stroke={1.3} steel={steel} style={style} />;
}
