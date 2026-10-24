import { useEffect, useRef, useState } from "react";
import { kelvinRGB } from "../../ui/LightField";
import { PRISM_FRAG, PRISM_VERT } from "./ScenePrism.glsl";
import { CERAMIC, FROST, MARBLE, Objects, camClip, dirXZ, lightClip, loadMesh, model, type Item } from "./ScenePrism.objects";
import { ShadowArt, type ArtSlot } from "./ScenePrism.art";
import { Pillow, pillowPose } from "./ScenePrism.pillow";
import { add, cross, lookCam, makePrism, mul, norm, project, sub, traceBeam, type V3 } from "./ScenePrism.optics";

/* Services: one stage, one real glass prism at the centre of the section, level with the middle of the three names. The
   beam comes out of the active service's name — one letter's width past its last letter, on the middle line of its type
   — and runs straight into the prism's centre. It does not move: switching service lets the old beam go where it is
   and a new one grows out of the new name. The light leaves the glass to the right:
     Motion, 3D & CGI — no dispersion: our one warm 3500 K light;
     AI Production    — parted into the AI spectrum (Ember → Rose → Violet → Blue → Mint);
     Vertical Series  — the warm light again.
   The pointer: its height over the block of names turns the prism, all the time and only that (the light it sends
   sweeps the floor); left/right lets the light reach a little further.
   Everything is laid out in the site's own px (the site is drawn at 1440 and scaled to the window); the canvas only
   decides the resolution. The optics are solved on the CPU (ScenePrism.optics.ts); the picture is one fragment
   shader (ScenePrism.glsl.ts). */

const DEG = Math.PI / 180;
const hex = (h: string): V3 => [parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255];
const SPECTRUM = ["#F6C88C", "#F0A98E", "#C9A0DC", "#93B1D6", "#9FD6CC"].map(hex);
/** refractive index per colour of the light (dispersion exaggerated ~10× over flint so the fan reads at this scale),
 *  around a light glass's 1.45: the light gets through the prism over a wide turn, so the pointer can really turn it */
const N_LIGHT = [1.45, 1.5125, 1.575, 1.6375, 1.7];
const N_MID = 1.45;
/** the colours' indices: the AI spectrum (ai 1), or our light (ai 0) as one warm bundle about half as wide;
 *  sp (0.8 … 1.1) is how far the bundle opens (the pointer's x) */
const nAt = (sp: number, ai: number) => N_LIGHT.map((n) => N_MID + (n - 1.575) * sp * (0.45 + 0.55 * ai));
/** a turn of the prism works when every colour gets out of the glass and heads down to the floor on the right: level
 *  with it, a little above or toward the viewer (25° … -50° from straight right, seen from above), never back into the head */
const AZ_HI = 30 * (Math.PI / 180), AZ_LO = -50 * (Math.PI / 180);
/** where the light of a working turn heads (its middle colour, deg from straight right; NaN = the turn fails) */
function exitAz(P: ReturnType<typeof makePrism>, o: V3, d: V3, ns: number[]) {
  const t = traceBeam(P, o, d, ns);
  if (!t) return NaN;
  for (const r of t.rays) {
    if (!r.dir || r.dir[1] > -0.02) return NaN;
    const az = Math.atan2(r.dir[2], r.dir[0]);
    if (az > AZ_HI || az < AZ_LO) return NaN;
  }
  const m = t.rays[2].dir!;
  return Math.atan2(m[2], m[0]) / (Math.PI / 180);
}
/** where each service would rather send its light (deg from straight right, + is up the screen): Motion a little up,
 *  AI down to the right, Vertical just under level. Of the turns that work, the pointer gets the run nearest to it */
const AZ_PREF = [8, -20, -8];
/** index per channel for what is seen through the glass (a modest, real-looking fringe) */
const N_VIEW: V3 = [1.505, 1.517, 1.532];
/** Vertical's marble (packed meshes, public/mesh): the two busts, and (dev only) the Hercules group to compare */
const STATUES = ["mesh/caesar.bin", "mesh/senator.bin", "mesh/hercules.bin"] as const;
/** mesh slots: the busts and the group, then the shadow art of Motion and of Vertical */
const M_CAESAR = 3, M_SENATOR = 4, M_HERC = 5, M_PILLOW = 6, M_ART = 14;
/** the alternatives Vlad compares on localhost (a switch under the stage, dev only); production shows the first of each.
 *  Motion: for now only the light and the dust in it (its object is being chosen), the cushion, or the voxels' shadow
 *  story. Vertical: the two busts in conversation, dust drifting off them in the light; or
 *  Hercules raising Antaeus in an upright 9:16 frame of light */
export const VARIANTS = { motion: ["projector", "dust", "cushion", "voxels"], vertical: ["busts", "hercules"] } as const;
export type Variants = { motion: (typeof VARIANTS.motion)[number]; vertical: (typeof VARIANTS.vertical)[number] };
const variant = <K extends keyof Variants>(k: K): Variants[K] => {
  const v = import.meta.env.DEV ? window.__stVar?.[k] : undefined;
  return ((VARIANTS[k] as readonly string[]).includes(v ?? "") ? v : VARIANTS[k][0]) as Variants[K];
};
const IDENT = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
const base = import.meta.env.BASE_URL;
/** Motion's story in the shadow: a city grows out of the floor, folds over onto itself, and the fold becomes a
 *  fighter in a flying kick (modelling, effects, character: what the service makes) */
const MOTION_SLOT = {
  pics: ["city1", "city2", "city3", "fold", "kick"].map((n) => `${base}shadow/${n}.png`),
  hold: [0.12, 0.12, 1.5, 1.9, 2.4],
  morph: [0.6, 0.7, 1.5, 1.6, 1.7],
};
/** each service's things, as the frame sees them: their height and their reach around their base (world units at
 *  scale 1); they stand in their service's light as far out as the frame lets them, never past STAND_MAX */
const DIMS = [{ h: 1.05, r: 0.85 }, { h: 0.8, r: 0.62 }, { h: 0.95, r: 0.9 }];
/** where each service's things sit across the frame (their middle, as a fraction of the section's width) */
const AIM_X = [0.775, 0.77, 0.775];
/** the light lands this far below the prism's level (fraction of the section's height); at most this far turned (rad) */
const AIM_DY = 0.07, AIM_MAX = 0.75;
const STAND_MAX = 2.6;
/** the largest each service's things may grow (the colossal head fills the frame quickly) */
const SCALE_MAX = [3.2, 1.0, 3.2];
/** the shadow map's reach from the light's origin */
const L_FAR = 7;
interface Shot {
  /** camera position, what it looks at, vertical field of view (deg) */
  cam: V3; target: V3; fov: number;
  /** where the prism stands on screen (fractions of the section: x from the left, y from the top) */
  at: [number, number];
  /** prism circumradius and height; the beam's height at the glass */
  R: number; H: number; hb: number;
  /** overall exposure, fan in the air, landing field, haze along the beam, the room's sheen, spectrum chroma */
  gain: number; fanGain: number; landGain: number; haze: number; env: number; sat: number;
  /** absorption of the dark-tinted glass per unit length; edge rounding */
  tint: V3; bevel: number;
  /** how quickly the fan fades in the air; how strongly the floor mirrors it; the fan's softness and footprint */
  airFan: number; fanRefl: number; fanBlur: number; poolSoft: number; poolTh: number;
  /** the beam fades in over this length out of the last letter (world units); the gap after the letter (em of the name) */
  fadeLen: number; gap: number;
  /** the beam's descent from the name into the glass */
  slope: number;
  /** phone: the list is too narrow for the light to leave a name without crossing the others, so it comes in from the
   *  edge here (fractions of the section) */
  edge?: [number, number];
}
const SHOTS: Record<"desk" | "mob", Shot> = {
  desk: {
    cam: [0, 7.0, -3.3], target: [0, 0.3, 0], fov: 23, at: [0.5, 0.69],
    R: 0.34, H: 0.62, hb: 0.3,
    gain: 1, fanGain: 1, landGain: 9, haze: 1, env: 1.6, sat: 1.8, tint: [1.25, 1.32, 1.45], bevel: 0.0065,
    airFan: 0.6, fanRefl: 0.4, fanBlur: 0.06, poolSoft: 2.0, poolTh: 0.05, fadeLen: 0.035, gap: 0.5,
    slope: 0.36,
  },
  mob: {
    cam: [0, 7.0, -3.3], target: [0, 0.3, 0], fov: 34, at: [0.3, 0.8], edge: [-0.02, 0.77],
    R: 0.34, H: 0.66, hb: 0.32,
    gain: 0.9, fanGain: 0.9, landGain: 8, haze: 0.9, env: 1.6, sat: 1.8, tint: [1.25, 1.32, 1.45], bevel: 0.0065,
    airFan: 0.6, fanRefl: 0.4, fanBlur: 0.07, poolSoft: 2.2, poolTh: 0.04, fadeLen: 0.03, gap: 0.5,
    slope: 0.36,
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
/** --ease-move */
const easeMove = bezier(0.45, 0, 0.2, 1);
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
    /** dev: which alternative each service shows */
    __stVar?: Partial<Variants>;
    /** debug: freeze the scene's clock at this many seconds after it turned on (also snaps the pointer) */
    __stSceneT?: number;
    /** debug: pointer position over the scene, -1 (left) … 1 (right) */
    __stPrismPx?: number;
    /** debug: pointer height over the block of names, -1 (top) … 1 (bottom) */
    __stPrismPy?: number;
    /** debug: override any of the shot's settings live */
    __stPrismDbg?: Partial<Shot>;
    /** debug: when an array, each drawn frame's time to completion (ms) is pushed to it */
    __stPrismTime?: number[];
    /** debug: no multisampling (a software GPU captures multisampled canvases very slowly) */
    __stPrismNoAA?: boolean;
    /** debug: set true to time the next frame's passes (shadow, prism, objects; ms) — it is replaced by the times */
    __stPrismProf?: boolean | number[];
    /** debug: a manual clock (ms); each new value draws one frame at that time */
    __stClock?: number;
    /** debug: when an array, each frame's light state is pushed to it */
    __stPrismTrace?: Record<string, unknown>[];
    /** debug: compute the frame's state but draw nothing */
    __stPrismNoGL?: boolean;
    /** debug: the live loop draws nothing (a scripted run owns the scene) */
    __stPrismHold?: boolean;
    /** debug: the active service, instead of the page's */
    __stActive?: number;
    /** debug: run a scripted sequence of frames at once (no drawing) and return each frame's light state */
    __stPrismRun?: (frames: { t: number; a: number; py?: number }[], gl?: boolean) => Record<string, unknown>[];
    /** debug: the canvas's pixel budget (headless checks run on a software GPU) */
    __stPrismBudget?: number;
    /** debug: what the scene laid out last frame (site px), for checks */
    __stPrismInfo?: Record<string, unknown>;
  }
}

