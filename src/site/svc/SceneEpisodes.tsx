import { useLayoutEffect, useRef } from "react";
import { kelvinRGB } from "../../ui/LightField";
import type { SceneProps } from "./types";

/* Vertical Series — "the cut stands up; a series arrives in episodes".
   The cover's horizontal cut of light turns upright and closes into a 9:16 frame: an enfilade of doorways cut into black
   walls, one behind another. Each doorway's edge is a slit of warm 3500 K light — hottest along the threshold (the cover's
   cut, lying on the floor), rising up the jambs and thinning toward the lintel. The light grazes the wall round the opening
   and the reveal inside it, pools on a glossy black floor and mirrors in it; the cover's fbm haze hangs in the rooms and the
   enfilade recedes into it: episode 1 nearest. On `on` the first doorway ignites (the light climbs from the threshold round
   the frame), the next ones follow along the depth. The pointer moves the camera a little (parallax between the doorways),
   with the cover's inertia. One analytic ray-traced pass, no geometry: walls with thickness, a mirror floor, haze, bloom. */

const N = 6;

const VERT = `attribute vec2 a; void main(){ gl_Position = vec4(a, 0.0, 1.0); }`;

const FRAG = `
precision highp float;
const int N = ${N};
uniform vec2 uRes;
uniform float uTime, uFocal, uCore, uGrain, uGain, uRough, uHaze, uDepth;
uniform vec3 uRo;
uniform vec2 uShift, uHzZ;
uniform vec4 uW[N];    // doorway: x centre, z of the wall's front face, half width, half height (it stands on the floor)
uniform vec4 uIg[N];   // light 0..1, rising front (0 = threshold, 1 = lintel), form 0..1, -
uniform vec4 uA[N];    // depth falloff (atmosphere): slits, haze, wall light, extra blur
uniform vec3 uWarm, uCoreCol;

float hash(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float vnoise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash(i), b = hash(i + vec2(1.0, 0.0)), c = hash(i + vec2(0.0, 1.0)), d = hash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
float fbm(vec2 p){ float v = 0.0, a = 0.5; for (int i = 0; i < 4; i++) { v += a * vnoise(p); p = p * 2.03 + vec2(1.7, 9.2); a *= 0.5; } return v; }
float fbm3(vec2 p){ float v = 0.06, a = 0.5; for (int i = 0; i < 3; i++) { v += a * vnoise(p); p = p * 2.03 + vec2(1.7, 9.2); a *= 0.5; } return v; }
float sdBox(vec2 p, vec2 b){ vec2 d = abs(p) - b; return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0); }

// brightness round the rim: the threshold (the cut) is hottest, the light stands up the jambs and thins toward the lintel
float rimProf(float yn, float xn){
  float e = exp(-yn * 4.0);
  float hot = 0.72 + 0.28 * exp(-(xn - 0.18) * (xn - 0.18) * 2.2);
  return (0.03 + 0.97 * e) * mix(1.0, hot, e * e) * (1.0 - 0.4 * xn * xn * e * e);
}
// ignition: the light climbs from the threshold round the frame
float riseMask(float yn, float front){ return 1.0 - smoothstep(front - 0.42, front, yn); }

// what a ray meets where it crosses a doorway's plane: the slit as the lens sees it (the cover's model: crisp core, two bloom
// falloffs), the haze lit round the frame, and the haze rising off the threshold — the cover's glow over its line.
// bl > 0 blurs it (seen in the floor). A: that doorway's depth falloff.
vec3 crossing(vec2 l, vec2 b, float d, float pw, float bl, vec4 ig, vec4 A, float sm, float s2, float under){
  float H = 2.0 * b.y;
  float yn = clamp((l.y + b.y) / H, 0.0, 1.0);
  float xn = clamp(l.x / b.x, -1.0, 1.0);
  float pr = rimProf(yn, xn) * riseMask(yn, ig.y) * ig.x;
  vec3 col = vec3(0.0);
  float ad = abs(d);
  float blur = bl + A.w;
  if (ad < 150.0 * pw + 8.0 * blur && pr > 0.0) {
    float w0 = uCore * pw;
    float wc = blur > 0.0 ? sqrt(w0 * w0 + blur * blur) : w0;
    float wn = 6.0 * pw + blur * 1.4, ww = 26.0 * pw + blur * 2.2;
    col = (uCoreCol * exp(-d * d / (wc * wc)) * (w0 / wc) * 1.6
         + uWarm * (exp(-ad / wn) * 0.55 * (6.0 * pw / wn) + exp(-ad / ww) * 0.12 * (26.0 * pw / ww))) * pr * A.x;
  }
  if (under > 0.5) return col;
  float e18 = exp(-ad / (0.18 * H));
  float e045 = e18 * e18; e045 *= e045;                                  // exp(-dd / 0.045)
  float hz = e045 * mix(0.4, 1.3, sm) + e18 * 0.4 * mix(0.25, 1.35, sm);
  float hb = max(l.y + b.y, 0.0);
  float ax = max(abs(l.x) - b.x * 0.7, 0.0) * 1.6;
  float dr = sqrt(ax * ax + hb * hb) / H;
  float e36 = exp(-dr / 0.36);
  float rise = (e36 * e36 * e36 * mix(0.45, 1.25, sm) + e36 * 0.24 * mix(0.3, 1.2, s2)) * (1.0 - 0.3 * xn * xn);
  float lit = ig.x * riseMask(yn, min(ig.y, 1.0) * 0.6);
  col += uWarm * (hz * pr * 0.3 + rise * 0.26 * lit) * uHaze * ig.z * A.y;
  return col;
}
// light the slit throws on the wall face round the opening (d > 0, world units)
float faceLight(float d, float H){
  float x = max(d, 0.0) / H;
  float e4 = exp(-x / 0.4);
  float e1 = e4 * e4; e1 *= e1;                                           // exp(-x / 0.1)
  float e02 = e1 * e1; e02 *= e02 * e1;                                    // exp(-x / 0.02)
  return e02 * 0.45 + e1 * 0.12 + e4 * 0.05 + exp(-x / 1.1) * 0.018;
}

void main(){
  vec2 p = (gl_FragCoord.xy - 0.5 * uRes) / uRes.y;
  // no yaw, no pitch: the walls stay parallel to the sensor and verticals stay vertical; the frame is set by lens shift
  vec3 rd = normalize(vec3(p - uShift, uFocal));
  float pxk = 1.0 / (uRes.y * uFocal);          // world size of one canvas pixel per unit of depth
  vec3 ro = uRo;
  float tf = rd.y < -1e-5 ? -ro.y / rd.y : 1e6;  // the floor (y = 0)

  // haze: the cover's slow fbm smoke at two depths, so it parallaxes with the camera
  float ht = uTime * 0.035;
  vec3 h1 = ro + rd * ((uHzZ.x - ro.z) / rd.z);
  vec3 h2 = ro + rd * ((uHzZ.y - ro.z) / rd.z);
  float s1 = fbm(vec2(h1.x * 1.6 + ht, h1.y * 2.3 - ht * 1.6));
  float s2 = fbm3(vec2(h2.x * 1.3 - ht * 0.7 + 7.3, h2.y * 1.9 - ht * 1.3 + 2.1));

  vec3 L = vec3(0.0);                       // light met along the ray (slits, lit haze)
  vec3 S = vec3(0.034, 0.034, 0.039);       // what the ray ends on
  float kind = 0.0;                         // 0 = past every doorway, 1 = floor, 2 = wall face, 3 = reveal
  float room = float(N);                    // floor: in front of wall k (k), inside its doorway (k + .5)
  float zEnd = 40.0;
  float z0 = uW[0].y - ro.z;

  for (int k = 0; k < N; k++) {
    vec4 w = uW[k]; vec4 ig = uIg[k]; vec4 A = uA[k];
    vec2 b = w.zw; vec2 c = vec2(w.x, w.w);
    float H = 2.0 * b.y;
    float dz = w.y - ro.z;
    float t1 = dz / rd.z;
    vec2 l = ro.xy + rd.xy * t1 - c;
    float d = sdBox(l, b);
    float under = step(tf, t1);
    float sm = mix(s1, s2, float(k) / float(N - 1));
    L += crossing(l, b, d, dz * pxk, 0.0, ig, A, sm, s2, under);
    if (under > 0.5) { kind = 1.0; room = float(k); break; }
    if (d > 0.0) {
      kind = 2.0; zEnd = dz;
      float yn = clamp((l.y + b.y) / H, 0.0, 1.0);
      float pr = rimProf(yn, clamp(l.x / b.x, -1.0, 1.0)) * riseMask(yn, ig.y) * ig.x;
      S = vec3(0.017, 0.017, 0.02) + uWarm * faceLight(d, H) * pr * ig.z * A.z * mix(0.8, 1.15, sm);
      break;
    }
    float t2 = (w.y + uDepth - ro.z) / rd.z;
    vec2 l2 = ro.xy + rd.xy * t2 - c;
    float out2 = step(0.0, sdBox(l2, b));
    // the ray may leave the opening through a reveal: a jamb (side) or the lintel's soffit
    float tx = rd.x > 0.0 ? (c.x + b.x - ro.x) / rd.x : (c.x - b.x - ro.x) / rd.x;
    float ty = rd.y > 0.0 ? (H - ro.y) / rd.y : 1e6;
    float tj = out2 > 0.5 ? clamp(min(tx, ty), t1, t2) : t2;
    if (tf < tj) { kind = 1.0; room = float(k) + 0.5; break; }
    if (out2 > 0.5) {
      vec3 J = ro + rd * tj;
      float s = (J.z - w.y) / uDepth;
      vec2 lj = J.xy - c;
      float yn = clamp((lj.y + b.y) / H, 0.0, 1.0);
      float prj = rimProf(yn, clamp(lj.x / b.x, -1.0, 1.0)) * riseMask(yn, ig.y) * ig.x;
      float es = exp(-s * 1.2);
      kind = 3.0; zEnd = J.z - ro.z;
      S = vec3(0.02, 0.02, 0.023) + uWarm * (es * es * es * 0.9 + es * 0.12) * prj * ig.z * A.z;
      break;
    }
  }

  if (kind == 1.0) {
    // glossy black ceramic floor: the light each threshold spills over it, and a blurred mirror of the doorways
    vec3 P = ro + rd * tf;
    zEnd = P.z - ro.z;
    float f1 = 1.0 - clamp(-rd.y, 0.0, 1.0);
    float fres = 0.04 + 0.96 * f1 * f1 * f1 * f1 * f1;
    vec3 pool = vec3(0.0), R = vec3(0.0);
    float T = 1.0;
    float j0 = floor(room + 0.01);     // the wall just ahead of this patch of floor
    float jm = ceil(room - 0.01);      // the first wall the mirrored ray meets
    for (int j = 0; j < N; j++) {
      float fj = float(j);
      if (fj < j0 - 1.0) continue;
      vec4 w = uW[j]; vec4 ig = uIg[j]; vec4 A = uA[j];
      vec2 b = w.zw; vec2 c = vec2(w.x, w.w);
      float H = 2.0 * b.y;
      if (fj <= j0) {
        // the threshold's light fans out over the floor toward us (and, weaker, into the room behind it)
        float qz = P.z - w.y;
        vec2 q = vec2(P.x - w.x, qz > 0.0 ? max(qz - uDepth, 0.0) : qz);
        float fwd = abs(q.y);
        float ax = max(abs(q.x) - b.x * 0.85 - fwd * 0.45, 0.0);
        float xn = clamp(q.x / b.x, -1.0, 1.0);
        float e = exp(-fwd / (H * 0.45));
        float e9 = e * e * e; e9 *= e9 * e9;
        float fan = (e * 0.55 + e9 * 0.8) * exp(-ax * ax / (H * H * 0.01)) * (1.0 - 0.25 * xn * xn);
        pool += uWarm * fan * ig.z * ig.x * (fj == j0 ? 1.0 : 0.45) * A.z;
      }
      // mirror: the doorways ahead, seen in the floor, blurring with distance
      if (fj >= jm) {
        float tr = (w.y - P.z) / rd.z;
        vec2 l = vec2(P.x + rd.x * tr, -rd.y * tr) - c;
        float d = sdBox(l, b);
        float bl = uRough * tr;
        float sm = mix(s1, s2, fj / float(N - 1));
        R += crossing(l, b, d, (w.y - ro.z) * pxk, bl, ig, A, sm, s2, 0.0) * T;
        float blk = smoothstep(-bl - 0.002, bl + 0.002, d);
        if (blk > 0.0) {
          float yn = clamp((l.y + b.y) / H, 0.0, 1.0);
          float pr = rimProf(yn, clamp(l.x / b.x, -1.0, 1.0)) * riseMask(yn, ig.y) * ig.x;
          R += uWarm * faceLight(d, H) * pr * ig.z * A.z * T * blk;
        }
        T *= 1.0 - blk;
        if (T < 0.01) break;
      }
    }
    S = vec3(0.017, 0.017, 0.02) + pool * 0.22 + R * fres;
  }

  // the rooms past the first doorway hold lit haze; the enfilade fades into it
  float beyond = kind == 2.0 && zEnd <= z0 + 1e-3 ? 0.0 : 1.0;
  if (kind == 1.0 && room < 0.5) beyond = 0.0;
  if (kind == 0.0) { S = vec3(0.02, 0.02, 0.023); zEnd = uW[N - 1].y - ro.z + 1.0; }
  float veilAmt = (1.0 - exp(-max(zEnd - z0, 0.0) * 0.16)) * beyond;
  vec3 veil = uWarm * 0.03 * veilAmt * mix(0.2, 1.6, s2) * uIg[0].z;
  vec3 col = S + veil + L;

  col *= uGain;
  // filmic shoulder, static grain, vignette (the cover's)
  col = vec3(1.0) - exp(-col * 1.4);
  float g = (hash(gl_FragCoord.xy) + hash(gl_FragCoord.xy + 71.3) - 1.0) * 0.5;
  col += g * uGrain;
  vec2 uv = gl_FragCoord.xy / uRes - 0.5;
  col *= 1.0 - dot(uv, uv) * 0.6;
  gl_FragColor = vec4(max(col, 0.0), 1.0);
}`;

