import { useEffect, useRef } from "react";
import { kelvinRGB } from "../../ui/LightField";
import { PRISM_FRAG, PRISM_VERT } from "./ScenePrism.glsl";
import { add, cross, lookCam, makePrism, mul, norm, project, sub, traceBeam, type V3 } from "./ScenePrism.optics";

/* Services: one stage, one real glass prism at the centre of the section for all three lines of the studio. The beam
   comes out of the active service's name (it starts just past its last letter), runs into the prism's centre and leaves
   it to the right:
     Motion, 3D & CGI — no dispersion: the same warm 3500 K light throws a 16:9 frame onto the floor, where a film lies and
                        the light shows it as shadows (motion design → a fight → a ship in a storm);
     AI Production    — parted into the AI spectrum (Ember → Rose → Violet → Blue → Mint), landing as a field of colour;
     Vertical Series  — the warm light again, a 9:16 frame and vertical micro-scenes.
   The pointer: up/down turns the prism a few degrees (the projection sways), left/right lets the light reach a little
   further. Switching service re-aims the beam from the new name and turns the prism, with the light's timing.
   The optics are solved on the CPU (ScenePrism.optics.ts); the picture is one fragment shader (ScenePrism.glsl.ts). */

const DEG = Math.PI / 180;
const hex = (h: string): V3 => [parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255];
const SPECTRUM = ["#F6C88C", "#F0A98E", "#C9A0DC", "#93B1D6", "#9FD6CC"].map(hex);
/** refractive index per colour of the light (dispersion exaggerated ~10× over dense flint so the fan reads at this scale) */
const N_LIGHT = [1.45, 1.5125, 1.575, 1.6375, 1.7];
/** index per channel for what is seen through the glass (a modest, real-looking fringe) */
const N_VIEW: V3 = [1.505, 1.517, 1.532];
/** the films the light shows on the floor (black figures on white) */
const FILMS = ["video/site/proj/craft.mp4", "video/site/proj/vertical.mp4"] as const;

