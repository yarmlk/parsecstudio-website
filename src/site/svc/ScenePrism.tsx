import { useEffect, useRef } from "react";
import { kelvinRGB } from "../../ui/LightField";
import type { SceneProps } from "./types";
import { PRISM_FRAG, PRISM_VERT } from "./ScenePrism.glsl";
import { add, cross, lookCam, makePrism, mul, norm, traceBeam, type V3 } from "./ScenePrism.optics";

/* AI Production — "one light in, many out". The cover's thin 3500 K beam comes up out of the dark on the left, meets a
   real glass prism standing on the satin-black floor and leaves it parted into the AI spectrum (Ember → Rose → Violet →
   Blue → Mint); the fan falls onto the floor and lands there as a soft, grainy field of coloured light. The pointer turns
   the prism a few degrees with the cover's inertia: the fan sweeps, the colours shift across the floor. At rest only the
   haze breathes. The optics are solved for real (Snell, Fresnel, dispersion) in ScenePrism.optics.ts; the picture is one
   fragment shader, ScenePrism.glsl.ts. */

const DEG = Math.PI / 180;
const hex = (h: string): V3 => [parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255];
const SPECTRUM = ["#F6C88C", "#F0A98E", "#C9A0DC", "#93B1D6", "#9FD6CC"].map(hex);
/** refractive index per colour of the light (dispersion exaggerated ~10× over dense flint so the fan reads at this scale) */
const N_LIGHT = [1.45, 1.5125, 1.575, 1.6375, 1.7];
/** index per channel for what is seen through the glass (a modest, real-looking fringe) */
const N_VIEW: V3 = [1.505, 1.517, 1.532];

interface Shot {
  /** camera position, what it looks at, vertical field of view (deg), lens shift (in half-heights) */
  cam: V3; target: V3; fov: number; shift: [number, number];
  /** prism circumradius and height; its turn (deg) and how far the pointer turns it either way */
  R: number; H: number; rot0: number; rotAmp: number;
  /** the beam: heading in the floor plane (deg, + = away from the camera), descent, height where it meets the glass */
  head: number; slope: number; hb: number;
  /** overall exposure (the phone is softer), fan in the air, landing field, haze along the beam, the room's sheen */
  gain: number; fanGain: number; landGain: number; haze: number; env: number;
  /** how far left the beam starts (world units before the glass) */
  beamLen: number;
  /** chroma of the spectrum as light (1 = the brand swatches as they are; the hues never change) */
  sat: number;
  /** absorption of the dark-tinted glass per unit length; edge rounding */
  tint: V3; bevel: number;
  /** the beam is dark this far from the glass and full this close (world units) */
  beamFade: [number, number];
  /** how quickly the fan fades in the air (world units); how strongly the floor mirrors it */
  airFan: number; fanRefl: number;
  /** the fan's angular softness (rad per unit), the landing field's extra softness and its footprint growth */
  fanBlur: number; poolSoft: number; poolTh: number;
}
const SHOTS: Record<SceneProps["mode"], Shot> = {
  desk: {
    cam: [0, 6.0, -4.2], target: [0, 0.3, 0], fov: 23, shift: [0.62, -0.1],
    R: 0.32, H: 0.75, rot0: 20, rotAmp: 4, head: 10, slope: 0.32, hb: 0.35,
    gain: 1, fanGain: 1, landGain: 9, haze: 1, env: 1.6, beamLen: 5, sat: 1.8, tint: [1.25, 1.32, 1.45], bevel: 0.0065,
    beamFade: [2.0, 0.7], airFan: 0.45, fanRefl: 0.4, fanBlur: 0.06, poolSoft: 2.0, poolTh: 0.05,
  },
  mob: {
    cam: [0, 7.4, -5.2], target: [0, 0.3, 0], fov: 42, shift: [-0.04, 0.2],
    R: 0.32, H: 0.75, rot0: 10, rotAmp: 4, head: 0, slope: 0.32, hb: 0.35,
    gain: 0.85, fanGain: 0.85, landGain: 8, haze: 0.85, env: 1.6, beamLen: 5, sat: 1.8, tint: [1.25, 1.32, 1.45], bevel: 0.0065,
    beamFade: [1.6, 0.5], airFan: 0.45, fanRefl: 0.4, fanBlur: 0.07, poolSoft: 2.2, poolTh: 0.04,
  },
};

