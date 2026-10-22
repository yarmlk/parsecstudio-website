import { useEffect, useRef } from "react";
import { kelvinRGB } from "../../ui/LightField";
import { PRISM_FRAG, PRISM_VERT } from "./ScenePrism.glsl";
import { CERAMIC, FROST, MARBLE, Objects, axisAngle, camClip, dirXZ, lightClip, loadMesh, model, puck, ring, sphere, type Item } from "./ScenePrism.objects";
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
/** the busts (packed meshes, public/mesh): fetched the first time the stage mounts */
const BUSTS = ["mesh/caesar.bin", "mesh/senator.bin", "mesh/colossus.bin"] as const;
/** mesh slots: the Motion sculpture (a frosted ring-disc around a black ceramic disc), then the busts */
const M_RING = 0, M_DISC = 1, M_ORB = 2, M_CAESAR = 3, M_SENATOR = 4, M_COLOSSUS = 5, M_PILL = 6;
/** each service's things, as the frame sees them: their height and their reach around their base (world units at
 *  scale 1); they stand in their service's light as far out as the frame lets them, never past STAND_MAX */
const DIMS = [{ h: 1.15, r: 0.85 }, { h: 0.55, r: 0.6 }, { h: 0.95, r: 0.9 }];
/** where each service's things sit across the frame (their middle, as a fraction of the section's width) */
const AIM_X = [0.775, 0.77, 0.775];
const STAND_MAX = 2.6;
/** the colossal head lies back on the floor, its face turned up to the camera above */
const COLOSSUS_TILT = -1.05;
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
    /** debug: the canvas's pixel budget (headless checks run on a software GPU) */
    __stPrismBudget?: number;
    /** debug: what the scene laid out last frame (site px), for checks */
    __stPrismInfo?: Record<string, unknown>;
  }
}

