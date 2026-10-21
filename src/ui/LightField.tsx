import { useEffect, useRef, type CSSProperties } from "react";

/**
 * The cut, rendered live (WebGL). One warm 3500K arc along the rim of a dark plane, bloom, haze, film grain.
 * mode "horizon": dark dome below, light rises above (Horizon plate).
 * mode "cut": dark plane above, light escapes underneath (The cut plate).
 * Falls back to a still plate when WebGL is unavailable. Pauses when off-screen.
 */
export interface LightParams {
  /** Arc apex height, 0 (bottom) … 1 (top). */
  y: number;
  /** Radius of the dome in frame heights: larger = flatter arc. */
  radius: number;
  /** Visible half-span of the arc, 0.2 … 1.4 (1 = full width). */
  span: number;
  /** Light strength, 0 … 2. */
  intensity: number;
  /** Warm haze above the line, 0 … 1.5. */
  haze: number;
  /** Where the arc is brightest, 0 (left) … 1 (right). */
  hot: number;
  /** Line thickness in px (core). */
  core: number;
  /** Film grain amount, 0 … 0.12. */
  grain: number;
  /** Colour temperature in kelvin, 2800 … 5600. */
  kelvin: number;
}

export const LIGHT_DEFAULTS: LightParams = { y: 0.36, radius: 2.4, span: 0.92, intensity: 1, haze: 0.8, hot: 0.56, core: 1.2, grain: 0.03, kelvin: 3500 };

const VERT = `attribute vec2 a; void main(){ gl_Position = vec4(a, 0.0, 1.0); }`;

const FRAG = `
precision highp float;
uniform vec2 uRes;
uniform float uTime;
uniform float uY, uRadius, uSpan, uIntensity, uHaze, uHot, uCore, uGrain, uFlip;
uniform vec3 uWarm, uCoreCol;

float hash(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float vnoise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash(i), b = hash(i + vec2(1.0, 0.0)), c = hash(i + vec2(0.0, 1.0)), d = hash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
float fbm(vec2 p){ float v = 0.0, a = 0.5; for (int i = 0; i < 4; i++) { v += a * vnoise(p); p = p * 2.03 + vec2(1.7, 9.2); a *= 0.5; } return v; }

void main(){
  vec2 uv = gl_FragCoord.xy / uRes;
  if (uFlip > 0.5) uv.y = 1.0 - uv.y;
  float aspect = uRes.x / uRes.y;
  vec2 p = vec2((uv.x - 0.5) * aspect, uv.y);

  vec2 c = vec2(0.0, uY - uRadius);
  float d = length(p - c) - uRadius;          // > 0 above the rim, < 0 inside the dome
  float px = 1.0 / uRes.y;

  // brightness along the rim: a soft peak at the hotspot, ends fade to nothing
  float xs = p.x / max(0.05, uSpan * aspect * 0.5);
  float ax = xs - (uHot - 0.5) * 1.3;
  float along = exp(-ax * ax * 1.35);
  float ends = 1.0 - smoothstep(0.25, 1.1, abs(xs));
  float prof = along * ends;
  float hprof = exp(-ax * ax * 2.2) * (1.0 - smoothstep(0.1, 1.0, abs(xs)));

  float above = step(0.0, d);
  float dc = d / (uCore * px);
  float core = exp(-dc * dc);
  float bloomN = exp(-abs(d) / (6.0 * px));
  float bloomW = exp(-abs(d) / (26.0 * px));
  float occl = mix(0.12, 1.0, above);          // the dark plane hides the light under the rim

  // haze: rises from the rim, breaks up like real smoke
  float t = uTime * 0.035;
  float smoke = fbm(vec2(p.x * 3.2 + t, max(d, 0.0) * 5.5 - t * 1.6));
  float smoke2 = fbm(vec2(p.x * 7.0 - t * 1.3, max(d, 0.0) * 11.0 + 3.0));
  float rise = exp(-max(d, 0.0) / 0.085) * smoothstep(-0.002, 0.012, d);
  float riseW = exp(-max(d, 0.0) / 0.22) * smoothstep(0.0, 0.05, d);
  float hz = rise * mix(0.45, 1.25, smoke) + riseW * 0.22 * mix(0.3, 1.2, smoke2);

  vec3 col = vec3(0.034, 0.034, 0.039);
  // dome: deep satin black, a faint sheen just under the rim
  float inside = 1.0 - above;
  col *= mix(1.0, 0.72, inside);
  col += vec3(0.05, 0.044, 0.038) * inside * exp(d / 0.018) * prof;

  float I = uIntensity * (0.97 + 0.03 * sin(uTime * 0.5));
  col += uWarm * hz * 0.32 * uHaze * hprof * I;
  col += uWarm * (bloomN * 0.55 + bloomW * 0.12) * prof * occl * I;
  col += uCoreCol * core * prof * I * 1.6;

  // filmic shoulder, grain, vignette
  col = vec3(1.0) - exp(-col * 1.4);
  // static fine grain (also dithers the gradients): no per-frame noise, so nothing flickers
  float g = (hash(gl_FragCoord.xy) + hash(gl_FragCoord.xy + 71.3) - 1.0) * 0.5;
  col += g * uGrain;
  vec2 q = uv - 0.5;
  col *= 1.0 - dot(q, q) * 0.6;
  gl_FragColor = vec4(max(col, 0.0), 1.0);
}`;