/** cubic-bezier(x1, y1, x2, y2) easing at x (CSS semantics). */
function bezier(x1: number, y1: number, x2: number, y2: number) {
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
  const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  return (x: number) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let t = x;
    for (let i = 0; i < 6; i++) {
      const fx = ((ax * t + bx) * t + cx) * t - x;
      const d = (3 * ax * t + 2 * bx) * t + cx;
      if (Math.abs(d) < 1e-6) break;
      t = Math.min(1, Math.max(0, t - fx / d));
    }
    return ((ay * t + by) * t + cy) * t;
  };
}
/** --ease-enter */
const easeEnter = bezier(0.2, 0.7, 0.1, 1);
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const sstep = (a: number, b: number, x: number) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };

/** the spectrum as light: more chroma (same hues; Ember, our own light, stays closest to itself), every colour at the
 *  same luminance so the field has no blotches */
function lightStops(sat: number): V3[] {
  return SPECTRUM.map((col, i) => {
    const k = Math.max(col[0], col[1], col[2]);
    const e = i === 0 ? 1 + (sat - 1) * 0.4 : sat;
    const c: V3 = [Math.pow(col[0] / k, e) * k, Math.pow(col[1] / k, e) * k, Math.pow(col[2] / k, e) * k];
    return mul(c, 0.62 / (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]));
  });
}

/** Gaussian-blurred spectrum, s along x (-0.75 … 1.75), the bundle's width w down y (0 … 2.4); stored ÷ 1.6. */
const LUT_W = 256, LUT_H = 32;
function spectrumLUT(stops: V3[], core: V3): Uint8Array {
  const spec = (s: number): V3 => {
    const x = clamp01(s) * 4;
    let c = stops[0];
    for (let i = 1; i < 5; i++) { const t = sstep(i - 1, i, x); c = [c[0] + (stops[i][0] - c[0]) * t, c[1] + (stops[i][1] - c[1]) * t, c[2] + (stops[i][2] - c[2]) * t]; }
    return c;
  };
  const avg = stops.reduce((a, c) => add(a, mul(c, 0.2)), [0, 0, 0] as V3);
  const white: V3 = [avg[0] + (core[0] - avg[0]) * 0.35, avg[1] + (core[1] - avg[1]) * 0.35, avg[2] + (core[2] - avg[2]) * 0.35];
  const out = new Uint8Array(LUT_W * LUT_H * 4);
  for (let j = 0; j < LUT_H; j++) {
    const w = (2.4 * j) / (LUT_H - 1), sig = Math.max(1e-4, 0.45 * w), mixW = sstep(0.5, 2.0, w);
    for (let i = 0; i < LUT_W; i++) {
      const s = -0.75 + (2.5 * i) / (LUT_W - 1);
      let c: V3 = [0, 0, 0], ws = 0;
      for (let k = -12; k <= 12; k++) {
        const x = (k / 12) * 2.5 * sig, g = Math.exp(-0.5 * (x / sig) ** 2);
        c = add(c, mul(spec(s + x), g)); ws += g;
      }
      c = mul(c, 1 / ws);
      const o = (j * LUT_W + i) * 4;
      for (let ch = 0; ch < 3; ch++) out[o + ch] = Math.round(255 * Math.min(1, (c[ch] + (white[ch] - c[ch]) * mixW) / 1.6));
      out[o + 3] = 255;
    }
  }
  return out;
}

declare global {
  interface Window {
    /** debug: freeze the scene's clock at this many seconds after it turned on (also snaps the pointer) */
    __stSceneT?: number;
    /** debug: pointer position over the scene, -1 (left) … 1 (right) */
    __stPrismPx?: number;
    /** debug: override any of the shot's settings live */
    __stPrismDbg?: Partial<Shot>;
  }
}

