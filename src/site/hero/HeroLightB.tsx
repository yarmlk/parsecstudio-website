import { memo, useEffect, useRef } from "react";
import { OPEN } from "../../lib/assets";
import "./hero-b.css";

/**
 * Site hero, candidate B: the cover's live light, re-composed on the diagonal of "The cut".
 *
 * Desk: a satin-black disc fills the upper frame; its front edge runs from the upper left down to a tip on the
 * right. The edge is a thin 3500 K light strip over a fine steel bevel; light escapes underneath into warm haze.
 * The lit haze reflects as a soft sheen on the satin underside, near the rim.
 * Phone: the same object as a horizon, plane below, light rising behind its far edge.
 *
 * Motion is a camera and the light, nothing else:
 * - the hot spot follows the pointer x along the rim with the cover's inertia (lerp 0.035 / frame at 60 fps);
 * - a real parallax inside the shader: the front of the disc shifts most, its back less (perspective shear),
 *   two haze layers less again, the satin reflection the other way (reflections slide against their surface);
 * - phone: the scroll moves the camera instead (layers at different rates, hot spot drifts along the horizon);
 * - one slow 12 s push-in, the haze drifts at the cover's speed; no pointer = the frame rests.
 * Pauses off-screen and on hidden documents; reduced motion = one still frame; no WebGL = the photographic plate.
 */

type Mode = "desk" | "mob";

const VERT = `attribute vec2 a; void main(){ gl_Position = vec4(a, 0.0, 1.0); }`;