/** Approximate blackbody tint (normalised) for 2800–5600 K, tuned so 3500 K ≈ #F6C88C. */
export function kelvinRGB(k: number): [number, number, number] {
  const t = Math.max(0, Math.min(1, (k - 2800) / 2800));
  const a: [number, number, number] = [0.98, 0.70, 0.43];   // 2800 K
  const m: [number, number, number] = [0.965, 0.784, 0.549]; // 3500 K
  const b: [number, number, number] = [0.98, 0.93, 0.86];   // 5600 K
  const tm = 0.25;
  if (t <= tm) { const u = t / tm; return [a[0] + (m[0] - a[0]) * u, a[1] + (m[1] - a[1]) * u, a[2] + (m[2] - a[2]) * u]; }
  const u = (t - tm) / (1 - tm); return [m[0] + (b[0] - m[0]) * u, m[1] + (b[1] - m[1]) * u, m[2] + (b[2] - m[2]) * u];
}

export function LightField({
  params, mode = "horizon", follow = false, fallback = "img/plates/horizon.jpg", className, style, still,
}: {
  params?: Partial<LightParams>;
  mode?: "horizon" | "cut";
  /** Hotspot drifts towards the pointer. */
  follow?: boolean;
  fallback?: string;
  className?: string;
  style?: CSSProperties;
  /** Render one frame only (no animation). */
  still?: boolean;
}) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const boxRef = useRef<HTMLDivElement | null>(null);
  const pRef = useRef<LightParams>({ ...LIGHT_DEFAULTS, ...params });
  const failRef = useRef(false);

  // keep latest params without re-initialising GL
  pRef.current = { ...LIGHT_DEFAULTS, ...params };

  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    // a fresh canvas per mount: a context lost in cleanup can never be reused
    const canvas = document.createElement("canvas");
    canvas.className = "lightfield__canvas";
    canvas.setAttribute("aria-hidden", "true");
    box.appendChild(canvas);
    ref.current = canvas;
    const gl = canvas.getContext("webgl", { antialias: false, alpha: false, premultipliedAlpha: false, powerPreference: "high-performance" });
    if (!gl) { failRef.current = true; box.dataset.fallback = "1"; canvas.remove(); return; }
    delete box.dataset.fallback;

    const sh = (type: number, src: string) => {
      const s = gl.createShader(type)!; gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) console.warn("LightField shader:", gl.getShaderInfoLog(s));
      return s;
    };
    const prog = gl.createProgram()!;
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) { box.dataset.fallback = "1"; canvas.remove(); return; }
    gl.useProgram(prog);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, "a");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const U = (n: string) => gl.getUniformLocation(prog, n);
    const u = {
      res: U("uRes"), time: U("uTime"), y: U("uY"), radius: U("uRadius"), span: U("uSpan"), intensity: U("uIntensity"),
      haze: U("uHaze"), hot: U("uHot"), core: U("uCore"), grain: U("uGrain"), flip: U("uFlip"), warm: U("uWarm"), coreCol: U("uCoreCol"),
    };

    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    let raf = 0, visible = true, t0 = performance.now(), hot = pRef.current.hot, target = pRef.current.hot, dpr = 1;

    const resize = () => {
      const r = box.getBoundingClientRect();
      const base = Math.min(window.devicePixelRatio || 1, 1.5);
      const maxPx = 2_600_000;
      dpr = Math.min(base, Math.sqrt(maxPx / Math.max(1, r.width * r.height)));
      canvas.width = Math.max(2, Math.round(r.width * dpr));
      canvas.height = Math.max(2, Math.round(r.height * dpr));
      gl.viewport(0, 0, canvas.width, canvas.height);
    };

    const draw = (now: number) => {
      const p = pRef.current;
      if (!follow) target = p.hot;
      hot += (target - hot) * 0.035;
      const w = kelvinRGB(p.kelvin);
      const c = kelvinRGB(Math.min(5600, p.kelvin + 1700));
      gl.uniform2f(u.res, canvas.width, canvas.height);
      gl.uniform1f(u.time, (now - t0) / 1000);
      gl.uniform1f(u.y, p.y); gl.uniform1f(u.radius, p.radius); gl.uniform1f(u.span, p.span);
      gl.uniform1f(u.intensity, p.intensity); gl.uniform1f(u.haze, p.haze); gl.uniform1f(u.hot, follow ? hot : p.hot);
      gl.uniform1f(u.core, p.core * dpr); gl.uniform1f(u.grain, p.grain); gl.uniform1f(u.flip, mode === "cut" ? 1 : 0);
      gl.uniform3f(u.warm, w[0], w[1], w[2]);
      gl.uniform3f(u.coreCol, Math.min(1, c[0] + 0.02), Math.min(1, c[1] + 0.08), Math.min(1, c[2] + 0.2));
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };

    const loop = (now: number) => {
      draw(now);
      if (visible && !reduce && !still) raf = requestAnimationFrame(loop);
    };

    resize();
    draw(performance.now());
    const ro = new ResizeObserver(() => { resize(); draw(performance.now()); });
    ro.observe(box);
    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
      cancelAnimationFrame(raf);
      if (visible && !reduce && !still) raf = requestAnimationFrame(loop);
    });
    io.observe(box);
    const onMove = (e: PointerEvent) => {
      if (!follow) return;
      const r = box.getBoundingClientRect();
      target = Math.max(0.1, Math.min(0.9, (e.clientX - r.left) / r.width));
      if (reduce || still) { hot = target; draw(performance.now()); }
    };
    window.addEventListener("pointermove", onMove);
    const onVis = () => { if (document.hidden) cancelAnimationFrame(raf); else if (visible && !reduce && !still) raf = requestAnimationFrame(loop); };
    document.addEventListener("visibilitychange", onVis);
    // redraw when params change in still/reduced mode
    const iv = (reduce || still) ? window.setInterval(() => draw(performance.now()), 120) : 0;

    return () => {
      cancelAnimationFrame(raf); ro.disconnect(); io.disconnect();
      window.removeEventListener("pointermove", onMove);
      document.removeEventListener("visibilitychange", onVis);
      if (iv) window.clearInterval(iv);
      gl.getExtension("WEBGL_lose_context")?.loseContext();
      canvas.remove();
    };
  }, [mode, follow, still]);

  return (
    <div ref={boxRef} className={`lightfield${className ? ` ${className}` : ""}`} style={style}>
      <img className="lightfield__fallback" src={fallback} alt="" aria-hidden />
    </div>
  );
}