interface Frame {
  /** centre on screen (fractions of the section) and half size on the floor (world units) */
  at: [number, number]; half: [number, number];
}
interface Shot {
  /** camera position, what it looks at, vertical field of view (deg) */
  cam: V3; target: V3; fov: number;
  /** where the prism stands on screen (fractions of the section: x from the left, y from the top) */
  at: [number, number];
  /** prism circumradius and height; the beam's height at the glass; how far the pointer turns the prism (deg) */
  R: number; H: number; hb: number; rotAmp: number;
  /** overall exposure, fan in the air, landing field, haze along the beam, the room's sheen, spectrum chroma */
  gain: number; fanGain: number; landGain: number; haze: number; env: number; sat: number;
  /** absorption of the dark-tinted glass per unit length; edge rounding */
  tint: V3; bevel: number;
  /** how quickly the fan fades in the air; how strongly the floor mirrors it; the fan's softness and footprint */
  airFan: number; fanRefl: number; fanBlur: number; poolSoft: number; poolTh: number;
  /** the beam fades in over this length out of the last letter (world units); the gap after the letter (px) */
  fadeLen: number; gap: number;
  /** per service (0 Motion, 1 AI, 2 Vertical): the prism's turn (deg) and the beam's descent */
  svc: { rot: number; slope: number }[];
  /** the projection frames: Motion's 16:9 and Vertical's 9:16 */
  craft: Frame; vert: Frame;
  /** phone: the list is too narrow for the light to leave a name without crossing the others, so it comes in from the
   *  edge here (fractions of the section) */
  edge?: [number, number];
}
const SHOTS: Record<"desk" | "mob", Shot> = {
  desk: {
    cam: [0, 7.0, -3.3], target: [0, 0.3, 0], fov: 23, at: [0.5, 0.63],
    R: 0.44, H: 0.82, hb: 0.4, rotAmp: 5,
    gain: 1, fanGain: 1, landGain: 9, haze: 1, env: 1.6, sat: 1.8, tint: [1.25, 1.32, 1.45], bevel: 0.0065,
    airFan: 0.45, fanRefl: 0.4, fanBlur: 0.06, poolSoft: 2.0, poolTh: 0.05, fadeLen: 0.16, gap: 14,
    svc: [{ rot: 20, slope: 0.46 }, { rot: 38, slope: 0.48 }, { rot: 75, slope: 0.38 }],
    craft: { at: [0.757, 0.81], half: [0.9, 0.5] },
    vert: { at: [0.753, 0.76], half: [0.33, 0.585] },
  },
  mob: {
    cam: [0, 7.0, -3.3], target: [0, 0.3, 0], fov: 34, at: [0.3, 0.8], edge: [-0.02, 0.77],
    R: 0.34, H: 0.66, hb: 0.32, rotAmp: 4,
    gain: 0.9, fanGain: 0.9, landGain: 8, haze: 0.9, env: 1.6, sat: 1.8, tint: [1.25, 1.32, 1.45], bevel: 0.0065,
    airFan: 0.45, fanRefl: 0.4, fanBlur: 0.07, poolSoft: 2.2, poolTh: 0.04, fadeLen: 0.12, gap: 10,
    svc: [{ rot: 20, slope: 0.46 }, { rot: 38, slope: 0.48 }, { rot: 75, slope: 0.38 }],
    craft: { at: [0.7, 0.82], half: [0.48, 0.27] },
    vert: { at: [0.72, 0.8], half: [0.19, 0.34] },
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

export function ScenePrism({ active, mode }: { active: number; mode: "desk" | "mob" }) {
  const boxRef = useRef<HTMLDivElement | null>(null);
  const activeRef = useRef(active);
  const wakeRef = useRef<(() => void) | null>(null);
  activeRef.current = active;

  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const section = box.closest<HTMLElement>('[data-sec="services"]');
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
    const f2 = (n: string, a: number, b: number) => gl.uniform2f(u(n), a, b);

    const warm = kelvinRGB(3500);
    const kc = kelvinRGB(3500 + 1700);
    const coreCol: V3 = [Math.min(1, kc[0] + 0.02), Math.min(1, kc[1] + 0.08), Math.min(1, kc[2] + 0.2)];
    v3("uWarm", warm); v3("uCoreCol", coreCol);
    v3("uEta", N_VIEW);
    f1("uGrain", 0.03);

    const mkTex = (unit: number, px: Uint8Array) => {
      const t = gl.createTexture();
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, px);
      return t;
    };
    const tex = mkTex(0, new Uint8Array([0, 0, 0, 255]));
    gl.uniform1i(u("uSpec"), 0);
    // the films start white: no figures, an even frame of light, until their first frame arrives
    const white = new Uint8Array([255, 255, 255, 255]);
    const filmTex = [mkTex(1, white), mkTex(2, white)];
    gl.uniform1i(u("uFilmA"), 1);
    gl.uniform1i(u("uFilmB"), 2);
    let lutSat = NaN;

    /* the films: muted loops, fetched the first time their service is shown, playing only while they are seen */
    type RVFC = HTMLVideoElement & { requestVideoFrameCallback?: (cb: () => void) => number };
    const hasRVFC = "requestVideoFrameCallback" in HTMLVideoElement.prototype;
    const films = FILMS.map((src) => {
      const v = document.createElement("video") as RVFC;
      v.muted = true; v.loop = true; v.playsInline = true; v.preload = "none";
      v.setAttribute("muted", ""); v.setAttribute("playsinline", "");
      return { v, src, armed: false, fresh: false, ok: false };
    });
    films.forEach((f) => {
      const onFrame = () => { f.fresh = true; f.v.requestVideoFrameCallback?.(onFrame); };
      f.v.addEventListener("loadeddata", () => { f.fresh = true; f.v.requestVideoFrameCallback?.(onFrame); });
    });
    const upload = (i: number) => {
      const f = films[i];
      if (f.v.readyState < 2 || !f.v.videoWidth) return;
      if (!f.fresh && hasRVFC && f.ok) return;
      f.fresh = false;
      gl.activeTexture(gl.TEXTURE1 + i);
      gl.bindTexture(gl.TEXTURE_2D, filmTex[i]);
      try { gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, f.v); f.ok = true; } catch { /* keep the last */ }
    };

    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    let raf = 0, visible = true, running = false, dpr = 1;
    let tOn = performance.now();
    const t0 = performance.now();
    let last = performance.now();
    // pointer: -1 … 1 across the section (x) and down it (y)
    let px = 0, py = 0, pxT = 0, pyT = 0;
    // eased state: the service's weights, the prism's turn, the beam's descent and where it starts on screen
    const st = { spec: 0, proj: 1, k: 0, rot: NaN, slope: NaN, ax: NaN, ay: NaN, svc: Math.max(0, activeRef.current) };

    /* where each name ends (section px): the beam starts just past its last letter, at the middle of its line */
    let anchors: { x: number; y: number }[] = [];
    const measure = () => {
      if (!section) return;
      const sr = section.getBoundingClientRect();
      const k = sr.width / Math.max(1, section.offsetWidth) || 1;
      const gap = SHOTS[mode].gap;
      anchors = Array.from(section.querySelectorAll<HTMLElement>("[data-svc] .st-svc__name")).map((el) => {
        const rg = document.createRange();
        rg.selectNodeContents(el);
        const rs = rg.getClientRects();
        const r = rs.length ? rs[rs.length - 1] : el.getBoundingClientRect();
        return { x: (r.right - sr.left) / k + gap, y: ((r.top + r.bottom) / 2 - sr.top) / k };
      });
    };

    const resize = () => {
      const r = box.getBoundingClientRect();
      const base = Math.min(window.devicePixelRatio || 1, 1.5);
      dpr = Math.min(base, Math.sqrt(2_600_000 / Math.max(1, r.width * r.height)));
      canvas.width = Math.max(2, Math.round(r.width * dpr));
      canvas.height = Math.max(2, Math.round(r.height * dpr));
      gl.viewport(0, 0, canvas.width, canvas.height);
      measure();
    };

    const draw = (now: number) => {
      const S: Shot = { ...SHOTS[mode], ...(window.__stPrismDbg as Partial<Shot> | undefined ?? {}) };
      const dbgT = window.__stSceneT;
      const frozen = typeof dbgT === "number";
      const since = frozen ? dbgT : reduce ? 10 : (now - tOn) / 1000;
      const dt = Math.min(0.1, Math.max(0, (now - last) / 1000));
      last = now;
      const kk = (per: number) => (frozen || reduce ? 1 : 1 - Math.pow(1 - per, dt * 60));
      if (typeof window.__stPrismPx === "number") pxT = window.__stPrismPx;
      px += (pxT - px) * kk(0.035);
      py += (pyT - py) * kk(0.035);

      // the service on show (the last one while none is)
      if (activeRef.current >= 0) st.svc = activeRef.current;
      const svc = st.svc;
      st.spec += ((svc === 1 ? 1 : 0) - st.spec) * kk(0.06);
      st.proj = 1 - st.spec;
      st.k += ((svc === 2 ? 1 : 0) - st.k) * kk(0.06);
      const cfg = S.svc[svc];
      if (Number.isNaN(st.rot)) { st.rot = cfg.rot; st.slope = cfg.slope; }
      st.rot += (cfg.rot - st.rot) * kk(0.05);
      st.slope += (cfg.slope - st.slope) * kk(0.05);

      if (S.sat !== lutSat) {
        lutSat = S.sat;
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, LUT_W, LUT_H, 0, gl.RGBA, gl.UNSIGNED_BYTE, spectrumLUT(lightStops(S.sat), coreCol));
      }
      // the colours the light carries: the spectrum for AI, our one warm light otherwise
      const stops = lightStops(S.sat);
      stops.forEach((c, i) => v3(`uS${i}`, [c[0] + (stops[0][0] - c[0]) * st.proj, c[1] + (stops[0][1] - c[1]) * st.proj, c[2] + (stops[0][2] - c[2]) * st.proj]));

      // the camera: the prism's centre lands exactly where the composition wants it
      const W = canvas.width / dpr, Hs = canvas.height / dpr, A = W / Hs;
      const c0 = lookCam(S.cam, S.target, S.fov * DEG, [0, 0]);
      const p0 = project(c0, [0, S.H * 0.5, 0], A);
      const shift: [number, number] = [(S.at[0] - 0.5) * 2 * A - (p0[0] - 0.5) * 2 * A, (0.5 - S.at[1]) * 2 - (0.5 - p0[1]) * 2];
      const cam = lookCam(S.cam, S.target, S.fov * DEG, shift);
      const rayAt = (X: number, Y: number): V3 => {
        const sx = (X / W - 0.5) * 2 * A - shift[0], sy = (0.5 - Y / Hs) * 2 - shift[1];
        return norm(add(add(mul(cam.f, cam.focal), mul(cam.r, sx)), mul(cam.u, sy)));
      };
      const onFloor = (X: number, Y: number): [number, number] => {
        const rd = rayAt(X, Y);
        const t = -cam.pos[1] / Math.min(rd[1], -1e-4);
        return [cam.pos[0] + rd[0] * t, cam.pos[2] + rd[2] * t];
      };

      // the beam: it starts where the active name ends (eased, so it swings to the next name) and descends into the
      // prism's centre; the pointer's x lets it reach a little further
      const an = S.edge ? { x: S.edge[0] * W, y: S.edge[1] * Hs } : anchors[svc] ?? { x: W * 0.36, y: Hs * S.at[1] };
      if (Number.isNaN(st.ax)) { st.ax = an.x; st.ay = an.y; }
      st.ax += (an.x - st.ax) * kk(0.06);
      st.ay += (an.y - st.ay) * kk(0.06);
      const slope = st.slope * (1 - 0.12 * px);
      const rd = rayAt(st.ax, st.ay);
      let lo = 0.5, hi = 40;
      for (let i = 0; i < 40; i++) {
        const m = (lo + hi) / 2;
        const p = add(cam.pos, mul(rd, m));
        if (p[1] - S.hb - slope * Math.hypot(p[0], p[2]) > 0) lo = m; else hi = m;
      }
      const origin = add(cam.pos, mul(rd, (lo + hi) / 2));
      const d0 = norm(sub([0, S.hb, 0], origin));
      const P = makePrism([0, 0, 0], S.R, S.H, (st.rot + S.rotAmp * py) * DEG);
      const tr = traceBeam(P, origin, d0, N_LIGHT);
      if (!tr) return;
      const valid = tr.rays.filter((r) => r.dir);
      const E = tr.rays[0], M = valid[valid.length - 1] ?? E;
      const dE = E.dir ?? d0, dM = M.dir ?? dE;
      const O: V3 = mul(add(E.out, M.out), 0.5);
      let N = norm(cross(dE, dM));
      if (N[1] < 0) N = mul(N, -1);
      const fslope = -dE[1] / Math.hypot(dE[0], dE[2]);
      const land = O[1] / Math.max(fslope, 1e-3);
      const kept = valid.length / tr.rays.length;
      const L = Math.hypot(tr.pin[0] - origin[0], tr.pin[1] - origin[1], tr.pin[2] - origin[2]);

      // the projection: a frame of light on the floor; the film lies still (it is on the floor), the light moves over it
      const fr = st.k;
      const fAt: [number, number] = [S.craft.at[0] + (S.vert.at[0] - S.craft.at[0]) * fr, S.craft.at[1] + (S.vert.at[1] - S.craft.at[1]) * fr];
      const half: [number, number] = [S.craft.half[0] + (S.vert.half[0] - S.craft.half[0]) * fr, S.craft.half[1] + (S.vert.half[1] - S.craft.half[1]) * fr];
      const base = onFloor(fAt[0] * W, fAt[1] * Hs);
      const ax = norm([base[0] - O[0], 0, base[1] - O[2]]);
      const lat: [number, number] = [-ax[2], ax[0]];
      const pool: [number, number] = [base[0] + ax[0] * 0.14 * px + lat[0] * 0.1 * py, base[1] + ax[2] * 0.14 * px + lat[1] * 0.1 * py];

      // the ignite: the light comes out of the letter and travels to the glass (550 ms), the glass catches it, then the
      // light leaves it: the fan blooms, or the frame lights up on the floor
      const iB = easeEnter(clamp01(since / 0.6));
      const beamF = (L + 0.3) - (L + 0.6) * easeEnter(clamp01(since / 0.55));
      const iG = easeEnter(clamp01((since - 0.3) / 0.5));
      const iForm = easeEnter(clamp01((since - 0.1) / 0.8));
      const iF = easeEnter(clamp01((since - 0.6) / 0.9));
      const front = (land + 1.5) * easeEnter(clamp01((since - 0.55) / 1.0));
      const iP = easeEnter(clamp01((since - 0.85) / 1.1));

      gl.uniform2f(u("uRes"), canvas.width, canvas.height);
      f1("uTime", frozen ? 20 + (dbgT as number) : (now - t0) / 1000);
      v3("uCamPos", cam.pos); v3("uCamF", cam.f); v3("uCamR", cam.r); v3("uCamU", cam.u);
      f1("uFocal", cam.focal);
      f2("uShift", cam.shift[0], cam.shift[1]);
      f1("uPx", 2 / (canvas.height * cam.focal));
      f1("uCore", 1.2 * dpr);
      const pl = new Float32Array(20);
      for (let i = 0; i < 5; i++) { pl[i * 4] = P.n[i][0]; pl[i * 4 + 1] = P.n[i][1]; pl[i * 4 + 2] = P.n[i][2]; pl[i * 4 + 3] = P.d[i]; }
      gl.uniform4fv(u("uPl[0]"), pl);
      v3("uTint", S.tint); f1("uBev", S.bevel);
      // without dispersion the two paths in the glass are one
      const poM: V3 = [M.out[0] + (E.out[0] - M.out[0]) * st.proj, M.out[1] + (E.out[1] - M.out[1]) * st.proj, M.out[2] + (E.out[2] - M.out[2]) * st.proj];
      v3("uBA", origin); v3("uPin", tr.pin); v3("uPoE", E.out); v3("uPoM", poM);
      v3("uIrA", tr.inner.a); v3("uIrB", tr.inner.b); f1("uIrI", tr.inner.F * 1.2);
      v3("uFanO", O); v3("uFanN", N);
      f1("uFanAE", Math.atan2(dE[2], dE[0])); f1("uFanAM", Math.atan2(dM[2], dM[0])); f1("uFanM", fslope);
      f1("uHaze", S.haze); f1("uFanGain", S.fanGain); f1("uLandGain", S.landGain); f1("uEnv", S.env);
      f1("uAirFan", S.airFan); f1("uFanRefl", S.fanRefl);
      f1("uFanBlur", S.fanBlur); f1("uPoolSoft", S.poolSoft); f1("uPoolTh", S.poolTh); f1("uGain", S.gain);
      f1("uFadeLen", S.fadeLen);
      f1("uIB", iB); f1("uBeamF", beamF); f1("uIG", iG); f1("uIForm", iForm);
      f1("uIF", iF * kept * st.spec); f1("uFront", front); f1("uIP", iP * kept * st.spec);
      // the projection
      f1("uSpecW", st.spec); f1("uProjW", st.proj * iP); f1("uProjK", st.k);
      v3("uProjO", O);
      f2("uPoolC", pool[0], pool[1]); f2("uPoolH", half[0], half[1]); f1("uPoolFeather", 0.09);
      f2("uFootC", base[0], base[1]); f2("uFootH", half[0] * 1.12, half[1] * 1.12);
      // the films: play the one in light, upload its new frames
      films.forEach((f, i) => {
        const want = running && st.proj * (i === 0 ? 1 - st.k : st.k) > 0.01;
        if (want && !f.armed) { f.armed = true; f.v.src = f.src; f.v.load(); }
        if (want && f.v.paused) f.v.play().catch(() => {});
        if (!want && !f.v.paused) f.v.pause();
        if (want) upload(i);
      });
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };

    let lastKey = "";
    const loop = (now: number) => {
      // debug clock frozen: draw only when what is shown changes (keeps headless captures responsive)
      const key = typeof window.__stSceneT === "number" ? `${window.__stSceneT}|${window.__stPrismPx}|${activeRef.current}|${JSON.stringify(window.__stPrismDbg ?? null)}|${canvas.width}x${canvas.height}` : "";
      if (!key || key !== lastKey) draw(now);
      lastKey = key;
      raf = running ? requestAnimationFrame(loop) : 0;
    };
    // the loop runs only while a service is on, on screen and the page is visible; reduced motion: one still frame
    const sync = () => {
      const want = activeRef.current >= 0 && visible && !document.hidden && !reduce;
      if (want && !running) { running = true; last = performance.now(); raf = requestAnimationFrame(loop); }
      else if (!want && running) { running = false; cancelAnimationFrame(raf); raf = 0; films.forEach((f) => f.v.pause()); }
    };
    let wasOn = false;
    const wake = () => {
      const isOn = activeRef.current >= 0;
      if (isOn && !wasOn) { tOn = performance.now(); lastKey = ""; if (reduce) draw(performance.now()); }
      if (isOn && reduce) draw(performance.now());
      wasOn = isOn;
      sync();
    };
    wakeRef.current = wake;

    resize();
    wake();
    const ro = new ResizeObserver(() => { resize(); if (activeRef.current >= 0) draw(performance.now()); });
    ro.observe(box);
    if (section) ro.observe(section);
    document.fonts?.ready.then(measure).catch(() => {});
    const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; sync(); });
    io.observe(box);
    const onMove = (e: PointerEvent) => {
      const r = box.getBoundingClientRect();
      if (r.width < 1) return;
      pxT = Math.max(-1, Math.min(1, ((e.clientX - r.left) / r.width) * 2 - 1));
      pyT = Math.max(-1, Math.min(1, ((e.clientY - r.top) / r.height) * 2 - 1));
      if (reduce && activeRef.current >= 0) draw(performance.now());
    };
    window.addEventListener("pointermove", onMove);
    document.addEventListener("visibilitychange", sync);

    return () => {
      running = false; cancelAnimationFrame(raf);
      wakeRef.current = null;
      ro.disconnect(); io.disconnect();
      window.removeEventListener("pointermove", onMove);
      document.removeEventListener("visibilitychange", sync);
      films.forEach((f) => { f.v.pause(); f.v.removeAttribute("src"); f.v.load(); });
      gl.deleteTexture(tex); filmTex.forEach((t) => gl.deleteTexture(t));
      gl.getExtension("WEBGL_lose_context")?.loseContext();
      canvas.remove();
    };
  }, [mode]);

  useEffect(() => { wakeRef.current?.(); }, [active]);

  return <div ref={boxRef} className="st-stage__fill" aria-hidden />;
}