/* cubic-bezier easing (the brand's --ease-enter / --ease-move) */
function bezier(x1: number, y1: number, x2: number, y2: number) {
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
  const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  const sx = (t: number) => ((ax * t + bx) * t + cx) * t;
  const sy = (t: number) => ((ay * t + by) * t + cy) * t;
  const dx = (t: number) => (3 * ax * t + 2 * bx) * t + cx;
  return (x: number) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let t = x;
    for (let i = 0; i < 6; i++) { const e = sx(t) - x; const d = dx(t); if (Math.abs(e) < 1e-5 || Math.abs(d) < 1e-6) break; t -= e / d; }
    t = Math.max(0, Math.min(1, t));
    return sy(t);
  };
}
const easeEnter = bezier(0.2, 0.7, 0.1, 1);
const easeMove = bezier(0.45, 0, 0.2, 1);
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

interface Rig {
  /** camera position at rest */ ro: [number, number, number];
  /** pointer travel of the camera, world units (x, y) */ sway: [number, number];
  /** the depth that stays put while the camera sways (lens-shift compensated): nearer doorways move one way, farther the other */ pivot: number;
  focal: number;
  /** lens shift: where the optical axis lands, in frame heights from the centre */ shift: [number, number];
  /** doorways: x centre, z of the wall face, half width, half height */ walls: [number, number, number, number][];
  /** wall thickness */ depth: number;
  gain: number;
  sigma: number;
  haze: number;
}