export function ScenePrism({ on, mode }: SceneProps) {
  const boxRef = useRef<HTMLDivElement | null>(null);
  const onRef = useRef(on);
  const wakeRef = useRef<(() => void) | null>(null);
  onRef.current = on;

  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    // a fresh canvas per mount: a context lost in cleanup can never be reused
    const canvas = document.createElement("canvas");
    canvas.setAttribute("aria-hidden", "true");
    canvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%;display:block";
    box.appendChild(canvas);
    const gl = canvas.getContext("webgl", { antialias: false, alpha: false, premultipliedAlpha: false, powerPreference: "high-performance" });
    if (!gl) { canvas.remove(); return; }
    const deriv = !!gl.getExtension("OES_standard_derivatives");

    const sh = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) console.warn("ScenePrism shader:", gl.getShaderInfoLog(s));
      return s;
    };
    const prog = gl.createProgram()!;
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, PRISM_VERT));
    gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, (deriv ? "#extension GL_OES_standard_derivatives : enable\n#define DERIV\n" : "") + PRISM_FRAG));
    gl.linkProgram(prog);
    // WebGL failure: render nothing, the stage stays dark
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) { console.warn("ScenePrism link:", gl.getProgramInfoLog(prog)); canvas.remove(); return; }
    gl.useProgram(prog);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, "a");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const U: Record<string, WebGLUniformLocation | null> = {};
    const u = (n: string) => (n in U ? U[n] : (U[n] = gl.getUniformLocation(prog, n)));
    const v3 = (n: string, v: V3) => gl.uniform3f(u(n), v[0], v[1], v[2]);
    const f1 = (n: string, v: number) => gl.uniform1f(u(n), v);

    const warm = kelvinRGB(3500);
    const kc = kelvinRGB(3500 + 1700);
    const coreCol: V3 = [Math.min(1, kc[0] + 0.02), Math.min(1, kc[1] + 0.08), Math.min(1, kc[2] + 0.2)];
    v3("uWarm", warm); v3("uCoreCol", coreCol);
    v3("uEta", N_VIEW);
    f1("uGrain", 0.03);

    const tex = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.uniform1i(u("uSpec"), 0);
    let lutSat = NaN;

    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    let raf = 0, visible = true, running = false, dpr = 1;
    let tOn = performance.now();
    const t0 = performance.now();
    let px = 0, target = 0;

    const resize = () => {
      const r = box.getBoundingClientRect();
      const base = Math.min(window.devicePixelRatio || 1, 1.5);
      dpr = Math.min(base, Math.sqrt(2_600_000 / Math.max(1, r.width * r.height)));
      canvas.width = Math.max(2, Math.round(r.width * dpr));
      canvas.height = Math.max(2, Math.round(r.height * dpr));
      gl.viewport(0, 0, canvas.width, canvas.height);
    };

    const draw = (now: number) => {
      const S: Shot = { ...SHOTS[mode], ...(window.__stPrismDbg ?? {}) };
      const dbgT = window.__stSceneT;
      const frozen = typeof dbgT === "number";
      const since = frozen ? dbgT : reduce ? 10 : (now - tOn) / 1000;
      if (typeof window.__stPrismPx === "number") target = window.__stPrismPx;
      if (frozen || reduce) px = target; else px += (target - px) * 0.035;

      if (S.sat !== lutSat) {
        lutSat = S.sat;
        const stops = lightStops(S.sat);
        stops.forEach((s, i) => v3(`uS${i}`, s));
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, LUT_W, LUT_H, 0, gl.RGBA, gl.UNSIGNED_BYTE, spectrumLUT(stops, coreCol));
      }

      // the light, solved
      const cam = lookCam(S.cam, S.target, S.fov * DEG, S.shift);
      const d0 = norm([Math.cos(S.head * DEG), -S.slope, Math.sin(S.head * DEG)]);
      const origin: V3 = add([0, S.hb, 0], mul(d0, -S.beamLen));
      const P = makePrism([0, 0, 0], S.R, S.H, (S.rot0 + S.rotAmp * px) * DEG);
      const tr = traceBeam(P, origin, d0, N_LIGHT);
      if (!tr) return;
      const valid = tr.rays.filter((r) => r.dir);
      const E = tr.rays[0], M = valid[valid.length - 1] ?? E;
      const dE = E.dir ?? d0, dM = M.dir ?? dE;
      const O: V3 = mul(add(E.out, M.out), 0.5);
      let N = norm(cross(dE, dM));
      if (N[1] < 0) N = mul(N, -1);
      const slope = -dE[1] / Math.hypot(dE[0], dE[2]);
      const land = O[1] / Math.max(slope, 1e-3);
      const kept = valid.length / tr.rays.length;

      // the ignite: the light comes up out of the dark (600 ms), the glass catches it, then the fan blooms out of the
      // prism and its colour settles on the floor
      const iB = easeEnter(clamp01(since / 0.6));
      const beamF = 2.8 - 3.3 * easeEnter(clamp01(since / 0.55));
      const iG = easeEnter(clamp01((since - 0.3) / 0.5));
      const iForm = easeEnter(clamp01((since - 0.1) / 0.8));
      const iF = easeEnter(clamp01((since - 0.6) / 0.9));
      const front = (land + 1.5) * easeEnter(clamp01((since - 0.55) / 1.0));
      const iP = easeEnter(clamp01((since - 0.85) / 1.1));

      gl.uniform2f(u("uRes"), canvas.width, canvas.height);
      f1("uTime", frozen ? 20 + dbgT : (now - t0) / 1000);
      v3("uCamPos", cam.pos); v3("uCamF", cam.f); v3("uCamR", cam.r); v3("uCamU", cam.u);
      f1("uFocal", cam.focal);
      gl.uniform2f(u("uShift"), cam.shift[0], cam.shift[1]);
      f1("uPx", 2 / (canvas.height * cam.focal));
      f1("uCore", 1.2 * dpr);
      const pl = new Float32Array(20);
      for (let i = 0; i < 5; i++) { pl[i * 4] = P.n[i][0]; pl[i * 4 + 1] = P.n[i][1]; pl[i * 4 + 2] = P.n[i][2]; pl[i * 4 + 3] = P.d[i]; }
      gl.uniform4fv(u("uPl[0]"), pl);
      v3("uTint", S.tint); f1("uBev", S.bevel);
      v3("uBA", origin); v3("uPin", tr.pin); v3("uPoE", E.out); v3("uPoM", M.out);
      v3("uIrA", tr.inner.a); v3("uIrB", tr.inner.b); f1("uIrI", tr.inner.F * 1.2);
      v3("uFanO", O); v3("uFanN", N);
      f1("uFanAE", Math.atan2(dE[2], dE[0])); f1("uFanAM", Math.atan2(dM[2], dM[0])); f1("uFanM", slope);
      f1("uHaze", S.haze); f1("uFanGain", S.fanGain); f1("uLandGain", S.landGain); f1("uEnv", S.env);
      gl.uniform2f(u("uBeamFade"), S.beamFade[0], S.beamFade[1]); f1("uAirFan", S.airFan); f1("uFanRefl", S.fanRefl);
      f1("uFanBlur", S.fanBlur); f1("uPoolSoft", S.poolSoft); f1("uPoolTh", S.poolTh); f1("uGain", S.gain);
      f1("uIB", iB); f1("uBeamF", beamF); f1("uIG", iG); f1("uIForm", iForm);
      f1("uIF", iF * kept); f1("uFront", front); f1("uIP", iP * kept);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };

    let lastKey = "";
    const loop = (now: number) => {
      // debug clock frozen: draw only when what is shown changes (keeps headless captures responsive)
      const key = typeof window.__stSceneT === "number" ? `${window.__stSceneT}|${window.__stPrismPx}|${JSON.stringify(window.__stPrismDbg ?? null)}|${canvas.width}x${canvas.height}` : "";
      if (!key || key !== lastKey) draw(now);
      lastKey = key;
      raf = running ? requestAnimationFrame(loop) : 0;
    };
    // the loop runs only while this scene is on, on screen and the page is visible; reduced motion: one still frame
    const sync = () => {
      const want = onRef.current && visible && !document.hidden && !reduce;
      if (want && !running) { running = true; raf = requestAnimationFrame(loop); }
      else if (!want && running) { running = false; cancelAnimationFrame(raf); raf = 0; }
    };
    let wasOn = false;
    const wake = () => {
      const isOn = onRef.current;
      if (isOn && !wasOn) { tOn = performance.now(); lastKey = ""; if (reduce) draw(performance.now()); }
      wasOn = isOn;
      sync();
    };
    wakeRef.current = wake;

    resize();
    wake();
    const ro = new ResizeObserver(() => { resize(); if (onRef.current) draw(performance.now()); });
    ro.observe(box);
    const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; sync(); });
    io.observe(box);
    const onMove = (e: PointerEvent) => {
      const r = box.getBoundingClientRect();
      if (r.width < 1) return;
      target = Math.max(-1, Math.min(1, ((e.clientX - r.left) / r.width) * 2 - 1));
      if (reduce && onRef.current) draw(performance.now());
    };
    window.addEventListener("pointermove", onMove);
    document.addEventListener("visibilitychange", sync);

    return () => {
      running = false; cancelAnimationFrame(raf);
      wakeRef.current = null;
      ro.disconnect(); io.disconnect();
      window.removeEventListener("pointermove", onMove);
      document.removeEventListener("visibilitychange", sync);
      gl.deleteTexture(tex);
      gl.getExtension("WEBGL_lose_context")?.loseContext();
      canvas.remove();
    };
  }, [mode]);

  useEffect(() => { wakeRef.current?.(); }, [on]);

  return <div ref={boxRef} className="st-stage__fill" aria-hidden />;
}