const FRAG = `
precision highp float;
uniform vec2 uRes;
uniform float uTime, uMob, uHot, uIgn, uPush, uScroll, uUnit;
uniform vec2 uCam;
uniform vec3 uWarm, uCore, uDeep;
/* the same 3500 K source seen through haze: scattering leaves it a little deeper */
#define HZ mix(uWarm, uDeep, 0.62)

float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
vec2 hash22(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973)); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.xx + p3.yz) * p3.zy); }
float gnoise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  float a = dot(hash22(i) * 2.0 - 1.0, f);
  float b = dot(hash22(i + vec2(1.0, 0.0)) * 2.0 - 1.0, f - vec2(1.0, 0.0));
  float c = dot(hash22(i + vec2(0.0, 1.0)) * 2.0 - 1.0, f - vec2(0.0, 1.0));
  float d = dot(hash22(i + vec2(1.0, 1.0)) * 2.0 - 1.0, f - vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
const mat2 ROT = mat2(0.8, 0.6, -0.6, 0.8);
float fbm(vec2 p){ float v = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { v += a * gnoise(p); p = ROT * p * 2.03 + vec2(1.7, 9.2); a *= 0.5; } return v; }
float fbm3(vec2 p){ float v = 0.0, a = 0.5; for (int i = 0; i < 3; i++) { v += a * gnoise(p); p = ROT * p * 2.03 + vec2(4.1, 2.7); a *= 0.5; } return v; }

/* signed distance to an axis-aligned ellipse (good near the rim), < 0 inside */
float sdE(vec2 p, vec2 r){ float k0 = length(p / r); float k1 = length(p / (r * r)); return k0 * (k0 - 1.0) / max(k1, 1e-5); }
mat2 rot(float a){ float c = cos(a), s = sin(a); return mat2(c, s, -s, c); }

/* soft smoke density, 0..1; q in smoke space, t slow time */
float smoke(vec2 q, float t){
  vec2 w = vec2(fbm3(q * 0.7 + vec2(0.0, t * 0.35)), fbm3(q * 0.7 + vec2(5.2, 1.3) - vec2(t * 0.25, 0.0)));
  float s = fbm(q + w * 1.5);
  return smoothstep(-0.32, 0.42, s);
}
/* a softer veil (weak warp, linear response): layered haze rather than billows */
float veil(vec2 q, float t){
  vec2 w = vec2(fbm3(q * 0.6 + vec2(0.0, t * 0.3)), fbm3(q * 0.6 + vec2(5.2, 1.3) - vec2(t * 0.2, 0.0)));
  return clamp(0.5 + 1.2 * fbm(q + w * 0.6), 0.0, 1.0);
}

/* the disc: an ellipse whose back half is deeper (perspective), so its far edge rises steeply from the tip */
float sdDisc(vec2 q){ return sdE(q, vec2(0.976, q.y < 0.0 ? 0.249 : 0.55)); }

vec3 desk(vec2 p, float px, float lp, float t, float I, float ign){
  vec2 C = vec2(-0.055, 0.21);
  float BF = 0.249;
  float th = -0.2546;
  vec2 cam = vec2(uCam.x, -uCam.y);
  vec3 cool = vec3(0.80, 0.88, 1.0);

  // near layer: the disc. Its front moves more than its back (perspective), the page scroll moves it a little.
  vec2 r0 = rot(-th) * (p - C);
  float depth = clamp((r0.y + BF) / (2.0 * BF), 0.0, 1.0);
  vec2 pn = p + cam * 0.024 * mix(1.0, 0.45, depth) + vec2(0.0, uScroll * 0.20);
  vec2 r = rot(-th) * (pn - C);
  vec2 Dv = normalize(vec2(0.13, -0.99));
  float T = 14.0 * lp;
  float dN = sdDisc(r);
  float dE = sdDisc(r - Dv * T * 0.64);
  float dB = sdDisc(r - Dv * T);
  float aa = px * 0.7;
  float outTop = smoothstep(-aa, aa, dN);
  float inE = smoothstep(aa, -aa, dE);
  float inB = smoothstep(aa, -aa, dB);
  float plane = 1.0 - outTop;
  float strip = outTop * inE;
  float steel = outTop * inB * (1.0 - inE);
  float open = outTop * (1.0 - inB);
  // only the front edge carries the light (the band exists only there)
  float front = smoothstep(-0.1 * T, 0.75 * T, dN - dB);

  // light along the rim: a hot spot on a long soft body; it opens from the hot spot on entry
  float u = pn.x;
  float du = u - uHot;
  float pk = exp(-du * du / (2.0 * 0.17 * 0.17));
  float body = exp(-du * du / (2.0 * 0.60 * 0.60));
  float tail = exp(-du * du / (2.0 * 1.20 * 1.20));
  float reach = mix(-0.15, 2.6, ign);
  float reveal = smoothstep(reach, reach - 0.55, abs(du)) * smoothstep(0.0, 0.12, ign);
  float L = (0.38 * pk + 0.50 * body + 0.12 * tail) * reveal * I * front;

  // far layer: a black room, a wall far behind on the right, lit softly from above
  vec2 pw = p + cam * 0.005 + vec2(0.0, uScroll * 0.36);
  vec3 col = vec3(0.0010, 0.0010, 0.0011);
  col += cool * 0.016 * smoothstep(0.35, 0.95, pw.x) * smoothstep(-0.2, 0.55, pw.y);

  // satin underside of the disc: soft environment high in the frame, the lit haze reflected near the rim
  float hIn = max(-dN, 0.0);
  float env = smoothstep(-0.08, 0.55, pn.y) * exp(-pow((pn.x - 0.12) / 0.74, 2.0));
  vec3 pc = cool * (0.0009 + 0.027 * env * sqrt(env));
  // the satin gleam: the glowing haze under the disc, reflected soft and stretched along the rim. A reflection
  // slides against its surface when the camera moves, so it travels further than the light itself.
  float us = uHot + 0.06 + cam.x * 0.22;
  float sx = u - us;
  float hs = 0.048 - cam.y * 0.026;
  float sh = (hIn - hs) / 0.038;
  float sheen = exp(-sx * sx / (2.0 * 0.21 * 0.21)) * exp(-sh * sh * 0.5) * smoothstep(0.004, 0.03, hIn) * front
    * (1.0 - smoothstep(0.42, 0.82, u));
  pc += mix(mix(uWarm, uDeep, 0.25), cool, 0.3) * sheen * 0.026 * I * reveal;
  // the chamfer just above the strip catches its light: a thin deep line that keeps the cut crisp
  float ch = smoothstep(-aa, aa, 2.2 * lp - hIn);
  pc += uDeep * ch * L * 0.075 + uDeep * exp(-hIn / (5.0 * lp)) * L * 0.012;
  col = mix(col, pc, plane);

  // the strip: an emitter on the upper part of the edge; it burns to cream only where it is hottest
  float f = clamp(dN / max(dN - dE, 1e-5), 0.0, 1.0);
  float across = 1.0 - pow(abs(f * 2.0 - 1.0), 2.5);
  float E = L * 4.8 * mix(0.62, 1.12, pow(across, 0.7));
  vec3 sc = mix(uDeep, uWarm, smoothstep(0.15, 0.85, L)) * E + uWarm * 0.004;
  col = mix(col, sc, strip);

  // steel bevel under the strip: a polished edge, lit warm by the strip, silver where the light is weak
  float g = clamp(dE / max(dE - dB, 1e-5), 0.0, 1.0);
  vec3 stc = cool * 0.085 * (1.0 - 0.5 * g) + mix(uWarm, uCore, 0.6) * L * 0.30 * (1.0 - 0.55 * g);
  col = mix(col, stc, steel);

  // under the disc: the light pours out into haze, two smoke layers at their own depths
  float hb = max(dB, 0.0);
  float dh = du - 0.10;
  float hp = (0.62 * exp(-dh * dh / (2.0 * 0.26 * 0.26)) + 0.38 * exp(-dh * dh / (2.0 * 0.52 * 0.52))) * reveal * I;
  float low = smoothstep(0.35, -0.55, r.y / BF);
  float env0 = hp * low * open * (exp(-hb / 0.045) + 0.1 * exp(-hb / 0.12));
  if (env0 > 0.0008) {
    // only where the light can reach is the smoke worth computing
    vec2 pa = p + cam * 0.009 + vec2(0.0, uScroll * 0.32);
    vec2 pb = p + cam * 0.015 + vec2(0.0, uScroll * 0.27);
    vec2 ra = rot(-th) * (pa - C);
    vec2 rb = rot(-th) * (pb - C);
    float ha = max(sdDisc(ra - Dv * T), 0.0);
    float hb2 = max(sdDisc(rb - Dv * T), 0.0);
    float sA = smoke(vec2(ra.x * 3.0 + t * 0.55, ha * 4.6 - t * 1.05), t);
    float sB = smoke(vec2(rb.x * 4.6 - t * 0.8, hb2 * 7.5 - t * 1.7) + 7.3, t * 1.3);
    float dens = mix(0.12, 1.0, pow(sA, 1.6)) * mix(0.68, 1.22, sB);
    float spill = exp(-hb / (5.0 * lp)) * 0.6 + exp(-hb / (16.0 * lp)) * 0.4;
    float vol = 0.85 * exp(-hb / 0.045) + 0.075 * exp(-hb / 0.12);
    float hz = hp * (0.34 * spill * mix(0.8, 1.1, dens) + vol * dens + 0.012 * exp(-hb / 0.08));
    hz *= low * smoothstep(0.0, 0.9, ign * 1.4 - 0.15);
    col += mix(uWarm, HZ, 0.45 + 0.45 * smoothstep(0.0, 0.2, hb)) * hz * open;
  }

  // lens bloom around the strip
  float ds = max(max(-dN, dE), 0.0);
  float bloom = 0.10 * exp(-ds / (1.8 * lp)) + 0.024 * exp(-ds / (7.0 * lp)) + 0.004 / (1.0 + pow(ds / (30.0 * lp), 2.0));
  bloom *= mix(0.16, 1.0, outTop);
  col += uWarm * bloom * L;
  return col;
}

vec3 mob(vec2 p, float px, float lp, float t, float I, float ign){
  // horizon: the satin plane below, the light rises behind its far rim. The scroll moves the camera:
  // the plane slower than the page, the haze slower still, the light drifts along the rim and rises a little.
  vec2 R = vec2(0.46, 0.30);
  float th = -0.05;
  vec2 C = vec2(0.0, -0.005 - R.y);
  vec3 cool = vec3(0.80, 0.88, 1.0);
  float s = uScroll;
  vec2 pn = p + vec2(0.0, s * 0.20);
  vec2 r = rot(-th) * (pn - C);
  float dN = sdE(r, R);
  float aa = px * 0.7;
  float above = smoothstep(-aa, aa, dN);
  float inside = 1.0 - above;
  float rise = 1.0 + 0.5 * s;

  float hot = uHot + s * 0.08;
  float du = pn.x - hot;
  float pk = exp(-du * du / (2.0 * 0.075 * 0.075));
  float body = exp(-du * du / (2.0 * 0.20 * 0.20));
  float tail = exp(-du * du / (2.0 * 0.45 * 0.45));
  float reach = mix(-0.1, 1.2, ign);
  float reveal = smoothstep(reach, reach - 0.3, abs(du)) * smoothstep(0.0, 0.12, ign);
  float L = (0.45 * pk + 0.40 * body + 0.15 * tail) * reveal * I * (1.0 + 0.12 * s);

  vec3 col = vec3(0.0010, 0.0010, 0.0011);
  // satin plane: near black, a faint sheen falling away from the rim, the light's reflection running towards us
  float hIn = max(-dN, 0.0);
  vec3 pc = cool * (0.0007 + 0.0028 * exp(-hIn / 0.12));
  float rx = pn.x - (hot - s * 0.03);
  float wid = 0.05 + hIn * 0.45;
  float refl = exp(-rx * rx / (2.0 * wid * wid)) * exp(-hIn / (0.10 + 0.05 * s)) * smoothstep(0.0, 0.025, hIn);
  pc += mix(uWarm, uDeep, 0.35) * refl * 0.010 * (0.4 * pk + 0.6 * body) * reveal * I;
  pc += uDeep * exp(-hIn / (1.4 * lp)) * L * 0.10;
  col = mix(col, pc, inside);

  // the haze rises from the rim: two layers, the farther one moves less with the scroll
  float h = max(dN, 0.0);
  float dh = du + 0.02;
  float hp = (0.75 * exp(-dh * dh / (2.0 * 0.10 * 0.10)) + 0.25 * exp(-dh * dh / (2.0 * 0.20 * 0.20))) * reveal * I;
  if (above > 0.001 && hp * (0.4 * exp(-h / (0.0455 * rise)) + 0.022 * exp(-h / (0.1225 * rise))) > 0.0003) {
    vec2 pa = p + vec2(0.0, s * 0.30);
    vec2 pb = p + vec2(0.0, s * 0.25);
    float ha = max(sdE(rot(-th) * (pa - C), R), 0.0);
    float hb = max(sdE(rot(-th) * (pb - C), R), 0.0);
    float sA = veil(vec2(pa.x * 3.6 + t, ha * 7.5 / rise - t * 1.6), t);
    float sB = veil(vec2(pb.x * 8.0 - t * 1.3, hb * 14.0 / rise - t * 2.0) + 3.7, t * 1.2);
    float dens = mix(0.38, 1.15, sA) * mix(0.8, 1.16, sB);
    float spill = exp(-h / (3.0 * lp)) * 0.6 + exp(-h / (12.0 * lp)) * 0.4;
    // where the smoke is denser the light climbs higher: wisps rise out of the glow
    float hs = h / (rise * mix(0.62, 1.75, sA * sA));
    float vol = 0.40 * exp(-hs / 0.026) + 0.022 * exp(-hs / 0.07);
    float hz = hp * (0.34 * spill * mix(0.85, 1.1, dens) + vol * dens);
    hz *= smoothstep(0.0, 0.9, ign * 1.4 - 0.15);
    col += mix(HZ, uWarm, 0.25 * exp(-h / 0.03)) * hz * above;
  }

  // the line itself and its bloom; the plane hides most of the glow under it
  // the line is thickest where it is hottest (it is the light wrapping the rim, seen edge-on)
  float w = (0.85 + 1.5 * pk) * lp;
  float dc = (dN - 0.45 * w) / w;
  float core = exp(-dc * dc);
  float ad = abs(dN);
  float bloom = 0.11 * exp(-ad / (2.2 * lp)) + 0.030 * exp(-ad / (8.0 * lp)) + 0.004 / (1.0 + pow(ad / (34.0 * lp), 2.0));
  bloom *= mix(0.18, 1.0, above);
  col += mix(HZ, uWarm, smoothstep(0.15, 0.9, L)) * core * L * 4.2;
  col += mix(HZ, uWarm, 0.5) * bloom * L;
  return col;
}

void main(){
  vec2 fc = gl_FragCoord.xy;
  vec2 uv = fc / uRes;
  float aspect = uRes.x / uRes.y;
  vec2 p = vec2((uv.x - 0.5) * aspect, uv.y - 0.5);
  // the slow push-in of the camera
  float zoom = 1.0 + 0.03 * uPush;
  vec2 F = uMob > 0.5 ? vec2(0.0, -0.005) : vec2(-0.05, -0.02);
  p = (p - F) / zoom + F;
  float px = 1.0 / (uRes.y * zoom);
  float lp = uUnit / zoom;
  float t = uTime * 0.035;
  float I = 1.0 + 0.012 * sin(uTime * 0.31) + 0.008 * sin(uTime * 0.173 + 1.3);
  vec3 col = uMob > 0.5 ? mob(p, px, lp, t, I, uIgn) : desk(p, px, lp, t, I, uIgn);

  // vignette, filmic shoulder, display encoding
  vec2 q = uv - 0.5;
  col *= 1.0 - dot(q, q) * 0.55;
  col = vec3(1.0) - exp(-col * 1.05);
  col = mix(col * 12.92, 1.055 * pow(col, vec3(1.0 / 2.4)) - 0.055, step(vec3(0.0031308), col));
  // static fine grain and dither: no per-frame noise, nothing flickers
  float n = hash12(fc) + hash12(fc + 71.37) - 1.0;
  float l = dot(col, vec3(0.299, 0.587, 0.114));
  col += n * (1.4 / 255.0 + 0.018 * l * (1.0 - l));
  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}`;