/** how long the old beam takes to go, and the new one to grow from the letter into the glass (s) */
const BEAM_OUT = 0.4;
/** how long the beam's start takes to travel from one name to the next (s) */
const BEAM_MOVE = 0.85;
/** how long one switch takes, for everything at once: the prism's turn, where the light leaves the glass, its heading
 *  and spread, its colour (s); one slow move on --ease-move, never a jump */
const LIGHT_MOVE = 1.3;
/** the light leaving the glass: where (o), the headings (rad) and elevations (rad) of its first and last colour */
interface LightState { o: V3; aE: number; aM: number; eE: number; eM: number }
const wrapA = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
const lerpA = (a: number, b: number, k: number) => a + wrapA(b - a) * k;
const mixLight = (a: LightState, b: LightState, k: number): LightState => ({
  o: [a.o[0] + (b.o[0] - a.o[0]) * k, a.o[1] + (b.o[1] - a.o[1]) * k, a.o[2] + (b.o[2] - a.o[2]) * k],
  aE: lerpA(a.aE, b.aE, k), aM: lerpA(a.aM, b.aM, k), eE: a.eE + (b.eE - a.eE) * k, eM: a.eM + (b.eM - a.eM) * k,
});
const dirOf = (az: number, el: number): V3 => [Math.cos(el) * Math.cos(az), Math.sin(el), Math.cos(el) * Math.sin(az)];


/* How hard the scene works, kept for the whole visit (it survives remounts): the canvas's pixel budget and whether the
   light is marched through the haze. The scene starts one step below the top and moves by measured frame times: down
   at once when frames run slow, up slowly when they have room; a lost GPU context drops it two steps. */
const TIERS = [
  { budget: 2_600_000, air: true },
  { budget: 1_800_000, air: true },
  { budget: 1_200_000, air: true },
  { budget: 800_000, air: false },
  { budget: 500_000, air: false },
];
const quality = { tier: 1, losses: 0, lite: false };