const HH = 0.75;            // half height of a doorway
const HW = HH * 9 / 16;     // 9:16

const RIGS: Record<"desk" | "mob", Rig> = {
  desk: {
    ro: [0, 0.45, 0], sway: [0.2, 0.06], pivot: 3.6, focal: 1.1, shift: [0.46, -0.16],
    walls: Array.from({ length: N }, (_, i) => [0.28, 3.6 + i * 1.7, HW, HH] as [number, number, number, number]),
    depth: 0.18, gain: 1, sigma: 0.24, haze: 1,
  },
  mob: {
    ro: [0, 0.45, 0], sway: [0, 0], pivot: 5.4, focal: 1.3, shift: [-0.01, -0.19],
    walls: Array.from({ length: N }, (_, i) => [0.15, 5.4 + i * 1.7, HW, HH] as [number, number, number, number]),
    depth: 0.18, gain: 0.75, sigma: 0.24, haze: 0.9,
  },
};

const T_LIGHT = 0.6;   // each frame ignites over ~600 ms
const T_STEP = 0.15;   // the next one follows ~150 ms later, along the depth
const T_FORM = 0.1;    // the space (pool, reflection, haze) follows its light by ~100 ms

export function SceneEpisodes({ on, mode }: SceneProps) {
  const boxRef = useRef<HTMLDivElement | null>(null);
  const onRef = useRef(on);
  const ctl = useRef<{ setOn: (v: boolean) => void } | null>(null);
  onRef.current = on;

  useLayoutEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const canvas = document.createElement("canvas");
    canvas.setAttribute("aria-hidden", "true");
    canvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%;display:block";
    const gl = canvas.getContext("webgl", { antialias: false, alpha: false, premultipliedAlpha: false, powerPreference: "high-performance" });
    if (!gl) return; // no WebGL: render nothing, the stage stays dark
    const sh = (type: number, src: string) => {
      const s = gl.createShader(type)!; gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) console.warn("SceneEpisodes shader:", gl.getShaderInfoLog(s));
      return s;
    };
    const prog = gl.createProgram()!;
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) { gl.getExtension("WEBGL_lose_context")?.loseContext(); return; }
    box.appendChild(canvas);
    gl.useProgram(prog);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, "a");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const U = (n: string) => gl.getUniformLocation(prog, n);
    const u = {
      res: U("uRes"), time: U("uTime"), focal: U("uFocal"), core: U("uCore"), grain: U("uGrain"), gain: U("uGain"), rough: U("uRough"),
      a: U("uA"), haze: U("uHaze"), depth: U("uDepth"), ro: U("uRo"), shift: U("uShift"), hzz: U("uHzZ"),
      w: U("uW"), ig: U("uIg"), warm: U("uWarm"), coreCol: U("uCoreCol"),
    };
    const rig = RIGS[mode];
    const warm = kelvinRGB(3500);
    const cc = kelvinRGB(5200);
    gl.uniform3f(u.warm, warm[0], warm[1], warm[2]);
    gl.uniform3f(u.coreCol, Math.min(1, cc[0] + 0.02), Math.min(1, cc[1] + 0.08), Math.min(1, cc[2] + 0.2));
    gl.uniform1f(u.focal, rig.focal);
    gl.uniform1f(u.grain, 0.03);
    gl.uniform1f(u.gain, rig.gain);
    gl.uniform1f(u.rough, 0.02);
    // depth falloff per doorway (the camera only slides sideways, so it is fixed): slits, haze, wall light, extra blur
    const A = new Float32Array(N * 4);
    rig.walls.forEach((w, i) => {
      const far = w[1] - rig.walls[0][1];
      const atm = Math.exp(-far * rig.sigma);
      A.set([Math.pow(atm, 1.25), Math.pow(atm, 0.5), atm, 0.004 * far * far], i * 4);
    });
    gl.uniform4fv(u.a, A);
    gl.uniform1f(u.haze, rig.haze);
    gl.uniform1f(u.depth, rig.depth);
    const wz = rig.walls.map((w) => w[1]);
    gl.uniform2f(u.hzz, wz[0] + 0.6, wz[Math.min(wz.length - 1, 3)] + 0.6);
    gl.uniform4fv(u.w, new Float32Array(rig.walls.flat()));

    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    // debug: a number in window.__stSceneT freezes the scene at that many seconds after ignition (screenshots)
    const dbg = () => (window as unknown as { __stSceneT?: number }).__stSceneT;
    let raf = 0, visible = true, lost = false, dpr = 1, tOn = performance.now(), last = 0, t0 = performance.now();
    // pointer → camera, with the cover's inertia
    let tx = 0, ty = 0, cx = 0, cy = 0;
    const ig = new Float32Array(N * 4);
    // pixel budget; lowered if this GPU can't hold the frame rate (checked once the ignition is over)
    let budget = 2_600_000, ema = 16.7, slow = 0, lastLoop = 0;

    const resize = () => {
      const r = box.getBoundingClientRect();
      const base = Math.min(window.devicePixelRatio || 1, 1.5);
      dpr = Math.min(base, Math.sqrt(budget / Math.max(1, r.width * r.height)));
      canvas.width = Math.max(2, Math.round(r.width * dpr));
      canvas.height = Math.max(2, Math.round(r.height * dpr));
      gl.viewport(0, 0, canvas.width, canvas.height);
    };

    const draw = (now: number) => {
      const d = dbg();
      const frozen = typeof d === "number";
      const since = reduce ? 99 : frozen ? d : (now - tOn) / 1000;
      const dt = last ? Math.min(0.25, (now - last) / 1000) : 0;
      last = now;
      if (frozen || reduce) { cx = tx; cy = ty; } else {
        const k = 1 - Math.pow(1 - 0.04, dt * 60);
        cx += (tx - cx) * k; cy += (ty - cy) * k;
      }
      for (let i = 0; i < N; i++) {
        const s = since - i * T_STEP;
        const a = clamp01(s / T_LIGHT);
        ig[i * 4] = easeEnter(a);
        ig[i * 4 + 1] = 0.3 + 1.15 * easeMove(a);
        ig[i * 4 + 2] = easeEnter(clamp01((s - T_FORM) / (T_LIGHT + 0.15)));
        ig[i * 4 + 3] = 0;
      }
      // camera: slides with the pointer; the lens shift keeps the pivot depth in place, so the doorways parallax round it
      const ox = cx * rig.sway[0], oy = -cy * rig.sway[1];
      gl.uniform3f(u.ro, rig.ro[0] + ox, rig.ro[1] + oy, rig.ro[2]);
      gl.uniform2f(u.shift, rig.shift[0] + ox * rig.focal / rig.pivot, rig.shift[1] + oy * rig.focal / rig.pivot);
      gl.uniform2f(u.res, canvas.width, canvas.height);
      gl.uniform1f(u.time, frozen ? 40 : (now - t0) / 1000 + 40);
      gl.uniform1f(u.core, 1.2 * dpr);
      gl.uniform4fv(u.ig, ig);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };

    const running = () => onRef.current && visible && !lost && !document.hidden && !reduce && typeof dbg() !== "number";
    const loop = (now: number) => {
      const f = lastLoop ? now - lastLoop : 0;
      lastLoop = now;
      if (f > 0 && f < 250 && now - tOn > 1800) {
        ema += (f - ema) * 0.1;
        slow = ema > 24 ? slow + 1 : 0;
        if (slow > 45 && budget > 900_000) { budget *= 0.6; slow = 0; ema = 16.7; resize(); }
      }
      draw(now);
      if (running()) raf = requestAnimationFrame(loop);
    };
    const start = () => { cancelAnimationFrame(raf); last = 0; lastLoop = 0; if (running()) raf = requestAnimationFrame(loop); };

    ctl.current = {
      setOn: (v) => {
        if (v) { tOn = performance.now(); last = 0; if (!lost) draw(tOn); start(); }
        else cancelAnimationFrame(raf);
      },
    };

    resize();
    if (onRef.current) { tOn = performance.now(); draw(tOn); start(); }
    const ro = new ResizeObserver(() => { resize(); if (onRef.current) draw(performance.now()); });
    ro.observe(box);
    const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible) start(); else cancelAnimationFrame(raf); });
    io.observe(box);
    const onMove = (e: PointerEvent) => {
      if (mode !== "desk" || e.pointerType === "touch" || reduce) return;
      const r = box.getBoundingClientRect();
      if (r.width < 2) return;
      tx = Math.max(-1, Math.min(1, ((e.clientX - r.left) / r.width - 0.5) * 2));
      ty = Math.max(-1, Math.min(1, ((e.clientY - r.top) / r.height - 0.5) * 2));
      if (typeof dbg() === "number" && onRef.current) draw(performance.now()); // frozen (debug): redraw on demand
    };
    window.addEventListener("pointermove", onMove);
    // a lost context (too many on the page, GPU reset): stop and leave the stage dark
    const onLost = () => { lost = true; cancelAnimationFrame(raf); canvas.style.opacity = "0"; };
    canvas.addEventListener("webglcontextlost", onLost);
    const onVis = () => { if (document.hidden) cancelAnimationFrame(raf); else start(); };
    document.addEventListener("visibilitychange", onVis);

    return () => {
      ctl.current = null;
      cancelAnimationFrame(raf); ro.disconnect(); io.disconnect();
      window.removeEventListener("pointermove", onMove);
      document.removeEventListener("visibilitychange", onVis);
      gl.getExtension("WEBGL_lose_context")?.loseContext();
      canvas.remove();
    };
  }, [mode]);

  useLayoutEffect(() => { ctl.current?.setOn(on); }, [on]);

  return <div ref={boxRef} className="st-stage__fill" />;
}