/* sRGB → linear */
const lin = (h: string): [number, number, number] => {
  const n = parseInt(h.slice(1), 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const s = v / 255;
    return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return [c[0], c[1], c[2]];
};
const WARM = lin("#F6C88C");      // Ember, 3500 K
const CORE = lin("#FFF1D6");      // light core
const DEEP = lin("#E9A25E");      // the same source deeper in the haze / on the bevel

/** cubic-bezier easing (x→y), Newton + bisection */
function bezier(x1: number, y1: number, x2: number, y2: number) {
  const A = (a: number, b: number) => 1 - 3 * b + 3 * a, B = (a: number, b: number) => 3 * b - 6 * a, Cc = (a: number) => 3 * a;
  const f = (t: number, a: number, b: number) => ((A(a, b) * t + B(a, b)) * t + Cc(a)) * t;
  const df = (t: number, a: number, b: number) => 3 * A(a, b) * t * t + 2 * B(a, b) * t + Cc(a);
  return (x: number) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let t = x;
    for (let i = 0; i < 6; i++) { const d = df(t, x1, x2); if (Math.abs(d) < 1e-6) break; t -= (f(t, x1, x2) - x) / d; }
    t = Math.min(1, Math.max(0, t));
    return f(t, y1, y2);
  };
}
const easeEnter = bezier(0.2, 0.7, 0.1, 1);
const easeMove = bezier(0.45, 0, 0.2, 1);