export function ScenePrism({ active, mode }: { active: number; mode: "desk" | "mob" }) {
  const boxRef = useRef<HTMLDivElement | null>(null);
  const activeRef = useRef(active);
  const wakeRef = useRef<(() => void) | null>(null);
  activeRef.current = active;
  // a new generation of the scene after the GPU dropped its context
  const [gen, setGen] = useState(0);

  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const section = box.closest<HTMLElement>('[data-sec="services"]');
    // a fresh canvas per mount: a context lost in cleanup can never be reused
    const canvas = document.createElement("canvas");
    canvas.setAttribute("aria-hidden", "true");
    canvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%;display:block";
    box.appendChild(canvas);
    box.removeAttribute("data-ready");
    const gl = canvas.getContext("webgl", { antialias: !window.__stPrismNoAA && quality.tier <= 1, alpha: false, premultipliedAlpha: false, powerPreference: "high-performance" });
    if (!gl) { canvas.remove(); return; }
    const deriv = !!gl.getExtension("OES_standard_derivatives");
    // compile without blocking the page where the browser can (the scene's shader is large)
    const par = gl.getExtension("KHR_parallel_shader_compile") as { COMPLETION_STATUS_KHR: number } | null;

    const sh = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src); gl.compileShader(s);
      return s;
    };
    const build = (lite: boolean) => {
      const p = gl.createProgram()!;
      const vs = sh(gl.VERTEX_SHADER, PRISM_VERT);
      const fs = sh(gl.FRAGMENT_SHADER, (deriv ? "#extension GL_OES_standard_derivatives : enable\n#define DERIV\n" : "") + (lite ? "#define LITE\n" : "") + PRISM_FRAG);
      gl.attachShader(p, vs); gl.attachShader(p, fs);
      gl.bindAttribLocation(p, 0, "a");
      gl.linkProgram(p);
      return { p, vs, fs, lite };
    };
    let built = build(quality.lite);
    let prog = built.p;
    /* everything the program needs, once it is linked */
    const U: Record<string, WebGLUniformLocation | null> = {};
    const u = (n: string) => (n in U ? U[n] : (U[n] = gl.getUniformLocation(prog, n)));
    const v3 = (n: string, v: V3) => gl.uniform3f(u(n), v[0], v[1], v[2]);
    const f1 = (n: string, v: number) => gl.uniform1f(u(n), v);
    const f2 = (n: string, a: number, b: number) => gl.uniform2f(u(n), a, b);
    let buf: WebGLBuffer | null = null, tex: WebGLTexture | null = null;
    const warm = kelvinRGB(3500);
    const kc = kelvinRGB(3500 + 1700);
    const coreCol: V3 = [Math.min(1, kc[0] + 0.02), Math.min(1, kc[1] + 0.08), Math.min(1, kc[2] + 0.2)];
    let lutSat = NaN;
    let objs: Objects | null = null;
    let alive = true, ready = false, failed = false, meshes = false;
    /** the shadow-art piece: carved for the light's origin and the camera of the current layout, rebuilt when they move */
    const artM = new ShadowArt();
    /* Motion's projection: our Motion, 3D & CGI works, one loop after another, laid on the floor by the light */
    let projTex: WebGLTexture | null = null;
    let projVid: HTMLVideoElement | null = null, projK = 0, projAt = 0;
    const PROJ = ["centil", "fifa", "tefal", "prison", "arch"];
    const projNext = () => {
      if (!projVid) return;
      const webm = projVid.canPlayType('video/webm; codecs="vp9"') !== "";
      projVid.src = `${import.meta.env.BASE_URL}video/site/${PROJ[projK % PROJ.length]}-loop.${webm ? "webm" : "mp4"}`;
      projK++;
      projAt = performance.now();
      projVid.play().catch(() => {});
    };
    const projStart = () => {
      if (projVid) { if (projVid.paused) projVid.play().catch(() => {}); return; }
      const v = document.createElement("video");
      v.muted = true; v.playsInline = true; v.preload = "auto"; v.crossOrigin = "anonymous";
      v.addEventListener("ended", projNext);
      projVid = v;
      projNext();
    };
    /** Motion's cushion: rebuilt on the CPU each frame it shows */
    const pillow = new Pillow();
    let pillowIn = false;
    /* Vertical's dust: motes hanging in the air of the light, the way dust shows in a projector's beam, giving the frame
       its depth: most float around the two at their depth, sharp; some hang high between them and the camera, out of
       focus, as soft discs. They drift slowly and are carried a little downstream; they glow where the light reaches
       them. The frame's points go to dustData (x, y, z, size, strength, 0) */
    const DUST_N = 900, DUST_IN = 380;
    const dust = { ph: new Float32Array(DUST_N * 8), init: false };
    const dustData = new Float32Array(DUST_N * 6);
    let dustN = 0;
    const dustFrame = (centre: V3, sc: number, t: number, O: V3) => {
      if (!dust.init) {
        dust.init = true;
        let sd = 23;
        const r = () => { sd = (sd * 16807) % 2147483647; return sd / 2147483647; };
        for (let j = 0; j < DUST_N; j++) dust.ph.set([r(), r(), r(), r() * 6.283, 0.3 + r(), r(), r(), r()], j * 8);
      }
      // the light's way across the stage: from the glass to past the two
      let fx = centre[0] - O[0], fz = centre[2] - O[2];
      const fl = Math.hypot(fx, fz) || 1; fx /= fl; fz /= fl;
      const span = fl * 1.6, wide = 1.4 * sc + 0.35 * fl;
      let n = 0;
      for (let j = 0; j < DUST_N; j++) {
        const g = j * 8, ra = dust.ph[g], rb = dust.ph[g + 1], rc = dust.ph[g + 2], ph = dust.ph[g + 3], sp = dust.ph[g + 4], rs = dust.ph[g + 5], rt = dust.ph[g + 6], rh = dust.ph[g + 7];
        let x: number, y: number, z: number, k: number, glow: number;
        if (j < DUST_IN) {
          // in the light: a sparse stream, most of it soft
          const high = j % 4 === 0;
          const along = ((((ra + t * 0.006 * sp) % 1) + 1) % 1) * span + 0.15 * fl;
          const across = (rb - 0.5) * wide * (0.35 + along / span);
          const yb = high ? (0.9 + 2.2 * rh) * sc : (0.04 + 1.1 * rh * rh) * sc;
          x = O[0] + fx * along - fz * across + 0.05 * sc * Math.sin(0.21 * t * sp + ph);
          z = O[2] + fz * along + fx * across + 0.05 * sc * Math.cos(0.17 * t * sp + ph * 1.7);
          y = yb + 0.04 * sc * Math.sin(0.26 * t * sp + ph * 2.3);
          // a mote turns in the air and catches the light now and then
          k = (high ? 0.16 : 0.08 + 0.3 * Math.pow(0.5 + 0.5 * Math.sin(0.9 * t * sp + ph * 3), 4)) * (0.6 + 0.4 * rc);
          glow = 0;
        } else {
          // the room's air around it, faint, near and far, so the frame has depth
          const along = (-0.5 + 2.6 * ra) * fl;
          const across = (rb - 0.5) * (3.2 * wide + 2.0 * fl);
          x = O[0] + fx * along - fz * across + 0.08 * sc * Math.sin(0.12 * t * sp + ph);
          z = O[2] + fz * along + fx * across + 0.08 * sc * Math.cos(0.1 * t * sp + ph * 1.7);
          y = (0.05 + 3.2 * rh * rh) * sc + 0.06 * sc * Math.sin(0.15 * t * sp + ph * 2.3);
          k = 0.08 * (0.5 + 0.5 * rc);
          glow = 0.5 + 0.5 * Math.pow(0.5 + 0.5 * Math.sin(0.4 * t * sp + ph * 3), 2);
        }
        dustData.set([x, y, z, sc * (0.0045 + 0.006 * rs), k * (0.7 + 0.3 * rt), glow], n * 6);
        n++;
      }
      return n;
    };
    const init = () => {
      gl.useProgram(prog);
      buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
      const loc = gl.getAttribLocation(prog, "a");
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

      v3("uWarm", warm); v3("uCoreCol", coreCol);
      v3("uEta", N_VIEW);
      f1("uGrain", 0.03);

      tex = gl.createTexture();
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.uniform1i(u("uSpec"), 0);
      gl.uniform1i(u("uShadow"), 3);
      gl.uniform1i(u("uProj"), 4);
      projTex = gl.createTexture();
      gl.activeTexture(gl.TEXTURE4);
      gl.bindTexture(gl.TEXTURE_2D, projTex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 255]));

      /* the things the light falls on */
      objs = new Objects(gl);
      ready = true;
    };
    /** is the program linked yet? (never blocks where the browser compiles in parallel); a failed link falls back to
     *  the lighter shader once, then gives up and leaves the stage dark */
    const poll = () => {
      if (ready || failed) return ready;
      if (par && !gl.getProgramParameter(prog, par.COMPLETION_STATUS_KHR)) return false;
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
        console.warn("ScenePrism link:", gl.getProgramInfoLog(prog) || gl.getShaderInfoLog(built.fs));
        gl.deleteProgram(prog);
        if (!built.lite) { quality.lite = true; built = build(true); prog = built.p; return false; }
        failed = true;
        return false;
      }
      init();
      return true;
    };
    /** the marble groups arrive after the first frame, when the page is idle */
    const loadMeshes = () => {
      if (meshes) return;
      meshes = true;
      const go = () => STATUES.forEach((url, i) => (i < 2 || import.meta.env.DEV) && loadMesh(url).then((m) => { if (alive && objs) objs.set(M_CAESAR + i, m); }).catch(() => {}));
      const ric = (window as unknown as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
      if (ric) ric(go, { timeout: 1500 }); else setTimeout(go, 200);
    };

    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    let raf = 0, visible = true, running = false;
    /** the canvas's px per site px (the window's scale × the device's pixel ratio, within the pixel budget) */
    let cpx = 1;
    let tOn = performance.now();
    const t0 = performance.now();
    let last = performance.now();
    // pointer: -1 … 1 across the section (x) and down the block of names (y)
    let px = 0, pxT = 0;
    /** the pointer's height (site px); NaN until it moves */
    let yT = NaN;
    // eased state: the service's weights and the prism's turn
    const st = { spec: 0, proj: 1, k: 0, rot: NaN, az: NaN, kept: 1, svc: Math.max(0, activeRef.current), show: [0, 0, 0] };
    st.spec = st.svc === 1 ? 1 : 0; st.k = st.svc === 2 ? 1 : 0; st.show[st.svc] = 1;

    /** where each service's things stand: its light's origin and direction at the middle of its turn (per layout) */
    let place: { o: V3; az: number }[] = [];
    /** how far along its light each service's things stand, and their scale (fitted to the frame per layout) */
    let stand: { d: number; s: number }[] = [];
    /** each service's aim: where its light heads across the stage, and how far that is turned from where the glass sends it */
    let aim: { az: number; d: number }[] = [];
    /* the beam: where it starts (the active name) and since when; the one before it, going where it was */
    /** the switch in progress: when it began, what it started from (the light, colour, figures' weight, the turn) */
    const lt = { svc: -1, t0: 0, from: null as LightState | null, cur: null as LightState | null, spec: 0, k: 0, rot: NaN, swap: null as null | "none" | "from" | "to" };
    const beam = { svc: -1, tSw: -1e9, old: null as null | { o: V3; pin: V3 }, from: null as null | { x: number; y: number }, at: { x: 0, y: 0 } };
    /* each service's working turn of the prism (deg): from where its name's beam comes, every colour of its light gets
       out and heads right. The pointer's height runs through them in order, row by row (cached per layout) */
    let wins = { key: "", w: [] as { lo: number; hi: number }[] };

    /* where each name ends (site px): the beam starts one letter past its last letter, on the middle line of its type */
    let anchors: { x: number; y: number }[] = [];
    /** the block of the three names (site px): the prism stands level with its middle, the pointer's height turns it */
    let list = { top: 0, bottom: 0, mid: 0 };
    /** each service's row (site px, top … bottom of its button): the pointer turns the prism through its window there */
    let rows: { top: number; bottom: number }[] = [];
    /** the hairline under the section's head (site px): nothing of the scene crosses it */
    let ruleY = 0;
    const measure = () => {
      if (!section) return;
      const sr = section.getBoundingClientRect();
      const k = sr.width / Math.max(1, section.offsetWidth) || 1;
      anchors = Array.from(section.querySelectorAll<HTMLElement>("[data-svc] .st-svc__name")).map((el) => {
        const rg = document.createRange();
        rg.selectNodeContents(el);
        const rs = rg.getClientRects();
        const r = rs.length ? rs[rs.length - 1] : el.getBoundingClientRect();
        const em = parseFloat(getComputedStyle(el).fontSize) || 46;
        return { x: (r.right - sr.left) / k + SHOTS[mode].gap * em, y: ((r.top + r.bottom) / 2 - sr.top) / k };
      });
      const rule = section.querySelector<HTMLElement>(".st-rule");
      if (rule) ruleY = (rule.getBoundingClientRect().top - sr.top) / k;
      const items = section.querySelectorAll<HTMLElement>("[data-svc] .st-svc__name");
      if (items.length) {
        const a = items[0].getBoundingClientRect(), b = items[items.length - 1].getBoundingClientRect();
        const top = (a.top - sr.top) / k, bottom = (b.bottom - sr.top) / k;
        list = { top, bottom, mid: (top + bottom) / 2 };
      }
      rows = Array.from(section.querySelectorAll<HTMLElement>(".st-svc__item")).map((el) => {
        const r = el.getBoundingClientRect();
        return { top: (r.top - sr.top) / k, bottom: (r.bottom - sr.top) / k };
      });
    };

    const resize = () => {
      const r = box.getBoundingClientRect();
      const lh = Math.max(1, box.offsetHeight);
      const base = Math.min(window.devicePixelRatio || 1, 1.5);
      const d = Math.min(base, Math.sqrt((window.__stPrismBudget ?? TIERS[quality.tier].budget) / Math.max(1, r.width * r.height)));
      canvas.width = Math.max(2, Math.round(r.width * d));
      canvas.height = Math.max(2, Math.round(r.height * d));
      cpx = canvas.height / lh;
      gl.viewport(0, 0, canvas.width, canvas.height);
      measure();
    };

    const draw = (now: number) => {
      const ob = objs;
      if (!ready || !ob) return;
      gl.useProgram(prog);
      const S: Shot = { ...SHOTS[mode], ...(window.__stPrismDbg as Partial<Shot> | undefined ?? {}) };
      const dbgT = window.__stSceneT;
      const frozen = typeof dbgT === "number";
      const since = frozen ? dbgT : reduce ? 10 : (now - tOn) / 1000;
      const dt = Math.min(0.1, Math.max(0, (now - last) / 1000));
      last = now;
      const kk = (per: number) => (frozen || reduce ? 1 : 1 - Math.pow(1 - per, dt * 60));
      if (typeof window.__stPrismPx === "number") pxT = window.__stPrismPx;
      if (typeof window.__stPrismPy === "number") yT = list.top + ((window.__stPrismPy + 1) / 2) * (list.bottom - list.top);
      px += (pxT - px) * kk(0.035);

      // the service on show (the last one while none is). The prism never goes: a switch adds the new name's beam at
      // once while the old one fades where it is, the light leaving the glass glides to its new colour and aim, and
      // the things in it change over quickly
      const asked = import.meta.env.DEV && typeof window.__stActive === "number" ? window.__stActive : activeRef.current;
      if (asked >= 0) st.svc = asked;
      const svc = st.svc;
      // a switch is one move: everything that changes goes from where it is now to the new service's on the same
      // curve over the same time (a switch during a switch starts again from wherever things are)
      const tL = frozen ? 1e6 : now / 1000;
      if (lt.svc !== svc) {
        lt.from = lt.svc >= 0 && !frozen && lt.cur ? { ...lt.cur, o: [...lt.cur.o] as V3 } : null;
        lt.spec = st.spec; lt.k = st.k; lt.rot = st.rot; lt.t0 = tL; lt.svc = svc; lt.swap = null;
      }
      const le = lt.from ? easeMove(clamp01((tL - lt.t0) / LIGHT_MOVE)) : 1;
      st.spec = lt.spec + ((svc === 1 ? 1 : 0) - lt.spec) * le;
      st.k = lt.k + ((svc === 2 ? 1 : 0) - lt.k) * le;
      if (!lt.from) { st.spec = svc === 1 ? 1 : 0; st.k = svc === 2 ? 1 : 0; }
      for (let i = 0; i < 3; i++) st.show[i] += ((st.svc === i ? 1 : 0) - st.show[i]) * kk(0.3);
      st.proj = 1 - st.spec;

      if (S.sat !== lutSat) {
        lutSat = S.sat;
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, LUT_W, LUT_H, 0, gl.RGBA, gl.UNSIGNED_BYTE, spectrumLUT(lightStops(S.sat), coreCol));
      }
      // the colours the light carries: the spectrum for AI, our one warm light otherwise
      const stops = lightStops(S.sat);
      stops.forEach((c, i) => v3(`uS${i}`, [c[0] + (stops[0][0] - c[0]) * st.proj, c[1] + (stops[0][1] - c[1]) * st.proj, c[2] + (stops[0][2] - c[2]) * st.proj]));

      // the camera, in site px: the prism's centre lands exactly where the composition wants it
      const W = Math.max(1, box.offsetWidth), Hs = Math.max(1, box.offsetHeight), A = W / Hs;
      const c0 = lookCam(S.cam, S.target, S.fov * DEG, [0, 0]);
      const p0 = project(c0, [0, S.H * 0.5, 0], A);
      // desk: the prism stands across from the middle of the block of names, at the middle of the section's width
      const atY = mode === "desk" && list.mid > 0 ? list.mid / Hs : S.at[1];
      const shift: [number, number] = [(S.at[0] - 0.5) * 2 * A - (p0[0] - 0.5) * 2 * A, (0.5 - atY) * 2 - (0.5 - p0[1]) * 2];
      const cam = lookCam(S.cam, S.target, S.fov * DEG, shift);
      const rayAt = (X: number, Y: number): V3 => {
        const sx = (X / W - 0.5) * 2 * A - shift[0], sy = (0.5 - Y / Hs) * 2 - shift[1];
        return norm(add(add(mul(cam.f, cam.focal), mul(cam.r, sx)), mul(cam.u, sy)));
      };
      // where the beam starts in the air so that it reads, on screen, as leaving the name, and descends at sl into
      // the prism's centre
      const startAt = (X: number, Y: number, sl: number): V3 => {
        const r0 = rayAt(X, Y);
        let lo = 0.5, hi = 40;
        for (let i = 0; i < 40; i++) {
          const m = (lo + hi) / 2;
          const p = add(cam.pos, mul(r0, m));
          if (p[1] - S.hb - sl * Math.hypot(p[0], p[2]) > 0) lo = m; else hi = m;
        }
        return add(cam.pos, mul(r0, (lo + hi) / 2));
      };
      const anchorOf = (i: number) => (S.edge ? { x: S.edge[0] * W, y: S.edge[1] * Hs } : anchors[i] ?? { x: W * 0.36, y: Hs * atY });

      // the beam is pinned to the active name: no travel between names. A switch lets the old beam go where it is
      // and grows the new one out of the new name into the glass
      const tNow = frozen ? 1e6 : now / 1000;
      // the beam moves: its start travels from the last name to the new one on --ease-move, always into the glass
      if (beam.svc !== svc) {
        beam.from = beam.svc >= 0 && !frozen ? { ...beam.at } : null;
        beam.tSw = tNow;
        beam.svc = svc;
      }
      beam.old = null;
      const sw = tNow - beam.tSw;
      const target = anchorOf(svc);
      const mk = beam.from ? easeMove(clamp01(sw / BEAM_MOVE)) : 1;
      const an = beam.from ? { x: beam.from.x + (target.x - beam.from.x) * mk, y: beam.from.y + (target.y - beam.from.y) * mk } : target;
      beam.at = an;

      // the pointer's x: the bundle opens a little (0.8 … 1.1)
      const slope = S.slope;
      const spread = 0.8 + 0.15 * (px + 1);
      const nNow = nAt(spread, st.spec);
      // each service's window, for its own name and its own light, at the widest opening (narrower ones work wider)
      const ans = S.edge ? [anchorOf(0)] : [0, 1, 2].map(anchorOf);
      const key = `${Math.round(W)}x${Math.round(Hs)}|${ans.map((a) => `${Math.round(a.x)},${Math.round(a.y)}`).join(";")}`;
      if (wins.key !== key) {
        const w: { lo: number; hi: number }[] = [];
        place = [];
        for (let i = 0; i < 3; i++) {
          const a = ans[Math.min(i, ans.length - 1)];
          const o = startAt(a.x, a.y, S.slope), d = norm(sub([0, S.hb, 0], o));
          const ns = nAt(1.1, i === 1 ? 1 : 0);
          const az: number[] = [];
          for (let k = 0; k < 240; k++) az.push(exitAz(makePrism([0, 0, 0], S.R, S.H, k * 0.5 * DEG), o, d, ns));
          // the runs of working turns (wrapping at 120°); score: long, and heading where the service wants its light
          let best = 0, bs = 0, score = -1e9;
          const start = az.findIndex((v) => Number.isNaN(v));
          for (let q = 0; q < 240 && start >= 0; q++) {
            const k = (start + q) % 240;
            if (Number.isNaN(az[k]) || !Number.isNaN(az[(k + 239) % 240])) continue;
            let n = 0;
            while (n < 240 && !Number.isNaN(az[(k + n) % 240])) n++;
            const sc = n * 0.5 - 0.8 * Math.abs(az[(k + (n >> 1)) % 240] - AZ_PREF[i]);
            if (sc > score) { score = sc; best = n; bs = k; }
          }
          if (start < 0) { best = 240; bs = 0; }
          // a degree and a half kept clear of each end (there the light grazes out)
          const lo = bs * 0.5 + 1.5, hi = Math.max(lo, (bs + best) * 0.5 - 1.5);
          // the same window repeats every 120° (three faces): take the one that follows the previous row's in order
          let sh = 0;
          if (w.length) { const pc = (w[w.length - 1].lo + w[w.length - 1].hi) / 2; sh = Math.round((pc + 20 - (lo + hi) / 2) / 120) * 120; }
          w.push(best ? { lo: lo + sh, hi: hi + sh } : w[w.length - 1] ?? { lo: 0, hi: 0 });
          // the light at the middle of that turn: the service's things stand in it
          const wc = w[w.length - 1];
          const tc = traceBeam(makePrism([0, 0, 0], S.R, S.H, ((wc.lo + wc.hi) / 2) * DEG), o, d, nAt(0.95, i === 1 ? 1 : 0));
          const ok = tc?.rays.filter((r) => r.dir) ?? [];
          if (tc && ok.length) {
            const a0 = ok[0].dir!, a1 = ok[ok.length - 1].dir!;
            place.push({ o: mul(add(ok[0].out, ok[ok.length - 1].out), 0.5), az: Math.atan2(a0[2] + a1[2], a0[0] + a1[0]) });
          } else place.push({ o: [0, S.hb, 0], az: (AZ_PREF[i] * Math.PI) / 180 });
        }
        // as far out along the light as the frame allows: right of the prism, under the head's hairline, above the
        // section's foot, clear of the right edge
        const prismX = project(cam, [0, S.H * 0.5, 0], A)[0] * W;
        // the light of every service is aimed the same way: straight across the stage to its middle, a little below the
        // prism's level, where its things stand (the glass sends it near enough; the last few degrees are ours)
        aim = place.map((pl0, i) => {
          const T = rayAt(AIM_X[i] * W, atY * Hs + AIM_DY * Hs);
          const t = -cam.pos[1] / Math.min(T[1], -1e-4);
          const az = Math.atan2(cam.pos[2] + T[2] * t - pl0.o[2], cam.pos[0] + T[0] * t - pl0.o[0]);
          let dl = Math.atan2(Math.sin(az - pl0.az), Math.cos(az - pl0.az));
          dl = Math.max(-AIM_MAX, Math.min(AIM_MAX, dl));
          return { az: pl0.az + dl, d: dl };
        });
        place = place.map((pl0, i) => ({ o: pl0.o, az: aim[i].az }));
        stand = place.map((pl0, i) => {
          const f = dirXZ(pl0.az), dm = DIMS[i];
          const fits = (d: number, sc: number) => {
            const b: V3 = [pl0.o[0] + f[0] * d, 0, pl0.o[2] + f[2] * d];
            for (const y of [0, dm.h * sc]) for (const ox of [-1, 1]) for (const oz of [-1, 1]) {
              // the top is narrower than the footprint (a head, a ring's crown): its far corner is pulled in
              const rz = y > 0 ? dm.r * 0.6 : dm.r;
              const q = project(cam, [b[0] + ox * dm.r * sc, y, b[2] + oz * rz * sc], A);
              const X = q[0] * W, Y = q[1] * Hs;
              if (X < prismX + W * 0.06 || X > W - (mode === "mob" ? 14 : 56) || Y < ruleY + 40 || Y > Hs - 8) return false;
            }
            return true;
          };
          // as large as the frame takes them (monumental), at the distance that puts them nearest their spot across
          for (const sc of [3.2, 2.9, 2.6, 2.35, 2.1, 1.9, 1.7, 1.5, 1.3, 1.15, 1, 0.85, 0.7, 0.6, 0.5].filter((x) => x <= SCALE_MAX[i])) {
            let bestD = -1, bestE = 1e9;
            for (let d = STAND_MAX; d >= 0.55; d -= 0.05) {
              if (!fits(d, sc)) continue;
              const q = project(cam, [pl0.o[0] + f[0] * d, dm.h * sc * 0.4, pl0.o[2] + f[2] * d], A);
              const e = Math.abs(q[0] - AIM_X[i]);
              if (e < bestE) { bestE = e; bestD = d; }
            }
            if (bestD > 0) return { d: bestD, s: sc };
          }
          // no room for them in this frame (a narrow phone): the light alone
          return { d: 0, s: 0 };
        });
        wins = { key, w };
      }
      // the pointer's height turns the prism, smoothly, all the time: over a service's row through that service's
      // window, top to bottom; so moving down the list turns it on and on. Off the rows it holds the nearest end. Only
      // when the light comes from another name than the row under the pointer, the turn stays inside its window
      const rotTarget = () => {
        const wa = wins.w[svc] ?? { lo: 0, hi: 0 };
        if (Number.isNaN(yT) || !rows.length) return (wa.lo + wa.hi) / 2;
        const rs = S.edge ? [{ top: list.top, bottom: list.bottom }] : rows;
        let b = 0;
        for (let i = 0; i < rs.length; i++) if (yT >= rs[i].top) b = i;
        const r = rs[b];
        const wb = S.edge ? wa : wins.w[b] ?? wa;
        const f = wb.lo + (wb.hi - wb.lo) * clamp01((yT - r.top) / Math.max(1, r.bottom - r.top));
        return S.edge || b === svc ? f : Math.max(wa.lo, Math.min(wa.hi, f));
      };
      let rotT = rotTarget();
      // the prism turns the shorter way (its three faces repeat every 120°): during a switch on the move's curve, then
      // softly after the pointer
      const rotRef = lt.from && le < 1 && !Number.isNaN(lt.rot) ? lt.rot : st.rot;
      if (!Number.isNaN(rotRef)) rotT += Math.round((rotRef - rotT) / 120) * 120;
      if (Number.isNaN(st.rot)) st.rot = rotT;
      else if (lt.from && le < 1 && !Number.isNaN(lt.rot)) st.rot = lt.rot + (rotT - lt.rot) * le;
      else st.rot += (rotT - st.rot) * kk(0.07);
      const origin = startAt(an.x, an.y, slope);
      const d0 = norm(sub([0, S.hb, 0], origin));
      const P = makePrism([0, 0, 0], S.R, S.H, st.rot * DEG);
      const tr = traceBeam(P, origin, d0, nNow);
      if (!tr) return;
      const valid = tr.rays.filter((r) => r.dir);
      const E = tr.rays[0], M = valid[valid.length - 1] ?? E;
      /* the light that leaves the glass is the light of where the prism and the beam are going, not of where they are
         on the way: the glass turning between two services passes through angles where the light would graze out or
         flash off a face, so the outgoing bundle is traced at the target turn from the target name and glides there */
      const anT = anchorOf(svc), oT = startAt(anT.x, anT.y, slope);
      const trT = traceBeam(makePrism([0, 0, 0], S.R, S.H, rotT * DEG), oT, norm(sub([0, S.hb, 0], oT)), nNow) ?? tr;
      const validT = trT.rays.filter((r) => r.dir);
      const ET = validT.length ? trT.rays[0] : E, MT = validT[validT.length - 1] ?? M;
      // the aim: the bundle leaving the glass is turned the last few degrees toward the middle of the stage
      const ta = aim[svc]?.d ?? 0, ca = Math.cos(ta), sa = Math.sin(ta);
      const turn = (v: V3): V3 => [v[0] * ca - v[2] * sa, v[1], v[0] * sa + v[2] * ca];
      const pE = turn(ET.dir ?? E.dir ?? d0), pM = turn(MT.dir ?? ET.dir ?? d0);
      const OT: V3 = mul(add(ET.out, MT.out), 0.5);
      const el = (v: V3) => Math.atan2(v[1], Math.hypot(v[0], v[2]));
      const tgt: LightState = { o: OT, aE: Math.atan2(pE[2], pE[0]), aM: Math.atan2(pM[2], pM[0]), eE: el(pE), eM: el(pM) };
      // where the light leaves the glass, its heading and its spread travel as one from the last service's to this
      // one's (never through where the turning glass happens to send it on the way, which jumps from face to face). Our
      // one warm light has no first or last colour, so its edges pair with the spectrum's the way that crosses least
      // (the swap is made on the end that is our warm light, where it shows nothing, and kept until the next switch)
      if (lt.from && le < 1 && lt.swap === null) {
        const f = lt.from, keep = Math.abs(wrapA(tgt.aE - f.aE)) + Math.abs(wrapA(tgt.aM - f.aM)), cross_ = Math.abs(wrapA(tgt.aE - f.aM)) + Math.abs(wrapA(tgt.aM - f.aE));
        lt.swap = cross_ < keep ? (svc !== 1 ? "to" : "from") : "none";
        if (lt.swap === "from") lt.from = { ...f, aE: f.aM, aM: f.aE, eE: f.eM, eM: f.eE };
      }
      if (lt.swap === "to") { const a = tgt.aE, e = tgt.eE; tgt.aE = tgt.aM; tgt.aM = a; tgt.eE = tgt.eM; tgt.eM = e; }
      if (lt.from && le < 1) {
        lt.cur = mixLight(lt.from, tgt, le);
      } else lt.cur = lt.cur ? mixLight(lt.cur, tgt, kk(0.12)) : tgt;
      const cur = lt.cur;
      const dE = dirOf(cur.aE, cur.eE), dM = dirOf(cur.aM, cur.eM);
      const O: V3 = cur.o;
      let N = norm(cross(dE, dM));
      if (N[1] < 0) N = mul(N, -1);
      const fslope = -dE[1] / Math.hypot(dE[0], dE[2]);
      const land = O[1] / Math.max(fslope, 1e-3);
      st.kept += (validT.length / trT.rays.length - st.kept) * kk(0.14);
      const kept = st.kept;
      const L = Math.hypot(tr.pin[0] - origin[0], tr.pin[1] - origin[1], tr.pin[2] - origin[2]);
      if (import.meta.env.DEV) {
        const pin = project(cam, tr.pin, A), pc = project(cam, [0, S.H * 0.5, 0], A), po = project(cam, origin, A);
        window.__stPrismInfo = {
          W, Hs, list, ruleY, anchor: an, anchors: ans, rows, wins: wins.w, stand, place, rot: st.rot, exitAz: Math.atan2(O[2] - tr.pin[2], O[0] - tr.pin[0]) / DEG, dirAz: [Math.atan2(dE[2], dE[0]) / DEG, Math.atan2(dM[2], dM[0]) / DEG], kept,
          prism: [pc[0] * W, pc[1] * Hs], origin: [po[0] * W, po[1] * Hs], pin: [pin[0] * W, pin[1] * Hs], cpx, O, cam: cam.pos, art: [artM.ready, artM.key.slice(0, 60)],
        };
      }

      // the ignite: the light comes out of the letter and travels to the glass, the glass catches it, then the light
      // leaves it. A switch replays only the beam's part: the old one goes, the new one grows, the glass dips a little
      const iB = easeEnter(clamp01(since / 0.6));
      const grow = easeEnter(clamp01(since / 0.55));
      const beamF = (L + 0.3) - (L + 0.6) * grow;
      const dip = 1;
      const iG = easeEnter(clamp01((since - 0.3) / 0.5)) * dip;
      const iForm = easeEnter(clamp01((since - 0.1) / 0.8));
      const iF = easeEnter(clamp01((since - 0.6) / 0.9)) * (0.4 + 0.6 * dip);
      const front = (land + 1.5) * easeEnter(clamp01((since - 0.55) / 1.0));
      const iP = easeEnter(clamp01((since - 0.85) / 1.1)) * (0.5 + 0.5 * dip);

      /* the things on the stage this frame: each service's fade in and out with its light */
      const tSec = frozen ? 20 + (dbgT as number) : (now - t0) / 1000;
      const items: Item[] = [];
      dustN = 0;
      let dustFade = 0, projOn = 0;
      let projC: [number, number] = [0, 0], projU: [number, number] = [1, 0], projV: [number, number] = [0, 1];
      const at = (i: number, along: number, side = 0, y = 0): V3 => {
        const pl0 = place[i] ?? { o: [0, S.hb, 0] as V3, az: 0 };
        const f = dirXZ(pl0.az), r: V3 = [-f[2], 0, f[0]];
        return [pl0.o[0] + f[0] * along + r[0] * side, y, pl0.o[2] + f[2] * along + r[2] * side];
      };
      const facing = (p: V3, q: V3) => Math.atan2(q[0] - p[0], q[2] - p[2]);
      // shadow art: built for this layout's light while its service is on, then kept; the shards gather in from a
      // scatter as their service comes on and drift along their own rays (the picture holds) while it shows
      const toScreen = (p: V3): [number, number] => { const q = project(cam, p, A); return [q[0] * W, q[1] * Hs]; };
      // (built for where its service's light leaves the glass at the middle of its turn: the layout alone decides it)
      const layoutKey = (slots: ArtSlot[], extra: string, o: V3) => [extra, ...o, W, Hs, ...slots.flatMap((sl) => [...sl.at, sl.px])].map((x) => (typeof x === "number" ? x.toFixed(3) : x)).join();
      const showArt = (art: ShadowArt, i: number, mesh: number, slots: ArtSlot[], N: number, size: number, mat: Item["mat"], shape: "flake" | "voxel" = "flake") => {
        const ob0 = place[i]?.o;
        if (ob0 && svc === i && (frozen || sw > 0.2)) art.build(layoutKey(slots, `${mesh}${shape}`, ob0), { O: ob0, slots, toScreen, size, N, shape }, (m) => { if (alive && objs) objs.set(mesh, m); });
        if (!art.ready || !ob.has(mesh)) return;
        const come = svc === i && !frozen ? easeEnter(clamp01((sw - 0.1) / 1.9)) : 1;
        if (art.frame(tSec, come, stand[i]?.s || 1, O)) ob.update(mesh, art.positions!, art.normals!);
        items.push({ mesh, m: IDENT, mat, fade: st.show[i] });
      };
      if (st.show[0] > 0.004 && (stand[0]?.s ?? 1) > 0) {
        // Motion, 3D & CGI: a ball of shards hanging in the light; its shadow is a picture that, every few seconds,
        // the shards turn into the next one (to the right of the stage, where the light lies widest)
        const sd = stand[0] ?? { d: 1.6, s: 1 }, sc = sd.s;
        if (variant("motion") === "projector" || variant("motion") === "dust") {
          // only our light and the dust hanging in it; as a projector's light it lays our works on the floor
          dustN = dustFrame(at(0, sd.d + 0.2 * sc, 0, 0), 0.55 * sc, tSec, O);
          dustFade = st.show[0];
          if (variant("motion") === "projector") {
            projStart();
            projOn = st.show[0];
            const C0 = at(0, sd.d + 0.16 * sc, 0.04 * sc, 0), c0 = toScreen(C0), e = 0.05;
            const jx = toScreen([C0[0] + e, 0, C0[2]]), jz = toScreen([C0[0], 0, C0[2] + e]);
            const a11 = (jx[0] - c0[0]) / e, a21 = (jx[1] - c0[1]) / e, a12 = (jz[0] - c0[0]) / e, a22 = (jz[1] - c0[1]) / e, det = a11 * a22 - a12 * a21 || 1;
            const inv = (x: number, y: number): [number, number] => [(a22 * x - a12 * y) / det, (-a21 * x + a11 * y) / det];
            const wpx = 0.6 * W, hpx = wpx / 2;
            projC = [C0[0], C0[2]]; projU = inv(wpx / 2, 0); projV = inv(0, hpx / 2);
          }
        } else if (variant("motion") === "voxels") {
          const slots: ArtSlot[] = [{ ...MOTION_SLOT, at: at(0, sd.d + 0.42 * sc, 0.24 * sc, 0), px: 0.32 * Hs, ball: 0.42 }];
          showArt(artM, 0, M_ART, slots, 2700, 0.0095 * sc, CERAMIC, "voxel");
        } else {
          // the cushion: inflates, drops, squashes, wobbles, settles, lets its air out and floats back up
          if (!pillowIn) { pillowIn = true; ob.set(M_PILLOW, pillow.mesh()); }
          const ps = pillowPose(tSec), size = 0.3 * sc;
          pillow.shape(ps.inflate, ps.squash);
          ob.update(M_PILLOW, pillow.pos, pillow.nrm);
          const p0 = at(0, sd.d + 0.05 * sc, 0.05 * sc, 0);
          items.push({ mesh: M_PILLOW, m: model([p0[0], ps.lift * size * 0.5, p0[2]], ps.yaw, ps.tilt, ps.tilt * 0.6, size), mat: CERAMIC, fade: st.show[0] });
        }
      }
      // AI Production plays with colour alone: the spectrum over the floor, no object in it
      // Vertical Series: the light comes down as an upright 9:16 screen on the floor, and in it a marble drama, one
      // figure raised over the other (or the voxels that throw that group's shadow)
      let frameC: [number, number] = [0, 0], frameU: [number, number] = [1, 0], frameV: [number, number] = [0, 1];
      {
        const sd = stand[2] ?? { d: 1.6, s: 1 };
        const C0 = at(2, sd.d + 0.12, 0.04, 0), c0 = toScreen(C0), e = 0.05;
        const jx = toScreen([C0[0] + e, 0, C0[2]]), jz = toScreen([C0[0], 0, C0[2] + e]);
        const a11 = (jx[0] - c0[0]) / e, a21 = (jx[1] - c0[1]) / e, a12 = (jz[0] - c0[0]) / e, a22 = (jz[1] - c0[1]) / e, det = a11 * a22 - a12 * a21 || 1;
        const inv = (x: number, y: number): [number, number] => [(a22 * x - a12 * y) / det, (-a21 * x + a11 * y) / det];
        const hpx = Math.min(0.68 * Hs, Hs - ruleY - 60), wpx = (hpx * 9) / 16;
        frameC = [C0[0], C0[2]]; frameU = inv(wpx / 2, 0); frameV = inv(0, hpx / 2);
        if (st.show[2] > 0.004 && variant("vertical") === "hercules" && ob.has(M_HERC)) {
          // the Hercules group stood in the frame a little toward the light, turned mostly to the light (the faces
          // catch it) and partly to us; the light keys the raised figure and throws the group's long shadow
          const P0: V3 = [C0[0] - frameU[0] * 0.2 + frameV[0] * 0.25, 0, C0[2] - frameU[1] * 0.2 + frameV[1] * 0.25];
          const sc = 1.1 * (sd.s || 1);
          const toCam = facing(P0, [cam.pos[0], 0, cam.pos[2]]), toLight = facing(P0, [O[0], 0, O[2]]);
          const yaw = toLight + 0.45 * Math.atan2(Math.sin(toCam - toLight), Math.cos(toCam - toLight)) + 0.25 + 0.05 * Math.sin(0.2 * tSec);
          items.push({ mesh: M_HERC, m: model([P0[0], -ob.lowest(M_HERC, 0) * sc, P0[2]], yaw, 0, 0, sc), mat: MARBLE, fade: st.show[2] });
        }
      }
      if (st.show[2] > 0.004 && variant("vertical") === "busts" && ob.has(M_CAESAR) && ob.has(M_SENATOR) && (stand[2]?.s ?? 1) > 0) {
        // Vertical Series: two busts in conversation, side by side along the light, each cheated out to us and turned to
        // the other; they turn a little, in turn, as if one speaks and the other answers. Fine dust drifts off them
        // downstream in the light and hangs around them, lit only where the light reaches
        const sd = stand[2] ?? { d: 1.6, s: 1 }, sc = sd.s * 0.55;
        const a = at(2, sd.d - 0.5 * sc, -0.24 * sc, 0), b = at(2, sd.d + 0.5 * sc, 0.06 * sc, 0), f = st.show[2];
        const toCam = (p: V3) => facing(p, [cam.pos[0], 0, cam.pos[2]]);
        const lean = -0.24;
        const blend = (x: number, y: number, k: number) => x + k * Math.atan2(Math.sin(y - x), Math.cos(y - x));
        // turned well to each other; the far one also to the light, so its face is lit; both move a little, slowly
        const ya = blend(toCam(a), facing(a, b), 0.62) + 0.07 * Math.sin(0.35 * tSec);
        const yb = blend(blend(toCam(b), facing(b, a), 0.5), facing(b, [O[0], 0, O[2]]), 0.55) + 0.07 * Math.sin(0.35 * tSec + 2.4);
        const mA = model([a[0], -ob.lowest(M_CAESAR, lean) * sc, a[2]], ya, lean + 0.025 * Math.sin(0.5 * tSec + 1), 0, sc);
        const mB = model([b[0], -ob.lowest(M_SENATOR, lean) * sc, b[2]], yb, lean + 0.025 * Math.sin(0.5 * tSec + 2.6), 0, sc);
        items.push({ mesh: M_CAESAR, m: mA, mat: MARBLE, fade: f });
        items.push({ mesh: M_SENATOR, m: mB, mat: MARBLE, fade: f });
        dustN = dustFrame([(a[0] + b[0]) / 2, 0, (a[2] + b[2]) / 2], sc, tSec, O);
        dustFade = st.show[2];
      }
      // the light: where it leaves the glass, the bundle's edges, how wide it spreads, its strength
      const lAE = Math.atan2(dE[2], dE[0]), lAM = Math.atan2(dM[2], dM[0]);
      // our light opens wide (Motion's picture stands tall in it), a little wider still for Vertical's frame
      const wedge = (0.3 + 0.05 * (px + 1)) * (1 + 0.45 * st.k) * (1 - st.spec) + 0.17 * st.spec;
      const lGain = 2.6 * iP * kept;
      const hw = 0.5 * Math.abs(Math.atan2(Math.sin(lAM - lAE), Math.cos(lAM - lAE))) + wedge;
      const amid = lAE + 0.5 * Math.atan2(Math.sin(lAM - lAE), Math.cos(lAM - lAE));
      const lFov = 1.9;
      const lvp = lightClip(O, [Math.cos(amid) * Math.cos(0.1), Math.sin(0.1), Math.sin(amid) * Math.cos(0.1)], lFov, Math.tan(Math.min(1.2, hw + 0.1)) / Math.tan(lFov / 2), 0.05, L_FAR);
      if (import.meta.env.DEV && window.__stPrismTrace) {
        window.__stPrismTrace.push({ t: Math.round(now), svc, rot: +st.rot.toFixed(2), rotT: +rotT.toFixed(2), O: O.map((v) => +v.toFixed(3)), aE: +(lAE / DEG).toFixed(2), aM: +(lAM / DEG).toFixed(2), elE: +(Math.atan2(dE[1], Math.hypot(dE[0], dE[2])) / DEG).toFixed(2), elM: +(Math.atan2(dM[1], Math.hypot(dM[0], dM[2])) / DEG).toFixed(2), land: +land.toFixed(3), kept: +kept.toFixed(3), spec: +st.spec.toFixed(3), nValid: valid.length, an: [Math.round(an.x), Math.round(an.y)] });
        if (window.__stPrismNoGL) return;
      }
      const off = (import.meta.env.DEV && (window as unknown as { __stPrismOff?: Record<string, boolean> }).__stPrismOff) || {};
      if (off.objects) items.length = 0;
      const shadowOn = !off.shadow && ob.ok && items.some((it) => it.fade > 0.3 && ob.has(it.mesh));
      const prof = import.meta.env.DEV && window.__stPrismProf ? { t: performance.now(), px: new Uint8Array(4), marks: [] as number[] } : null;
      const mark = () => { if (prof) { gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, prof.px); const t = performance.now(); prof.marks.push(Math.round(t - prof.t)); prof.t = t; } };
      if (shadowOn) ob.shadow(items, lvp, O, L_FAR);
      mark();
      const setLight = (uu: (n: string) => WebGLUniformLocation | null, air = 1) => {
        gl.uniform1f(uu("uGoboAll"), air);
        gl.uniform3f(uu("uLO"), O[0], O[1], O[2]);
        gl.uniform1f(uu("uLSpec"), st.spec);
        gl.uniform1f(uu("uGobo"), variant("vertical") === "hercules" ? st.k : 0); gl.uniform1f(uu("uGoboR"), 0.14); gl.uniform1f(uu("uGoboSoft"), 0.025); gl.uniform1f(uu("uGoboOut"), 0.07);
        gl.uniform2f(uu("uGoboC"), frameC[0], frameC[1]); gl.uniform2f(uu("uGoboU"), frameU[0], frameU[1]); gl.uniform2f(uu("uGoboV"), frameV[0], frameV[1]);
        gl.uniform1f(uu("uLAE"), lAE); gl.uniform1f(uu("uLAM"), lAM);
        gl.uniform1f(uu("uLWedge"), wedge); gl.uniform1f(uu("uLGain"), lGain);
        gl.uniformMatrix4fv(uu("uLVP"), false, lvp);
        gl.uniform1f(uu("uShadowOn"), shadowOn ? 1 : 0); gl.uniform1f(uu("uLFar"), L_FAR);
        gl.uniform1f(uu("uShadowTx"), 1 / ob.shadowSize);
        gl.uniform1i(uu("uShadow"), 3);
      };

      // the prism's own picture
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.useProgram(prog);
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      gl.disableVertexAttribArray(1);
      gl.disable(gl.DEPTH_TEST); gl.disable(gl.BLEND);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_2D, ob.shadowTex);
      setLight(u);
      gl.uniform2f(u("uRes"), canvas.width, canvas.height);
      f1("uTime", tSec);
      v3("uCamPos", cam.pos); v3("uCamF", cam.f); v3("uCamR", cam.r); v3("uCamU", cam.u);
      f1("uFocal", cam.focal);
      f2("uShift", cam.shift[0], cam.shift[1]);
      f1("uPx", 2 / (canvas.height * cam.focal));
      f1("uCore", 1.2 * Math.min(cpx, 1.5));
      const pl = new Float32Array(20);
      for (let i = 0; i < 5; i++) { pl[i * 4] = P.n[i][0]; pl[i * 4 + 1] = P.n[i][1]; pl[i * 4 + 2] = P.n[i][2]; pl[i * 4 + 3] = P.d[i]; }
      gl.uniform4fv(u("uPl[0]"), pl);
      v3("uTint", S.tint); f1("uBev", S.bevel);
      f1("uFrost", 1);
      // without dispersion the two paths in the glass are one
      // the hot spots where the light leaves the glass go with the light (its first and last colour either side)
      const hs = (p: V3): V3 => [O[0] + (p[0] - OT[0]), O[1] + (p[1] - OT[1]), O[2] + (p[2] - OT[2])];
      const poE = hs(ET.out), poM0 = hs(MT.out);
      const poM: V3 = [poM0[0] + (poE[0] - poM0[0]) * st.proj, poM0[1] + (poE[1] - poM0[1]) * st.proj, poM0[2] + (poE[2] - poM0[2]) * st.proj];
      v3("uBA", origin); v3("uPin", tr.pin); v3("uPoE", poE); v3("uPoM", poM);
      v3("uBA0", origin); v3("uPin0", tr.pin); f1("uIB0", 0);
      v3("uIrA", tr.inner.a); v3("uIrB", tr.inner.b); f1("uIrI", tr.inner.F * 1.2);
      v3("uFanO", O); v3("uFanN", N);
      f1("uFanAE", Math.atan2(dE[2], dE[0])); f1("uFanAM", Math.atan2(dM[2], dM[0])); f1("uFanM", fslope);
      f1("uHaze", S.haze); f1("uFanGain", S.fanGain); f1("uLandGain", S.landGain * (1 + 0.4 * st.proj)); f1("uEnv", S.env);
      f1("uAirFan", S.airFan * (1 + 1.1 * st.spec)); f1("uFanRefl", S.fanRefl);
      // our light lands as a wider, softer field than the spectrum
      f1("uFanBlur", S.fanBlur * (1 + 0.8 * st.proj) * (1 - 0.45 * st.spec)); f1("uPoolSoft", S.poolSoft * (1 + 0.7 * st.proj)); f1("uPoolTh", S.poolTh); f1("uGain", S.gain);
      f1("uFadeLen", S.fadeLen);
      // the beam gathers its full width and glow over this stretch out of the letter (world units)
      f1("uTaper", Math.min(0.45, L * 0.32));
      // keep the light clear of the hairline under the head (canvas px from the bottom, where the fade ends)
      f1("uTopY", ruleY > 0 ? (Hs - ruleY - 28) * cpx : 1e5);
      f1("uTopSoft", 70 * cpx);
      f1("uIB", iB); f1("uBeamF", beamF); f1("uIG", iG); f1("uIForm", iForm);
      f1("uIF", iF * kept); f1("uFront", front); f1("uIP", iP * kept);
      f1("uSpecW", st.spec);
      // the haze our light lights in the air (fainter for the spectrum, whose fan already draws itself)
      f1("uAirCone", off.air || !TIERS[quality.tier].air ? 0 : (0.055 - 0.01 * st.spec) * S.haze);
      // the projection: the current frame of the video, cropped to the frame's shape; it dips at each cut
      let pw = 0;
      if (projOn > 0.004 && projVid && projTex && projVid.readyState >= 2 && projVid.videoWidth) {
        gl.activeTexture(gl.TEXTURE4); gl.bindTexture(gl.TEXTURE_2D, projTex);
        try { gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, projVid); pw = projOn; } catch { pw = 0; }
        const ar = projVid.videoWidth / projVid.videoHeight, fa = Math.hypot(projU[0], projU[1]) > 0 ? 2 : 2;
        f2("uProjCrop", ar > fa ? fa / ar : 1, ar > fa ? 1 : ar / fa);
        const sinceCut = (performance.now() - projAt) / 1000, left = projVid.duration ? projVid.duration - projVid.currentTime : 9;
        pw *= Math.min(1, sinceCut / 0.35) * Math.min(1, left / 0.3);
      }
      f1("uProjW", pw); f1("uProjGain", 2.6);
      f2("uProjC", projC[0], projC[1]); f2("uProjU", projU[0], projU[1]); f2("uProjV", projV[0], projV[1]);
      gl.activeTexture(gl.TEXTURE0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      mark();

      // the things, mirrored in the floor and then themselves, in the same light
      if (ob.ok && (items.length || dustN)) {
        const vp = camClip(cam.pos, cam.f, cam.r, cam.u, cam.focal, cam.shift, A);
        const cols = stops.map((c) => [c[0] + (stops[0][0] - c[0]) * st.proj, c[1] + (stops[0][1] - c[1]) * st.proj, c[2] + (stops[0][2] - c[2]) * st.proj]);
        const shared = (lp: WebGLProgram) => {
          const uu = (n: string) => ob.u(lp, n);
          setLight(uu, 0);
          cols.forEach((c, i) => gl.uniform3f(uu(`uS${i}`), c[0], c[1], c[2]));
          gl.uniform3f(uu("uCamPos"), cam.pos[0], cam.pos[1], cam.pos[2]);
          gl.uniform2f(uu("uRes"), canvas.width, canvas.height);
          gl.uniform1f(uu("uTopY"), ruleY > 0 ? (Hs - ruleY - 28) * cpx : 1e5);
          gl.uniform1f(uu("uTopSoft"), 70 * cpx);
          gl.uniform1f(uu("uGain"), S.gain); gl.uniform1f(uu("uGrain"), 0.03); gl.uniform1f(uu("uTime"), tSec);
        };
        ob.draw(items, vp, shared, canvas.width, canvas.height);
        if (dustN) ob.dust(dustData, dustN, vp, (cam.focal * canvas.height) / 2, dustFade, shared, Math.hypot(cam.pos[0] - place[svc].o[0], cam.pos[1], cam.pos[2] - place[svc].o[2]), 9 * cpx);
      }
      mark();
      if (prof) window.__stPrismProf = prof.marks;
    };

    let lastKey = "";
    /* frame pacing: the time between frames, smoothed; slow frames drop the quality a step at once, frames with room
       to spare lift it a step after a long while */
    let ema = 16, prev = 0, slowMs = 0, fastMs = 0, holdUntil = 0, errors = 0, drawn = false;
    const pace = (now: number) => {
      const dt = prev ? Math.min(200, now - prev) : 16;
      prev = now;
      ema += (dt - ema) * 0.08;
      if (now < holdUntil || typeof window.__stSceneT === "number" || window.__stPrismBudget) return;
      slowMs = ema > 30 ? slowMs + dt : 0;
      fastMs = ema < 18 ? fastMs + dt : 0;
      const step = (to: number) => { quality.tier = to; resize(); lastKey = ""; ema = 16; slowMs = fastMs = 0; holdUntil = now + 1500; };
      if (slowMs > 700 && quality.tier < TIERS.length - 1) step(quality.tier + 1);
      else if (fastMs > 6000 && quality.tier > 0) step(quality.tier - 1);
    };
    const loop = (now: number) => {
      raf = running ? requestAnimationFrame(loop) : 0;
      if (!poll()) { prev = 0; return; }
      if (import.meta.env.DEV && window.__stPrismHold) return;
      if (dirty) { dirty = false; resize(); lastKey = ""; }
      // debug clock frozen: draw only when what is shown changes (keeps headless captures responsive)
      const clock = import.meta.env.DEV ? window.__stClock : undefined;
      if (typeof clock === "number") now = clock;
      const key = typeof clock === "number" ? `clock${clock}|${activeRef.current}` : typeof window.__stSceneT === "number" ? `${window.__stSceneT}|${window.__stPrismPx}|${window.__stPrismPy}|${activeRef.current}|${JSON.stringify(window.__stPrismDbg ?? null)}|${canvas.width}x${canvas.height}` : "";
      if (!key || key !== lastKey) {
        const tq = performance.now();
        try {
          draw(now);
          errors = 0;
        } catch (err) {
          // one bad frame never takes the section down; a scene that keeps failing stops and stays dark
          if (++errors === 1) console.warn("ScenePrism frame:", err);
          if (errors > 4) { running = false; cancelAnimationFrame(raf); raf = 0; box.removeAttribute("data-ready"); return; }
        }
        if (!drawn && errors === 0) { drawn = true; box.setAttribute("data-ready", ""); loadMeshes(); }
        if (import.meta.env.DEV && window.__stPrismTime) { const px1 = new Uint8Array(4); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px1); window.__stPrismTime.push(performance.now() - tq); }
      }
      lastKey = key;
      pace(now);
    };
    // the loop runs only while a service is on, on screen and the page is visible; reduced motion: one still frame
    const sync = () => {
      const want = activeRef.current >= 0 && visible && !document.hidden && !reduce && !lost;
      if (want && !running) { running = true; last = performance.now(); prev = 0; raf = requestAnimationFrame(loop); }
      else if (!want && running) { running = false; cancelAnimationFrame(raf); raf = 0; }
    };
    /** reduced motion: one still frame, drawn as soon as the program is ready */
    const still = () => {
      if (!poll()) { setTimeout(still, 100); return; }
      if (dirty) { dirty = false; resize(); }
      try { draw(performance.now()); if (!drawn) { drawn = true; box.setAttribute("data-ready", ""); loadMeshes(); } } catch (err) { console.warn("ScenePrism frame:", err); }
    };
    let wasOn = false;
    const wake = () => {
      const isOn = activeRef.current >= 0;
      if (isOn && !wasOn) { tOn = performance.now(); beam.svc = -1; beam.old = null; lastKey = ""; }
      if (isOn && reduce) still();
      wasOn = isOn;
      sync();
    };
    wakeRef.current = wake;
    if (import.meta.env.DEV) window.__stPrismRun = (frames, withGL) => {
      const out: Record<string, unknown>[] = [], ng = window.__stPrismNoGL;
      window.__stPrismTrace = out; window.__stPrismNoGL = !withGL;
      try { for (const f of frames) { window.__stActive = f.a; if (typeof f.py === "number") window.__stPrismPy = f.py; draw(f.t); } } finally { window.__stPrismNoGL = ng; delete window.__stActive; window.__stPrismTrace = undefined; }
      return out;
    };

    // the GPU can drop the context (an overloaded or sleeping GPU): build the scene again a step lighter
    let lost = false;
    const onLost = (e: Event) => {
      e.preventDefault();
      lost = true;
      running = false; cancelAnimationFrame(raf); raf = 0;
      box.removeAttribute("data-ready");
      quality.losses++;
      quality.tier = Math.min(TIERS.length - 1, quality.tier + 2);
      if (quality.losses <= 3) setTimeout(() => setGen((g) => g + 1), 400);
    };
    canvas.addEventListener("webglcontextlost", onLost);

    // sizes change the canvas on the next frame (never a draw inside the observer)
    let dirty = false;
    resize();
    wake();
    const ro = new ResizeObserver(() => { dirty = true; if (reduce && activeRef.current >= 0) still(); });
    ro.observe(box);
    if (section) ro.observe(section);
    document.fonts?.ready.then(() => { dirty = true; }).catch(() => {});
    const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; sync(); });
    io.observe(box);
    const onMove = (e: PointerEvent) => {
      const r = box.getBoundingClientRect();
      if (r.width < 1) return;
      pxT = Math.max(-1, Math.min(1, ((e.clientX - r.left) / r.width) * 2 - 1));
      // y in site px (the rows decide what it turns)
      yT = ((e.clientY - r.top) / r.height) * Math.max(1, box.offsetHeight);
      if (reduce && activeRef.current >= 0) still();
    };
    window.addEventListener("pointermove", onMove);
    document.addEventListener("visibilitychange", sync);

    return () => {
      running = false; cancelAnimationFrame(raf);
      wakeRef.current = null;
      ro.disconnect(); io.disconnect();
      window.removeEventListener("pointermove", onMove);
      document.removeEventListener("visibilitychange", sync);
      canvas.removeEventListener("webglcontextlost", onLost);
      alive = false;
      if (!lost) {
        objs?.dispose();
        if (tex) gl.deleteTexture(tex);
        if (projTex) gl.deleteTexture(projTex);
        if (buf) gl.deleteBuffer(buf);
        gl.deleteProgram(prog);
        gl.getExtension("WEBGL_lose_context")?.loseContext();
      }
      if (projVid) { projVid.pause(); projVid.removeAttribute("src"); projVid.load(); }
      canvas.remove();
    };
  }, [mode, gen]);

  useEffect(() => { wakeRef.current?.(); }, [active]);

  return <div ref={boxRef} className="st-stage__fill" aria-hidden />;
}