/** how long the old beam takes to go, and the new one to grow from the letter into the glass (s) */
const BEAM_OUT = 0.22, BEAM_IN = 0.5;

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
    const gl = canvas.getContext("webgl", { antialias: !window.__stPrismNoAA, alpha: false, premultipliedAlpha: false, powerPreference: "high-performance" });
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
    gl.bindAttribLocation(prog, 0, "a");
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

    const tex = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.uniform1i(u("uSpec"), 0);
    gl.uniform1i(u("uShadow"), 3);
    let lutSat = NaN;

    /* the things the light falls on */
    const objs = new Objects(gl);
    objs.set(M_RING, ring(0.52, 0.12, 0.022, 224, 32));
    objs.set(M_DISC, sphere(0.3, 128, 64));
    objs.set(M_ORB, sphere(0.085));
    objs.set(M_PILL, puck(0.11, 0.035));
    let alive = true;
    BUSTS.forEach((url, i) => loadMesh(url).then((m) => { if (alive) objs.set(M_CAESAR + i, m); }).catch(() => {}));

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
    const st = { spec: 0, proj: 1, k: 0, rot: NaN, svc: Math.max(0, activeRef.current), show: [0, 0, 0] };
    /** where each service's things stand: its light's origin and direction at the middle of its turn (per layout) */
    let place: { o: V3; az: number }[] = [];
    /** how far along its light each service's things stand, and their scale (fitted to the frame per layout) */
    let stand: { d: number; s: number }[] = [];
    /* the beam: where it starts (the active name) and since when; the one before it, going where it was */
    const beam = { svc: -1, tSw: -1e9, old: null as null | { o: V3; pin: V3 } };
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
      const d = Math.min(base, Math.sqrt((window.__stPrismBudget ?? 2_600_000) / Math.max(1, r.width * r.height)));
      canvas.width = Math.max(2, Math.round(r.width * d));
      canvas.height = Math.max(2, Math.round(r.height * d));
      cpx = canvas.height / lh;
      gl.viewport(0, 0, canvas.width, canvas.height);
      measure();
    };

    const draw = (now: number) => {
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

      // the service on show (the last one while none is)
      if (activeRef.current >= 0) st.svc = activeRef.current;
      const svc = st.svc;
      st.spec += ((svc === 1 ? 1 : 0) - st.spec) * kk(0.08);
      st.proj = 1 - st.spec;
      st.k += ((svc === 2 ? 1 : 0) - st.k) * kk(0.08);

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
      if (beam.svc !== svc) {
        if (beam.svc >= 0 && !frozen) {
          const oa = anchorOf(beam.svc), oo = startAt(oa.x, oa.y, S.slope);
          const oP = makePrism([0, 0, 0], S.R, S.H, (Number.isNaN(st.rot) ? 0 : st.rot) * DEG);
          const ot = traceBeam(oP, oo, norm(sub([0, S.hb, 0], oo)), nAt(1, 0));
          beam.old = { o: oo, pin: ot ? ot.pin : [0, S.hb, 0] };
        }
        beam.tSw = beam.svc >= 0 && !frozen ? tNow : -1e9;
        beam.svc = svc;
      }
      const sw = tNow - beam.tSw;
      const an = anchorOf(svc);

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
          for (const sc of [3.2, 2.9, 2.6, 2.35, 2.1, 1.9, 1.7, 1.5, 1.3, 1.15, 1, 0.85, 0.7, 0.6, 0.5]) {
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
      if (!Number.isNaN(st.rot)) rotT += Math.round((st.rot - rotT) / 120) * 120;
      st.rot = Number.isNaN(st.rot) ? rotT : st.rot + (rotT - st.rot) * kk(0.07);
      const origin = startAt(an.x, an.y, slope);
      const d0 = norm(sub([0, S.hb, 0], origin));
      const P = makePrism([0, 0, 0], S.R, S.H, st.rot * DEG);
      const tr = traceBeam(P, origin, d0, nNow);
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
      if (import.meta.env.DEV) {
        const pin = project(cam, tr.pin, A), pc = project(cam, [0, S.H * 0.5, 0], A), po = project(cam, origin, A);
        window.__stPrismInfo = {
          W, Hs, list, ruleY, anchor: an, anchors: ans, rows, wins: wins.w, stand, place, rot: st.rot, exitAz: Math.atan2(O[2] - tr.pin[2], O[0] - tr.pin[0]) / DEG, dirAz: [Math.atan2(dE[2], dE[0]) / DEG, Math.atan2(dM[2], dM[0]) / DEG], kept,
          prism: [pc[0] * W, pc[1] * Hs], origin: [po[0] * W, po[1] * Hs], pin: [pin[0] * W, pin[1] * Hs], cpx,
        };
      }

      // the ignite: the light comes out of the letter and travels to the glass, the glass catches it, then the light
      // leaves it. A switch replays only the beam's part: the old one goes, the new one grows, the glass dips a little
      const iB = easeEnter(clamp01(since / 0.6));
      const grow = Math.min(easeEnter(clamp01(since / 0.55)), easeEnter(clamp01((sw - BEAM_OUT * 0.5) / BEAM_IN)));
      const beamF = (L + 0.3) - (L + 0.6) * grow;
      const dip = sw < 3 ? 1 - 0.45 * clamp01(sw / BEAM_OUT) * (1 - easeEnter(clamp01((sw - BEAM_OUT) / (BEAM_IN * 1.2)))) : 1;
      const iG = easeEnter(clamp01((since - 0.3) / 0.5)) * dip;
      const iForm = easeEnter(clamp01((since - 0.1) / 0.8));
      const iF = easeEnter(clamp01((since - 0.6) / 0.9)) * (0.4 + 0.6 * dip);
      const front = (land + 1.5) * easeEnter(clamp01((since - 0.55) / 1.0));
      const iP = easeEnter(clamp01((since - 0.85) / 1.1)) * (0.5 + 0.5 * dip);
      const oldF = beam.old && sw < BEAM_OUT ? 1 - easeEnter(clamp01(sw / BEAM_OUT)) : 0;
      if (oldF <= 0) beam.old = null;

      /* the things on the stage this frame: each service's fade in and out with its light */
      const tSec = frozen ? 20 + (dbgT as number) : (now - t0) / 1000;
      for (let i = 0; i < 3; i++) st.show[i] += ((svc === i ? 1 : 0) - st.show[i]) * kk(0.05);
      const items: Item[] = [];
      const at = (i: number, along: number, side = 0, y = 0): V3 => {
        const pl0 = place[i] ?? { o: [0, S.hb, 0] as V3, az: 0 };
        const f = dirXZ(pl0.az), r: V3 = [-f[2], 0, f[0]];
        return [pl0.o[0] + f[0] * along + r[0] * side, y, pl0.o[2] + f[2] * along + r[2] * side];
      };
      const facing = (p: V3, q: V3) => Math.atan2(q[0] - p[0], q[2] - p[2]);
      if (st.show[0] > 0.004 && (stand[0]?.s ?? 1) > 0) {
        // Motion, 3D & CGI: the orbital object — a glossy black ceramic sphere inside a wide frosted ring-disc, the ring
        // slowly precessing, a frosted moon and a small black disc on their orbits; the light lines their edges and the
        // ring throws its ellipse of shadow across the sphere and the floor
        const sd = stand[0] ?? { d: 1.6, s: 1 }, sc = sd.s;
        const c = at(0, sd.d, 0, 0.62 * sc), f = st.show[0];
        const pre = 0.13 * tSec;
        const tilt = axisAngle([0, 0, 0], [Math.cos(pre), 0, Math.sin(pre)], 1.05 + 0.08 * Math.sin(0.21 * tSec));
        items.push({ mesh: M_RING, m: axisAngle(c, [0, 1, 0], 0.07 * tSec, sc, tilt), mat: FROST, fade: f });
        items.push({ mesh: M_DISC, m: axisAngle(c, [0.15, 1, 0.1], 0.1 * tSec, sc), mat: CERAMIC, fade: f });
        const ph = 0.31 * tSec;
        const orb: V3 = [c[0] + Math.cos(ph) * 0.92 * sc, c[1] + Math.sin(ph) * 0.3 * sc, c[2] + Math.sin(ph) * 0.78 * sc];
        items.push({ mesh: M_ORB, m: model(orb, 0, 0, 0, sc), mat: FROST, fade: f });
        const kn: V3 = [c[0] - Math.cos(ph * 0.8 + 1) * 0.86 * sc, c[1] + Math.sin(ph * 0.8 + 1) * 0.36 * sc, c[2] - Math.sin(ph * 0.8 + 1) * 0.7 * sc];
        items.push({ mesh: M_PILL, m: axisAngle(kn, [1, 0.4, 0.2], 0.6 * tSec, sc), mat: CERAMIC, fade: f });
      }
      if (st.show[1] > 0.004 && objs.has(M_COLOSSUS) && (stand[1]?.s ?? 1) > 0) {
        // AI Production: a colossal head lying tilted back on the floor, the spectrum across its face
        const sd = stand[1] ?? { d: 1.4, s: 1 }, sc = sd.s;
        const p0 = at(1, sd.d, 0, 0), o = place[1]?.o ?? [0, 0, 0];
        const tilt = COLOSSUS_TILT + 0.03 * Math.sin(0.21 * tSec);
        const p: V3 = [p0[0], -objs.lowest(M_COLOSSUS, tilt) * sc, p0[2]];
        items.push({ mesh: M_COLOSSUS, m: model(p, facing(p, o) - 0.75 + 0.06 * Math.sin(0.15 * tSec), tilt, 0, sc), mat: MARBLE, fade: st.show[1] });
      }
      if (st.show[2] > 0.004 && objs.has(M_CAESAR) && objs.has(M_SENATOR) && (stand[2]?.s ?? 1) > 0) {
        // Vertical Series: two busts in conversation, turned to each other, one answering the other
        const sd = stand[2] ?? { d: 1.6, s: 1 }, sc = sd.s;
        // side by side along the light (the nearer one a little toward us, so it never shades the other), each turned
        // half to us and half to the other, leaning back a touch so the faces meet the camera above
        // two figures on a stage: side by side along the light, each cheated out to us and turned to the other, the
        // further one a step back so the nearer one's shadow passes it by; the light keys one face and rims the other
        const a = at(2, sd.d - 0.42 * sc, -0.2 * sc, 0), b = at(2, sd.d + 0.42 * sc, 0.22 * sc, 0), f = st.show[2];
        const toCam = (p: V3) => facing(p, [cam.pos[0], 0, cam.pos[2]]);
        const lean = -0.24;
        const blend = (x: number, y: number, k: number) => x + k * Math.atan2(Math.sin(y - x), Math.cos(y - x));
        const ya = blend(toCam(a), facing(a, b), 0.5) + 0.06 * Math.sin(0.5 * tSec);
        const yb = blend(toCam(b), facing(b, a), 0.5) + 0.06 * Math.sin(0.5 * tSec + 2.2);
        items.push({ mesh: M_CAESAR, m: model([a[0], -objs.lowest(M_CAESAR, lean) * sc, a[2]], ya, lean + 0.02 * Math.sin(0.9 * tSec + 1), 0, sc), mat: MARBLE, fade: f });
        items.push({ mesh: M_SENATOR, m: model([b[0], -objs.lowest(M_SENATOR, lean) * sc, b[2]], yb, lean + 0.02 * Math.sin(0.9 * tSec + 2.6), 0, sc), mat: MARBLE, fade: f });
      }
      // the light: where it leaves the glass, the bundle's edges, how wide it spreads, its strength
      const lAE = Math.atan2(dE[2], dE[0]), lAM = Math.atan2(dM[2], dM[0]);
      // our light opens wider for the two figures of Vertical than for the one object of Motion
      const wedge = (0.2 + 0.06 * (px + 1)) * (1 + 0.75 * st.k) * (1 - st.spec) + 0.05 * st.spec;
      const lGain = 2.6 * iP * kept;
      const hw = 0.5 * Math.abs(Math.atan2(Math.sin(lAM - lAE), Math.cos(lAM - lAE))) + wedge;
      const amid = lAE + 0.5 * Math.atan2(Math.sin(lAM - lAE), Math.cos(lAM - lAE));
      const lFov = 1.9;
      const lvp = lightClip(O, [Math.cos(amid) * Math.cos(0.1), Math.sin(0.1), Math.sin(amid) * Math.cos(0.1)], lFov, Math.tan(Math.min(1.2, hw + 0.1)) / Math.tan(lFov / 2), 0.05, L_FAR);
      const off = (import.meta.env.DEV && (window as unknown as { __stPrismOff?: Record<string, boolean> }).__stPrismOff) || {};
      if (off.objects) items.length = 0;
      const shadowOn = !off.shadow && objs.ok && items.some((it) => it.fade > 0.3 && objs.has(it.mesh));
      const prof = import.meta.env.DEV && window.__stPrismProf ? { t: performance.now(), px: new Uint8Array(4), marks: [] as number[] } : null;
      const mark = () => { if (prof) { gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, prof.px); const t = performance.now(); prof.marks.push(Math.round(t - prof.t)); prof.t = t; } };
      if (shadowOn) objs.shadow(items, lvp, O, L_FAR);
      mark();
      const setLight = (uu: (n: string) => WebGLUniformLocation | null) => {
        gl.uniform3f(uu("uLO"), O[0], O[1], O[2]);
        gl.uniform1f(uu("uLAE"), lAE); gl.uniform1f(uu("uLAM"), lAM);
        gl.uniform1f(uu("uLWedge"), wedge); gl.uniform1f(uu("uLGain"), lGain);
        gl.uniformMatrix4fv(uu("uLVP"), false, lvp);
        gl.uniform1f(uu("uShadowOn"), shadowOn ? 1 : 0); gl.uniform1f(uu("uLFar"), L_FAR);
        gl.uniform1f(uu("uShadowTx"), 1 / objs.shadowSize);
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
      gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_2D, objs.shadowTex);
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
      // without dispersion the two paths in the glass are one
      const poM: V3 = [M.out[0] + (E.out[0] - M.out[0]) * st.proj, M.out[1] + (E.out[1] - M.out[1]) * st.proj, M.out[2] + (E.out[2] - M.out[2]) * st.proj];
      v3("uBA", origin); v3("uPin", tr.pin); v3("uPoE", E.out); v3("uPoM", poM);
      v3("uBA0", beam.old?.o ?? origin); v3("uPin0", beam.old?.pin ?? tr.pin); f1("uIB0", oldF);
      v3("uIrA", tr.inner.a); v3("uIrB", tr.inner.b); f1("uIrI", tr.inner.F * 1.2);
      v3("uFanO", O); v3("uFanN", N);
      f1("uFanAE", Math.atan2(dE[2], dE[0])); f1("uFanAM", Math.atan2(dM[2], dM[0])); f1("uFanM", fslope);
      f1("uHaze", S.haze); f1("uFanGain", S.fanGain); f1("uLandGain", S.landGain * (1 + 0.4 * st.proj)); f1("uEnv", S.env);
      f1("uAirFan", S.airFan); f1("uFanRefl", S.fanRefl);
      // our light lands as a wider, softer field than the spectrum
      f1("uFanBlur", S.fanBlur * (1 + 0.8 * st.proj)); f1("uPoolSoft", S.poolSoft * (1 + 0.7 * st.proj)); f1("uPoolTh", S.poolTh); f1("uGain", S.gain);
      f1("uFadeLen", S.fadeLen);
      // keep the light clear of the hairline under the head (canvas px from the bottom, where the fade ends)
      f1("uTopY", ruleY > 0 ? (Hs - ruleY - 28) * cpx : 1e5);
      f1("uTopSoft", 70 * cpx);
      f1("uIB", iB); f1("uBeamF", beamF); f1("uIG", iG); f1("uIForm", iForm);
      f1("uIF", iF * kept); f1("uFront", front); f1("uIP", iP * kept);
      f1("uSpecW", st.spec);
      // the haze our light lights in the air (fainter for the spectrum, whose fan already draws itself)
      f1("uAirCone", off.air ? 0 : (0.055 - 0.035 * st.spec) * S.haze);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      mark();

      // the things, mirrored in the floor and then themselves, in the same light
      if (objs.ok && items.length) {
        const vp = camClip(cam.pos, cam.f, cam.r, cam.u, cam.focal, cam.shift, A);
        const cols = stops.map((c) => [c[0] + (stops[0][0] - c[0]) * st.proj, c[1] + (stops[0][1] - c[1]) * st.proj, c[2] + (stops[0][2] - c[2]) * st.proj]);
        objs.draw(items, vp, (lp) => {
          const uu = (n: string) => objs.u(lp, n);
          setLight(uu);
          cols.forEach((c, i) => gl.uniform3f(uu(`uS${i}`), c[0], c[1], c[2]));
          gl.uniform3f(uu("uCamPos"), cam.pos[0], cam.pos[1], cam.pos[2]);
          gl.uniform2f(uu("uRes"), canvas.width, canvas.height);
          gl.uniform1f(uu("uTopY"), ruleY > 0 ? (Hs - ruleY - 28) * cpx : 1e5);
          gl.uniform1f(uu("uTopSoft"), 70 * cpx);
          gl.uniform1f(uu("uGain"), S.gain); gl.uniform1f(uu("uGrain"), 0.03); gl.uniform1f(uu("uTime"), tSec);
        }, canvas.width, canvas.height);
      }
      mark();
      if (prof) window.__stPrismProf = prof.marks;
    };

    let lastKey = "";
    const loop = (now: number) => {
      // debug clock frozen: draw only when what is shown changes (keeps headless captures responsive)
      const key = typeof window.__stSceneT === "number" ? `${window.__stSceneT}|${window.__stPrismPx}|${window.__stPrismPy}|${activeRef.current}|${JSON.stringify(window.__stPrismDbg ?? null)}|${canvas.width}x${canvas.height}` : "";
      if (!key || key !== lastKey) {
        const tq = performance.now();
        draw(now);
        if (import.meta.env.DEV && window.__stPrismTime) { const px1 = new Uint8Array(4); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px1); window.__stPrismTime.push(performance.now() - tq); }
      }
      lastKey = key;
      raf = running ? requestAnimationFrame(loop) : 0;
    };
    // the loop runs only while a service is on, on screen and the page is visible; reduced motion: one still frame
    const sync = () => {
      const want = activeRef.current >= 0 && visible && !document.hidden && !reduce;
      if (want && !running) { running = true; last = performance.now(); raf = requestAnimationFrame(loop); }
      else if (!want && running) { running = false; cancelAnimationFrame(raf); raf = 0; }
    };
    let wasOn = false;
    const wake = () => {
      const isOn = activeRef.current >= 0;
      if (isOn && !wasOn) { tOn = performance.now(); beam.svc = -1; beam.old = null; lastKey = ""; if (reduce) draw(performance.now()); }
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
      // y in site px (the rows decide what it turns)
      yT = ((e.clientY - r.top) / r.height) * Math.max(1, box.offsetHeight);
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
      alive = false;
      objs.dispose();
      gl.deleteTexture(tex);
      gl.getExtension("WEBGL_lose_context")?.loseContext();
      canvas.remove();
    };
  }, [mode]);

  useEffect(() => { wakeRef.current?.(); }, [active]);

  return <div ref={boxRef} className="st-stage__fill" aria-hidden />;
}