/** where the light rests with no pointer (hero units from the centre) */
const REST: Record<Mode, number> = { desk: -0.06, mob: -0.02 };

export const HeroLightB = memo(function HeroLightB({ mode }: { mode: Mode }) {
  const boxRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const canvas = document.createElement("canvas");
    canvas.className = "hlb__canvas";
    canvas.setAttribute("aria-hidden", "true");
    box.appendChild(canvas);
    const fail = () => { box.dataset.fallback = "1"; canvas.remove(); };
    const gl = canvas.getContext("webgl", { antialias: false, alpha: false, premultipliedAlpha: false, powerPreference: "high-performance" });
    if (!gl) { fail(); return; }
    delete box.dataset.fallback;

    const sh = (type: number, src: string) => {
      const s = gl.createShader(type)!; gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) console.warn("HeroLightB shader:", gl.getShaderInfoLog(s));
      return s;
    };
    const prog = gl.createProgram()!;
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) { fail(); return; }
    gl.useProgram(prog);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, "a");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const U = (n: string) => gl.getUniformLocation(prog, n);
    const u = {
      res: U("uRes"), time: U("uTime"), mob: U("uMob"), hot: U("uHot"), ign: U("uIgn"), push: U("uPush"),
      scroll: U("uScroll"), unit: U("uUnit"), cam: U("uCam"), warm: U("uWarm"), core: U("uCore"), deep: U("uDeep"),
    };
    gl.uniform3f(u.warm, WARM[0], WARM[1], WARM[2]);
    gl.uniform3f(u.core, CORE[0], CORE[1], CORE[2]);
    gl.uniform3f(u.deep, DEEP[0], DEEP[1], DEEP[2]);
    gl.uniform1f(u.mob, mode === "mob" ? 1 : 0);

    const reduce = !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const section = box.parentElement as HTMLElement | null;
    const scroller = box.closest<HTMLElement>(".st-site__scroll");
    const rest = REST[mode];
    const st = {
      hot: rest, hotT: rest, cx: 0, cy: 0, cxT: 0, cyT: 0, sc: 0, scT: 0,
      t0: performance.now(), last: performance.now(), aspect: 1.8, frame: 0,
    };
    let raf = 0, visible = true, running = false;

    /* backing store from the on-screen rect: the site sits inside a scaled frame, and a frame re-fit changes only
       a transform (no ResizeObserver callback), so this is also polled. Returns true when the size changed. */
    const resize = () => {
      const r = box.getBoundingClientRect();
      const base = Math.min(window.devicePixelRatio || 1, 1.5);
      const dpr = Math.min(base, Math.sqrt(2_600_000 / Math.max(1, r.width * r.height)));
      const w = Math.max(2, Math.round(r.width * dpr)), h = Math.max(2, Math.round(r.height * dpr));
      st.aspect = box.offsetWidth / Math.max(1, box.offsetHeight);
      if (w === canvas.width && h === canvas.height) return false;
      canvas.width = w; canvas.height = h;
      gl.viewport(0, 0, w, h);
      return true;
    };

    const draw = (now: number) => {
      // per-frame lerps made time-based; k stays < 1 for any dt, so slow frames converge without overshoot
      const dt = Math.min(0.5, Math.max(0, (now - st.last) / 1000));
      st.last = now;
      // frame-rate independent versions of the cover's per-frame lerps
      const k = (per: number) => 1 - Math.pow(1 - per, dt * 60);
      if (reduce) {
        st.hot = st.hotT; st.cx = st.cxT; st.cy = st.cyT; st.sc = st.scT;
      } else {
        st.hot += (st.hotT - st.hot) * k(0.035);
        st.cx += (st.cxT - st.cx) * k(0.04);
        st.cy += (st.cyT - st.cy) * k(0.04);
        st.sc += (st.scT - st.sc) * k(0.09);
      }
      const el = (now - st.t0) / 1000;
      const ign = reduce ? 1 : easeEnter(Math.max(0, el - 0.12) / 2.4);
      const push = reduce ? 0 : easeMove(el / 12);
      gl.uniform2f(u.res, canvas.width, canvas.height);
      gl.uniform1f(u.time, reduce ? 20 : el + 20);
      gl.uniform1f(u.hot, st.hot);
      gl.uniform1f(u.ign, ign);
      gl.uniform1f(u.push, push);
      gl.uniform1f(u.scroll, st.sc);
      gl.uniform1f(u.unit, 1 / Math.max(1, box.offsetHeight));
      gl.uniform2f(u.cam, st.cx, st.cy);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };

    const loop = (now: number) => {
      raf = 0;
      if (!visible || document.hidden) { running = false; return; }
      // when everything has settled the frame only carries the slow haze: draw at half rate
      const settled = Math.abs(st.hotT - st.hot) < 2e-4 && Math.abs(st.cxT - st.cx) < 2e-4 && Math.abs(st.cyT - st.cy) < 2e-4
        && Math.abs(st.scT - st.sc) < 2e-4 && now - st.t0 > 12500;
      st.frame++;
      if (!settled || st.frame % 2 === 0) draw(now);
      else st.last = now - 1000 / 60;
      raf = requestAnimationFrame(loop);
    };
    const start = () => {
      if (reduce || running || !visible || document.hidden) return;
      running = true;
      st.last = performance.now();
      raf = requestAnimationFrame(loop);
    };

    resize();
    draw(performance.now());
    start();

    const ro = new ResizeObserver(() => { resize(); draw(performance.now()); });
    ro.observe(box);
    const poll = window.setInterval(() => { if (visible && !document.hidden && resize() && !running) draw(performance.now()); }, 400);
    const io = new IntersectionObserver((es) => {
      // entries can arrive batched: the last one is the current state
      visible = es[es.length - 1].isIntersecting;
      if (visible) start(); else { cancelAnimationFrame(raf); running = false; }
    });
    io.observe(box);

    const onMove = (e: PointerEvent) => {
      if (reduce || mode !== "desk" || e.pointerType === "touch") return;
      const r = box.getBoundingClientRect();
      const nx = (e.clientX - r.left) / r.width, ny = (e.clientY - r.top) / r.height;
      st.hotT = (Math.max(0.08, Math.min(0.92, nx)) - 0.5) * st.aspect;
      st.cxT = Math.max(-0.5, Math.min(0.5, nx - 0.5));
      st.cyT = Math.max(-0.5, Math.min(0.5, ny - 0.5));
    };
    const onLeave = () => { st.hotT = rest; st.cxT = 0; st.cyT = 0; };
    section?.addEventListener("pointermove", onMove);
    section?.addEventListener("pointerleave", onLeave);
    const onScroll = () => {
      if (!scroller || reduce) return;
      st.scT = Math.min(1.2, scroller.scrollTop / Math.max(1, box.offsetHeight));
    };
    scroller?.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    const onVis = () => { if (document.hidden) { cancelAnimationFrame(raf); running = false; } else start(); };
    document.addEventListener("visibilitychange", onVis);
    const onLost = (e: Event) => { e.preventDefault(); cancelAnimationFrame(raf); running = false; fail(); };
    canvas.addEventListener("webglcontextlost", onLost);

    return () => {
      cancelAnimationFrame(raf); ro.disconnect(); io.disconnect(); window.clearInterval(poll);
      section?.removeEventListener("pointermove", onMove);
      section?.removeEventListener("pointerleave", onLeave);
      scroller?.removeEventListener("scroll", onScroll);
      document.removeEventListener("visibilitychange", onVis);
      canvas.removeEventListener("webglcontextlost", onLost);
      gl.getExtension("WEBGL_lose_context")?.loseContext();
      canvas.remove();
    };
  }, [mode]);

  return (
    <div ref={boxRef} className="st-hero__plate hlb grain" data-mode={mode}>
      <img className="hlb__fallback" src={mode === "desk" ? OPEN.cut : "img/plates/horizon-vertical.jpg"} alt="" />
    </div>
  );
});
