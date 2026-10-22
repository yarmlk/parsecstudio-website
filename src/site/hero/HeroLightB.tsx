import { memo, useEffect, useLayoutEffect, useRef, type MutableRefObject } from "react";
import { OPEN } from "../../lib/assets";
import { easeEnter, easeMove } from "../../lib/ease";
import { REEL_SRC, type HeroCtl, type ReelPhase } from "./reel";
import "./hero-b.css";

/**
 * Site hero: the cover's live light, re-composed on the diagonal of "The cut", with the showreel living behind it.
 *
 * Desk: a disc of dark smoked glass fills the upper frame; its front edge runs from the upper left down to a tip on
 * the right. The edge is a thin 3500 K light strip over a fine steel bevel; light escapes underneath into warm haze.
 * Phone: the same object as a horizon, plane below, light rising behind its far edge.
 *
 * The showreel plays behind the glass all the time, sharp: dark glass, but lit. The glass sinks the film's darks
 * into deep black and lets its light through with its colour, clearly across the disc, clearer near the lit rim,
 * clearest under the hot spot (our light shows our work). The film's own highlights bloom softly into the glass, and
 * the rim's light enters the glass edge and glows inside it like edge-lit acrylic. On the desk the glass shows the
 * film itself (muted), so "Showreel" only restarts it with sound; the phone runs a light cut. "Showreel": the rim
 * flares, then comes down past the lens like a curtain of light; behind it the glass clears, the words dissolve as
 * the light passes them, the sound comes in with it. Then the <video> itself takes over (cheap to play) and the
 * canvas rests. Closing runs it back.
 *
 * Motion is a camera and the light, nothing else:
 * - the hot spot follows the pointer x along the rim with the cover's inertia (lerp 0.035 / frame at 60 fps);
 * - a real parallax inside the shader (PAR, shared with the JS mirrors of the rim): the front of the disc shifts most
 *   and the disc rolls a little, its back less, the haze less again, the far wall and the film behind the glass
 *   least, the reflections on the glass the other way;
 * - phone: the scroll moves the camera instead;
 * - one slow 12 s push-in, the haze drifts at the cover's speed; no pointer = the frame rests.
 * Pauses off-screen and on hidden documents. Reduced motion = a still frame and a plain fade to the film;
 * no WebGL = the photographic plate and the same fade.
 */

type Mode = "desk" | "mob";

/** The camera's parallax on the desk (pointer; cam runs −0.5 … 0.5), in hero units per unit of cam. Shared by the
    shader and its JS mirrors (rimAt, glassAt, spot), so the words are wiped exactly along the light. */
const PAR = {
  disc: 0.065,   // the front of the disc, the nearest layer
  back: 0.4,     // its back moves this share of its front (perspective)
  tilt: 0.03,    // and it rolls a little with cam.x (rad per unit)
  hazeA: 0.022,  // the far haze layer under the rim
  hazeB: 0.035,  // the near one
  wall: 0.012,   // the far wall
  film: 0.02,    // the film behind the glass, a far plane (frame heights)
  sheen: 0.34,   // reflections slide against the glass, the other way
} as const;
const gf = (x: number) => x.toFixed(4);

const VERT = `attribute vec2 a; void main(){ gl_Position = vec4(a, 0.0, 1.0); }`;

const FRAG = `
precision highp float;
uniform vec2 uRes;
uniform float uTime, uMob, uHot, uIgn, uPush, uScroll, uUnit;
uniform vec2 uCam;
uniform vec3 uWarm, uCore, uDeep;
/* the showreel behind the disc */
uniform sampler2D uReel;
uniform float uReelA;    // the film behind the glass: 0 not there yet … 1 there (fades in with its first frames)
uniform float uReelAsp;  // its aspect
uniform float uK;        // the reveal: 0 the rim at rest … 1 the rim gone below the frame
uniform float uDrop;     // how far the disc has come down (hero units)
uniform float uFlare;    // the rim flares before it moves
uniform float uClr;      // the glass clears: 0 smoked … 1 nothing between us and the film
uniform float uFit;      // phone: from filling the frame to the whole film
uniform float uTease;    // hover anticipation: 0 rest … 1 the rim warms up, the glass clears a little
uniform sampler2D uHaloN, uHaloW, uHaloF; // the film's light blurred: near (≈ 1/50 of the frame), wide (≈ 1/12),
                                           // far (≈ 1/3, what the eye adapts to); √-encoded
uniform float uLook;     // the glass: 0 lit (A, production) … 1 ember (B, dev only)
uniform vec3 uLens;      // the pointer's window of clearer glass: its centre (screen hero units) and strength
/* the same 3500 K source seen through haze: scattering leaves it a little deeper */
#define HZ mix(uWarm, uDeep, 0.62)
const vec3 LUMA = vec3(0.2126, 0.7152, 0.0722);

/* shared by the scene functions and main(). The film through the glass is kept apart from the light (gFilm), so the
   light's shoulder never squashes the film's own highlights. */
vec2 gUV; float gAsp; float gGlass; vec3 gFilm, gHaloN, gHaloW, gAdapt; float gLens;

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

/* the disc: an ellipse whose back half is deeper (perspective), so its far edge rises steeply from the tip.
   Coming down it comes closer: it widens (its tips and back leave the frame) and its rim flattens. */
float sdDisc(vec2 q){ return sdE(q, vec2(0.976 + uDrop * (0.25 + 1.4 * uDrop), q.y < 0.0 ? 0.249 : 0.55 + 2.5 * uDrop)); }

/* ── the film ── */
float s2l(float s){ return s <= 0.04045 ? s / 12.92 : pow((s + 0.055) / 1.055, 2.4); }
const vec3 VOIDL = vec3(0.0037, 0.0037, 0.0041);
/* its scale in uv: it fills the frame; the phone pulls back to the whole film as it is revealed */
vec2 reelScale(){
  float A = gAsp, V = uReelAsp;
  vec2 s = A > V ? vec2(1.0, V / A) : vec2(A / V, 1.0);
  if (A < V) s *= pow(V / A, uFit);
  return s / (1.0 + 0.024 * (1.0 - uClr));
}
/* the film, linear and sharp. Behind the glass it sits further away: a little overscan and its own small parallax.
   As the glass clears it settles to exactly the frame the <video> will take over. Its blurred light comes with it. */
vec3 reel(){
  vec2 s = reelScale();
  float o = 1.0 - uClr;
  vec2 par = vec2(uCam.x / gAsp, -uCam.y) * ${gf(PAR.film)} * o;
  vec2 q = 0.5 + (gUV + par - 0.5) * s;
  vec3 t0 = texture2D(uReel, q).rgb;
  vec3 c = vec3(s2l(t0.r), s2l(t0.g), s2l(t0.b));
  // outside the film (the phone's whole frame): the room
  vec2 pq = s / uRes;
  vec2 e = smoothstep(-pq, pq, q) * smoothstep(-pq, pq, 1.0 - q);
  float m = e.x * e.y;
  vec3 hn = texture2D(uHaloN, q).rgb, hw = texture2D(uHaloW, q).rgb, hf = texture2D(uHaloF, q).rgb;
  gHaloN = hn * hn * m; gHaloW = hw * hw * m; gAdapt = hf * hf * m;
  return mix(VOIDL, c, m);
}
/* The film seen through the dark glass. The glass sinks the film's darks and mids (a toe) and lets its light through
   with its colour (a light desaturation, a neutral tint, never cold). The eye adapts to the glass: a large bright
   field sinks back into it while its detail and its small lights stay, so a white frame never turns the disc into a
   grey slab. Only the film's lights bloom into the glass: what shines brighter than its surroundings spills its
   blurred light around it (warm, like halation on film), so dark detail inside a bright frame stays crisp.
   Under the pointer's lens the glass all but goes: the toe, the adaptation and the desaturation ease off.
   T: the glass's transmission here. */
vec3 glass(vec3 R, float T){
  float k = mix(mix(0.09, 0.2, uLook), 0.03, gLens);
  float ad = 1.0 / (1.0 + mix(3.2, 4.0, uLook) * dot(gAdapt, LUMA) * (1.0 - 0.55 * gLens));
  vec3 S = R * R / (R + k) * (1.0 + k) * ad;
  S = mix(vec3(dot(S, LUMA)), S, mix(mix(0.92, 0.85, uLook), 1.0, gLens));
  vec3 bl = max(gHaloN * 0.55 + gHaloW * 0.45 - gAdapt * mix(1.25, 1.1, uLook), 0.0);
  bl = mix(bl, dot(bl, LUMA) * vec3(1.12, 0.97, 0.80), 0.35);
  return (S + bl * ad * mix(0.9, 1.6, uLook) * (1.0 + 0.6 * uTease)) * T * vec3(1.0, 0.975, 0.945);
}

vec3 desk(vec2 p, float px, float lp, float t, float I, float ign){
  vec2 C = vec2(-0.055, 0.21 - uDrop);
  float BF = 0.249;
  float th = -0.2546 - ${gf(PAR.tilt)} * uCam.x;
  vec2 cam = vec2(uCam.x, -uCam.y);
  vec3 cool = vec3(0.80, 0.88, 1.0);

  // near layer: the disc. Its front moves more than its back (perspective), it rolls a little with the camera,
  // the page scroll moves it a little.
  vec2 r0 = rot(-th) * (p - C);
  float depth = clamp((r0.y + BF) / (2.0 * BF), 0.0, 1.0);
  vec2 pn = p + cam * ${gf(PAR.disc)} * mix(1.0, ${gf(PAR.back)}, depth) + vec2(0.0, uScroll * 0.20);
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
  // the back edge (top right, behind the nav) is no cut: the glass melts into the dark there
  float aaN = r.y > 0.0 ? mix(aa, 0.05, smoothstep(0.05, 0.35, r.y)) : aa;
  float plane = 1.0 - smoothstep(-aaN, aaN, dN);
  float strip = outTop * inE;
  float steel = outTop * inB * (1.0 - inE);
  float open = outTop * (1.0 - inB);
  // only the front edge carries the light (the band exists only there)
  float front = smoothstep(-0.1 * T, 0.75 * T, dN - dB);
  gGlass = plane;

  // light along the rim: a hot spot on a long soft body; it opens from the hot spot on entry.
  // The flare before the reveal spreads it along the whole rim.
  float u = pn.x;
  float du = u - uHot;
  float sb = 0.60 + 0.50 * uFlare, st = 1.20 + 0.80 * uFlare;
  float pk = exp(-du * du / (2.0 * 0.17 * 0.17));
  float body = exp(-du * du / (2.0 * sb * sb));
  float tail = exp(-du * du / (2.0 * st * st));
  float reach = mix(-0.15, 2.6, ign);
  float reveal = smoothstep(reach, reach - 0.55, abs(du)) * smoothstep(0.0, 0.12, ign);
  float L = (0.38 * pk + 0.50 * body + 0.12 * tail) * reveal * I * front * (1.0 + 0.55 * uFlare + 0.30 * uTease);

  // far layer: a black room, a wall far behind on the right, lit softly from above
  vec2 pw = p + cam * ${gf(PAR.wall)} + vec2(0.0, uScroll * 0.36);
  vec3 col = vec3(0.0010, 0.0010, 0.0011);
  col += cool * 0.016 * smoothstep(0.35, 0.95, pw.x) * smoothstep(-0.2, 0.55, pw.y);

  // the glass itself: near black, no grey lift; what makes it glass is what it reflects and the light inside it
  float hIn = max(-dN, 0.0);
  vec3 pc = vec3(0.0006, 0.00058, 0.00055);
  // a soft-box far above, reflected in the top surface: a faint cool panel on the far part of the disc, defined
  // edges, soft ends. A reflection slides against the surface as the camera moves.
  vec2 sbq = r - vec2(0.30 - cam.x * ${gf(PAR.sheen)}, 0.095 + cam.y * 0.05);
  float sbx = smoothstep(0.40, 0.16, abs(sbq.x)), sby = smoothstep(0.034, 0.022, abs(sbq.y));
  pc += cool * 0.0042 * sbx * sby * smoothstep(0.0, 0.08, hIn) * (0.75 + 0.25 * sbq.y / 0.034) * (1.0 - gLens);
  // the gleam: the glowing haze under the disc, reflected soft and stretched along the rim. A reflection
  // slides against its surface when the camera moves, so it travels further than the light itself.
  float us = uHot + 0.06 + cam.x * ${gf(PAR.sheen)};
  float sx = u - us;
  float hs = 0.048 - cam.y * 0.04;
  float sh = (hIn - hs) / 0.038;
  float sheen = exp(-sx * sx / (2.0 * 0.21 * 0.21)) * exp(-sh * sh * 0.5) * smoothstep(0.004, 0.03, hIn) * front
    * (1.0 - smoothstep(0.42, 0.82, u));
  pc += mix(mix(uWarm, uDeep, 0.25), cool, 0.3) * sheen * 0.026 * I * reveal;
  // the chamfer just above the strip catches its light: a thin deep line that keeps the cut crisp
  float ch = smoothstep(-aa, aa, 2.2 * lp - hIn);
  pc += uDeep * ch * L * 0.075 + uDeep * exp(-hIn / (5.0 * lp)) * L * 0.012;
  // the rim's light enters the glass at its edge and scatters inside it, like edge-lit acrylic: a warm luminous
  // gradient rising to the lit rim, strongest at the hot spot
  float lit = (0.30 * pk + 0.55 * body + 0.15 * tail) * reveal * (1.0 + 0.3 * uFlare);
  pc += mix(uDeep, uWarm, 0.6) * lit * I * front * (0.040 * exp(-hIn / 0.03) + 0.014 * exp(-hIn / 0.13)) * (1.0 + 0.5 * uTease);
  // the film behind the glass: clearly there across the disc, clearer near the lit rim, clearest under the hot spot
  vec3 film = vec3(0.0);
  if (plane > 0.0 && (uReelA > 0.0 || uClr > 0.0)) {
    vec3 R = reel();
    // transmission: clearest under the lit rim, falling away into the disc (its far part is seen at a grazing angle
    // and reflects more), least at the top of the frame, so the film's cuts never jump behind the nav
    float nl = clamp(exp(-hIn / 0.09) * lit, 0.0, 1.0);
    float top = 1.0 - 0.75 * smoothstep(0.72, 0.95, gUV.y);
    float base = mix(mix(0.24, 0.10, uLook), mix(0.085, 0.035, uLook), smoothstep(0.02, 0.5, hIn));
    float Tr = mix(base, mix(0.68, 0.52, uLook), nl) * top * (1.0 + 0.4 * uTease);
    // the pointer's lens: our light shows our work
    Tr = mix(Tr, mix(0.82, 0.72, uLook) * mix(1.0, top, 0.8), gLens);
    film = mix(glass(R, Tr) * uReelA, R, uClr);
  }
  col = mix(col, pc * (1.0 - uClr), plane);
  gFilm = film * plane;

  // the strip: an emitter on the upper part of the edge; it burns to cream only where it is hottest
  float f = clamp(dN / max(dN - dE, 1e-5), 0.0, 1.0);
  float across = 1.0 - pow(abs(f * 2.0 - 1.0), 2.5);
  float E = L * 4.8 * mix(0.62, 1.12, pow(across, 0.7));
  vec3 sc = mix(uDeep, uWarm, smoothstep(0.15, 0.85, L)) * E + uWarm * 0.004;
  col = mix(col, sc, strip);
  gFilm *= 1.0 - strip;

  // steel bevel under the strip: a polished edge, lit warm by the strip, silver where the light is weak
  float g = clamp(dE / max(dE - dB, 1e-5), 0.0, 1.0);
  vec3 stc = cool * 0.085 * (1.0 - 0.5 * g) + mix(uWarm, uCore, 0.6) * L * 0.30 * (1.0 - 0.55 * g);
  col = mix(col, stc, steel);
  gFilm *= 1.0 - steel;

  // under the disc: the light pours out into haze, two smoke layers at their own depths
  float hb = max(dB, 0.0);
  float dh = du - 0.10;
  float h1 = 0.26 + 0.30 * uFlare, h2 = 0.52 + 0.50 * uFlare;
  float hp = (0.62 * exp(-dh * dh / (2.0 * h1 * h1)) + 0.38 * exp(-dh * dh / (2.0 * h2 * h2))) * reveal * I;
  float low = smoothstep(0.35, -0.55, r.y / BF);
  float env0 = hp * low * open * (exp(-hb / 0.045) + 0.1 * exp(-hb / 0.12));
  if (env0 > 0.0008) {
    // only where the light can reach is the smoke worth computing
    vec2 pa = p + cam * ${gf(PAR.hazeA)} + vec2(0.0, uScroll * 0.32);
    vec2 pb = p + cam * ${gf(PAR.hazeB)} + vec2(0.0, uScroll * 0.27);
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
    hz *= low * smoothstep(0.0, 0.9, ign * 1.4 - 0.15) * (1.0 + 0.35 * uFlare + 0.2 * uTease);
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
  vec2 C = vec2(0.0, -0.005 - R.y - uDrop);
  vec3 cool = vec3(0.80, 0.88, 1.0);
  float s = uScroll;
  vec2 pn = p + vec2(0.0, s * 0.20);
  vec2 r = rot(-th) * (pn - C);
  float dN = sdE(r, R);
  float aa = px * 0.7;
  float above = smoothstep(-aa, aa, dN);
  float inside = 1.0 - above;
  float rise = 1.0 + 0.5 * s;
  gGlass = above;

  float hot = uHot + s * 0.08;
  float du = pn.x - hot;
  float sb = 0.20 + 0.25 * uFlare, st = 0.45 + 0.35 * uFlare;
  float pk = exp(-du * du / (2.0 * 0.075 * 0.075));
  float body = exp(-du * du / (2.0 * sb * sb));
  float tail = exp(-du * du / (2.0 * st * st));
  float reach = mix(-0.1, 1.2, ign);
  float reveal = smoothstep(reach, reach - 0.3, abs(du)) * smoothstep(0.0, 0.12, ign);
  float L = (0.45 * pk + 0.40 * body + 0.15 * tail) * reveal * I * (1.0 + 0.12 * s) * (1.0 + 0.55 * uFlare + 0.30 * uTease);

  vec3 col = vec3(0.0010, 0.0010, 0.0011) * (1.0 - uClr * above);
  // the film beyond the far rim: clearly there across the dark, lit where the light rises
  float h = max(dN, 0.0);
  vec3 film = vec3(0.0);
  if (above > 0.0 && (uReelA > 0.0 || uClr > 0.0)) {
    vec3 fm = reel();
    float lit = (0.45 * pk + 0.40 * body + 0.15 * tail) * reveal * (1.0 + 0.3 * uFlare);
    float nl = clamp(exp(-h / 0.10) * lit, 0.0, 1.0);
    float top = 1.0 - 0.75 * smoothstep(0.72, 0.95, gUV.y);
    float base = mix(mix(0.22, 0.09, uLook), mix(0.08, 0.032, uLook), smoothstep(0.02, 0.5, h));
    float T = mix(base, mix(0.62, 0.48, uLook), nl) * top * (1.0 + 0.4 * uTease);
    film = mix(glass(fm, T) * uReelA, fm, uClr);
  }
  gFilm = film * above;
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
    hz *= smoothstep(0.0, 0.9, ign * 1.4 - 0.15) * (1.0 + 0.35 * uFlare);
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
  gUV = uv; gAsp = aspect; gGlass = 0.0; gFilm = vec3(0.0); gHaloN = vec3(0.0); gHaloW = vec3(0.0); gAdapt = vec3(0.0);
  vec2 p = vec2((uv.x - 0.5) * aspect, uv.y - 0.5);
  // the lens sits on the screen, where the pointer is: a soft round window
  gLens = uLens.z * (1.0 - smoothstep(0.05, 0.21, length(p - uLens.xy)));
  // the slow push-in of the camera
  float zoom = 1.0 + 0.03 * uPush;
  vec2 F = uMob > 0.5 ? vec2(0.0, -0.005) : vec2(-0.05, -0.02);
  p = (p - F) / zoom + F;
  float px = 1.0 / (uRes.y * zoom);
  // the rim comes closer as it goes down past the lens: it thickens
  float lp = uUnit / zoom * (1.0 + 0.9 * uK);
  float t = uTime * 0.035;
  float I = 1.0 + 0.012 * sin(uTime * 0.31) + 0.008 * sin(uTime * 0.173 + 1.3);
  vec3 col = uMob > 0.5 ? mob(p, px, lp, t, I, uIgn) : desk(p, px, lp, t, I, uIgn);

  // the light gets the vignette and its shoulder; the film shows through it (screen), its highlights untouched.
  // Where the glass has cleared the film is shown as it is: no vignette, no shoulder, no grain
  float clr = gGlass * uClr;
  vec2 q = uv - 0.5;
  float d2 = dot(q, q);
  col *= mix(1.0 - d2 * 0.55, 1.0, clr);
  vec3 fl = min(gFilm * mix(1.0 - d2 * 0.3, 1.0, clr), vec3(1.0));
  vec3 lc = vec3(1.0) - exp(-col * 1.05);
  col = mix(lc + fl * (1.0 - lc), min(col + fl, vec3(1.0)), clr);
  col = mix(col * 12.92, 1.055 * pow(col, vec3(1.0 / 2.4)) - 0.055, step(vec3(0.0031308), col));
  // static fine grain and dither: no per-frame noise, nothing flickers
  float n = hash12(fc) + hash12(fc + 71.37) - 1.0;
  float l = dot(col, vec3(0.299, 0.587, 0.114));
  col += n * (1.4 / 255.0 + 0.018 * l * (1.0 - l)) * (1.0 - clr);
  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}`;

/* The film's light, blurred, for its halation in the glass: the film texture is boxed down into a small target
   (sRGB → linear, stored √-encoded so 8 bits hold the darks) and blurred there, only when a new frame arrives. */
const DOWN = `
precision highp float;
uniform sampler2D uSrc;
uniform vec2 uSize;     // the target (px)
uniform float uSrgb;    // 1: the film (sRGB), 0: a √-encoded target
vec3 dec(vec3 s){
  return uSrgb > 0.5 ? mix(s / 12.92, pow((s + 0.055) / 1.055, vec3(2.4)), step(vec3(0.04045), s)) : s * s;
}
void main(){
  vec2 uv = gl_FragCoord.xy / uSize;
  vec3 c = vec3(0.0);
  for (int j = 0; j < 4; j++) for (int i = 0; i < 4; i++)
    c += dec(texture2D(uSrc, uv + (vec2(float(i), float(j)) - 1.5) * 0.25 / uSize).rgb);
  gl_FragColor = vec4(sqrt(c / 16.0), 1.0);
}`;
const BLUR = `
precision highp float;
uniform sampler2D uSrc;
uniform vec2 uSize, uDir;
uniform float uW0;
uniform vec4 uOff, uW;  // bilinear pairs of a 17-tap gaussian
vec3 L(vec2 q){ vec3 c = texture2D(uSrc, q).rgb; return c * c; }
void main(){
  vec2 uv = gl_FragCoord.xy / uSize, s = uDir / uSize;
  vec3 c = L(uv) * uW0;
  c += (L(uv + s * uOff.x) + L(uv - s * uOff.x)) * uW.x;
  c += (L(uv + s * uOff.y) + L(uv - s * uOff.y)) * uW.y;
  c += (L(uv + s * uOff.z) + L(uv - s * uOff.z)) * uW.z;
  c += (L(uv + s * uOff.w) + L(uv - s * uOff.w)) * uW.w;
  gl_FragColor = vec4(sqrt(c), 1.0);
}`;
/** the film's light at three scales (target px; the gaussian's sigma is 2.2 of their texels): the halation near
    (≈ 1/50 of the frame) and wide (≈ 1/12), and far (≈ 1/3), what the eye adapts to */
const HALO = { near: [192, 108], wide: [48, 27], far: [12, 7], sigma: 2.2 } as const;
/** a 17-tap gaussian as a centre tap and four bilinear pairs a side */
function gauss(sigma: number) {
  const w = Array.from({ length: 9 }, (_, i) => Math.exp(-(i * i) / (2 * sigma * sigma)));
  const sum = w[0] + 2 * w.slice(1).reduce((a, b) => a + b, 0);
  const n = w.map((x) => x / sum);
  const off: number[] = [], wt: number[] = [];
  for (let i = 1; i < 9; i += 2) { wt.push(n[i] + n[i + 1]); off.push((i * n[i] + (i + 1) * n[i + 1]) / (n[i] + n[i + 1])); }
  return { w0: n[0], off, wt };
}

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

const sstep = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/** where the light rests with no pointer (hero units from the centre) */
const REST: Record<Mode, number> = { desk: -0.06, mob: -0.02 };

/* ── the reveal ── */
const FLARE_MS = 520;                                    // the rim flares (and holds while the film buffers)
const WAIT_MS = 6000;                                    // … at most this long, then it goes anyway
const DOWN_MS: Record<Mode, number> = { desk: 1900, mob: 1700 };
const UP_MS: Record<Mode, number> = { desk: 1500, mob: 1400 };
const DROP: Record<Mode, number> = { desk: 1.05, mob: 0.95 };   // hero units: the rim and its haze leave the frame
/** the words go a little before the light reaches them, over this soft edge (px) */
const WIPE = { desk: { lead: 12, soft: 64 }, mob: { lead: 10, soft: 48 } } as const;
/** dev only: the glass look to compare, "a" lit glass (production) or "b" ember glass (window.__hlbGlass, ?glass=) */
const GLASS_Q = import.meta.env.DEV ? new URLSearchParams(window.location.search).get("glass") : null;
const glassLook = () => {
  if (!import.meta.env.DEV) return 0;
  const g = (window as unknown as { __hlbGlass?: string }).__hlbGlass ?? GLASS_Q;
  return g === "b" ? 1 : 0;
};

interface Tw { a: number; b: number; t0: number; ms: number; e: (x: number) => number }
const tw = (a: number, b: number, ms: number, e: (x: number) => number, t0: number): Tw => ({ a, b, t0, ms, e });
const val = (w: Tw, now: number) => (w.ms <= 0 ? w.b : w.a + (w.b - w.a) * w.e(Math.min(1, Math.max(0, (now - w.t0) / w.ms))));
const fin = (w: Tw, now: number) => w.ms <= 0 || now - w.t0 >= w.ms;

/* The light line, mirrored from the shader: where it crosses the column x (hero px) and its slope there.
   Used to wipe the words exactly as the light passes them. */
const GEO = {
  desk: { C: [-0.055, 0.21], a: 0.976, b: 0.249, th: -0.2546, F: [-0.05, -0.02], from: Math.PI, to: 2 * Math.PI, line: -0.4 },
  mob: { C: [0, -0.305], a: 0.46, b: 0.30, th: -0.05, F: [0, -0.005], from: 0, to: Math.PI, line: 0 },
} as const;
/** the disc's tilt with the camera (rad), as in the shader */
const thAt = (mode: Mode, cx: number) => GEO[mode].th - (mode === "desk" ? PAR.tilt * cx : 0);
/* What the shader adds to a scene point p before it tests the rim: desk, the disc's parallax (its front moves most,
   its back PAR.back of that, by the point's depth in the disc) and the scroll; phone, the scroll. */
function shift(mode: Mode, px: number, py: number, drop: number, cx: number, cy: number, scroll: number): [number, number] {
  if (mode !== "desk") return [0, scroll * 0.2];
  const g = GEO.desk, th = thAt(mode, cx);
  const dx = px - g.C[0], dy = py - (g.C[1] - drop);
  const ry = Math.sin(-th) * dx + Math.cos(-th) * dy;
  const depth = Math.min(1, Math.max(0, (ry + g.b) / (2 * g.b)));
  const f = PAR.disc * (1 + (PAR.back - 1) * depth);
  return [cx * f, -cy * f + scroll * 0.2];
}
/* the rim, sampled: for each point its x in the disc's own frame (where the shader's light is measured) and where it
   shows in the hero (px) */
function rimPts(mode: Mode, W: number, H: number, drop: number, k: number, zoom: number, cx: number, cy: number, scroll: number) {
  const g = GEO[mode];
  const A = W / H;
  const th = thAt(mode, cx);
  const c = Math.cos(th), s = Math.sin(th);
  const T = (14 * (1 + 0.9 * k)) / H;
  const a = mode === "desk" ? g.a + drop * (0.25 + 1.4 * drop) : g.a;
  const N = 160;
  const pts: { u: number; X: number; Y: number }[] = [];
  for (let i = 0; i <= N; i++) {
    const ph = g.from + ((g.to - g.from) * i) / N;
    const ex = a * Math.cos(ph), ey = g.b * Math.sin(ph);
    // the rim in the disc's frame (pn in the shader) …
    const nx = g.C[0] + c * ex - s * ey, ny = g.C[1] - drop + s * ex + c * ey;
    // … and the scene point that lands on it: p + shift(p) = pn, solved by a few fixed-point steps
    let px = nx, py = ny;
    for (let j = 0; j < 4; j++) { const [ox, oy] = shift(mode, px, py, drop, cx, cy, scroll); px = nx - ox; py = ny - oy; }
    // the push-in: a scene point shows at (p - F) * zoom + F
    const qx = (px - g.F[0]) * zoom + g.F[0];
    const qy = (py - g.F[1]) * zoom + g.F[1] + g.line * T;
    pts.push({ u: nx, X: (qx / A + 0.5) * W, Y: (0.5 - qy) * H });
  }
  return pts;
}
function rimAt(mode: Mode, x: number, W: number, H: number, drop: number, k: number, zoom: number, cx: number, cy: number, scroll: number) {
  const pts = rimPts(mode, W, H, drop, k, zoom, cx, cy, scroll);
  for (let i = 1; i < pts.length; i++) {
    const p0 = pts[i - 1], p1 = pts[i];
    if ((p1.X - x) * (p0.X - x) <= 0 && p1.X !== p0.X) {
      const f = (x - p0.X) / (p1.X - p0.X);
      return { y: p0.Y + (p1.Y - p0.Y) * f, m: (p1.Y - p0.Y) / (p1.X - p0.X) };
    }
  }
  return null;
}

/* Is a hero point (section px) on the glass the film lives behind? The shader's own test, mirrored: desk, inside the
   disc (its front layer, at full parallax); phone, beyond the far rim of the plane. */
function glassAt(mode: Mode, X: number, Y: number, W: number, H: number, drop: number, zoom: number, cx: number, cy: number, scroll: number) {
  const g = GEO[mode];
  const A = W / H;
  // screen → scene: the push-in is undone first
  let x = (X / W - 0.5) * A, y = 0.5 - Y / H;
  x = (x - g.F[0]) / zoom + g.F[0];
  y = (y - g.F[1]) / zoom + g.F[1];
  const [ox, oy] = shift(mode, x, y, drop, cx, cy, scroll);
  x += ox; y += oy;
  const dx = x - g.C[0], dy = y - (g.C[1] - drop);
  const th = thAt(mode, cx);
  const c = Math.cos(-th), s = Math.sin(-th);
  const lx = c * dx - s * dy, ly = s * dx + c * dy;
  if (mode === "desk") {
    const a = g.a + drop * (0.25 + 1.4 * drop);
    const b = ly < 0 ? g.b : 0.55 + 2.5 * drop;
    return Math.hypot(lx / a, ly / b) < 1;
  }
  return Math.hypot(lx / g.a, ly / g.b) > 1 && ly > -0.02;
}

export const HeroLightB = memo(function HeroLightB({ mode, ctl, reelRef, onPhase }: {
  mode: Mode;
  /** filled with open() / close(): call open() straight from the click, so the film may start with sound */
  ctl: MutableRefObject<HeroCtl | null>;
  /** the <video> of the reel, for the player bar */
  reelRef: MutableRefObject<HTMLVideoElement | null>;
  onPhase: (p: ReelPhase) => void;
}) {
  const boxRef = useRef<HTMLDivElement | null>(null);
  const phaseCb = useRef(onPhase);
  useLayoutEffect(() => { phaseCb.current = onPhase; });

  useEffect(() => {
    const box = boxRef.current;
    const v = reelRef.current;
    if (!box || !v) return;
    const section = box.parentElement as HTMLElement | null;
    const scroller = box.closest<HTMLElement>(".st-site__scroll");
    const reduce = !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const saveData = !!(navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData;
    const emit = (p: ReelPhase) => phaseCb.current(p);
    const rest0 = REST[mode];
    const st = {
      hot: rest0, hotT: rest0, cx: 0, cy: 0, cxT: 0, cyT: 0, sc: 0, scT: 0, tease: 0, teaseT: 0,
      /* the lens: where the pointer is (screen, hero units), and how much (eased) */
      lx: 0, ly: 0, ls: 0, lsT: 0,
      t0: performance.now(), last: performance.now(), aspect: 1.8, frame: 0, zoom: 1, drop: 0, drawn: false,
    };
    const R = {
      phase: "idle" as ReelPhase,
      k: 0, flare: 0, down: false, asked: 0,
      kTw: tw(0, 0, 0, easeMove, 0), fTw: tw(0, 0, 0, easeEnter, 0), aTw: tw(0, 0, 0, easeEnter, 0),
    };
    let raf = 0, visible = true, running = false, timer = 0;

    /* ── the film element ── */
    v.muted = true; v.defaultMuted = true; v.loop = true; v.playsInline = true;
    v.setAttribute("muted", ""); v.setAttribute("playsinline", "");
    let src = "";
    const setSrc = (s: string, at = 0) => {
      if (src === s) return;
      src = s;
      v.src = s;
      if (at > 0) { try { v.currentTime = at; } catch { /* set once it loads */ } }
    };
    let volOk = false;
    try { v.volume = 0.5; volOk = Math.abs(v.volume - 0.5) < 0.01; v.volume = 1; } catch { volOk = false; }

    /* ── the light ── */
    const canvas = document.createElement("canvas");
    canvas.className = "hlb__canvas";
    canvas.setAttribute("aria-hidden", "true");
    box.insertBefore(canvas, box.firstChild);
    const gl = canvas.getContext("webgl", { antialias: false, alpha: false, premultipliedAlpha: false, powerPreference: "high-performance" });
    /* every program draws the same full-frame triangle from attribute 0 */
    const link = (fs: string) => {
      if (!gl) return null;
      const sh = (type: number, s: string) => {
        const o = gl.createShader(type)!; gl.shaderSource(o, s); gl.compileShader(o);
        if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) console.warn("HeroLightB shader:", gl.getShaderInfoLog(o));
        return o;
      };
      const p = gl.createProgram()!;
      gl.attachShader(p, sh(gl.VERTEX_SHADER, VERT));
      gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs));
      gl.bindAttribLocation(p, 0, "a");
      gl.linkProgram(p);
      return gl.getProgramParameter(p, gl.LINK_STATUS) ? p : null;
    };
    const prog = link(FRAG);
    /** no light to ride: the film just fades in over the plate (no WebGL, or reduced motion) */
    let fade = !gl || !prog || reduce;
    const plate = () => {
      // the photographic plate, fetched only when it is needed
      const img = box.querySelector<HTMLImageElement>(".hlb__fallback");
      if (img && !img.getAttribute("src")) img.src = mode === "desk" ? OPEN.cut : "img/plates/horizon-vertical.jpg";
      box.dataset.fallback = "1";
      canvas.remove();
    };
    if (!gl || !prog) plate(); else delete box.dataset.fallback;
    if (fade && section) section.dataset.fade = "1"; else if (section) delete section.dataset.fade;
    /** the muted film runs behind the glass (otherwise the poster sits there) */
    const glassFilm = !fade && !saveData;
    /** what plays behind the glass: desk, the film itself (sharp, and "Showreel" only restarts it with sound);
        the phone, the light cut */
    const glassSrc = mode === "desk" ? REEL_SRC.film : REEL_SRC.glass;

    /* ── the words: wiped along the light as it passes ── */
    const rims = () => Array.from(section?.querySelectorAll<HTMLElement>("[data-rim]") ?? []);
    const mask = (el: HTMLElement, img: string) => { el.style.setProperty("-webkit-mask-image", img); el.style.setProperty("mask-image", img); };
    const unwipe = () => rims().forEach((el) => { el.style.removeProperty("-webkit-mask-image"); el.style.removeProperty("mask-image"); });
    const wipe = (drop: number, k: number, zoom: number) => {
      if (!section) return;
      const W = section.offsetWidth, H = section.offsetHeight;
      const { lead, soft } = WIPE[mode];
      for (const el of rims()) {
        let x = 0, y = 0;
        for (let n: HTMLElement | null = el; n && n !== section; n = n.offsetParent as HTMLElement | null) { x += n.offsetLeft; y += n.offsetTop; }
        const w = el.offsetWidth, h = el.offsetHeight;
        const cx = x + w / 2, cy = y + h / 2;
        const r = rimAt(mode, cx, W, H, drop, k, zoom, st.cx, st.cy, st.sc);
        if (!r) { mask(el, "none"); continue; }
        // a gradient across the light line at the middle of the element: gone above it, there below it
        const th = Math.atan2(-r.m, -1);
        const sn = Math.sin(th), cs = Math.cos(th);
        const len = Math.abs(w * sn) + Math.abs(h * cs);
        const s0 = (r.y - cy) * -cs + len / 2 + lead;
        mask(el, `linear-gradient(${th.toFixed(4)}rad, transparent ${(s0 - soft / 2).toFixed(1)}px, #000 ${(s0 + soft / 2).toFixed(1)}px)`);
      }
    };

    let draw: (now: number) => void = () => {};
    let uploadFilm: (force?: boolean) => void = () => {};
    let posterTex: () => void = () => {};
    let stopGl = () => {};

    const kick = () => {
      if (fade || running || !visible || document.hidden || R.phase === "open") return;
      running = true;
      st.last = performance.now();
      raf = requestAnimationFrame(loop);
    };
    const halt = () => { cancelAnimationFrame(raf); running = false; };
    const loop = (now: number) => {
      raf = 0;
      if (!visible || document.hidden || R.phase === "open") { running = false; return; }
      // when everything has settled the frame only carries the slow haze and the film: draw at half rate
      const settled = Math.abs(st.hotT - st.hot) < 2e-4 && Math.abs(st.cxT - st.cx) < 2e-4 && Math.abs(st.cyT - st.cy) < 2e-4
        && Math.abs(st.scT - st.sc) < 2e-4 && Math.abs(st.teaseT - st.tease) < 2e-3 && Math.abs(st.lsT - st.ls) < 2e-3
        && now - st.t0 > 12500 && R.phase === "idle" && fin(R.aTw, now);
      st.frame++;
      if (!settled || st.frame % 2 === 0) draw(now);
      else st.last = now - 1000 / 60;
      // draw() may have handed over to the video
      if ((R.phase as ReelPhase) === "open") { running = false; return; }
      raf = requestAnimationFrame(loop);
    };

    /* the glass goes back to its resting state: muted, looping, behind the glass (or the poster) */
    const rest = () => {
      R.phase = "idle"; R.k = 0; R.flare = 0; R.down = false;
      R.kTw = tw(0, 0, 0, easeMove, 0); R.fTw = tw(0, 0, 0, easeEnter, 0);
      unwipe();
      v.muted = true;
      if (volOk) { try { v.volume = 1; } catch { /* fixed */ } }
      v.loop = true;
      if (glassFilm) {
        // back behind the glass, from where the film was (desk: the same source, it just plays on, muted)
        const at = v.ended ? 0 : v.currentTime;
        setSrc(glassSrc, at);
        if (visible && !document.hidden) v.play().catch(() => {});
      } else {
        v.pause();
        posterTex();
      }
      emit("idle");
    };
    /* the light is on screen at k = 1 (exactly the film): the <video> takes over, the canvas rests */
    const handOver = () => {
      box.dataset.reel = "on";
      R.phase = "open";
      halt();
      emit("open");
    };

    const open = () => {
      if (R.phase === "open" || R.phase === "opening") return;
      const now = performance.now();
      const back = R.phase === "closing";
      R.phase = "opening";
      emit("opening");
      // inside the click: the film may start with sound
      v.loop = false;
      if (!back) {
        setSrc(REEL_SRC.film);
        if (v.currentTime > 0) { try { v.currentTime = 0; } catch { /* fine */ } }
        R.down = false;
        R.asked = now;
      }
      v.muted = false;
      if (volOk && !fade && !back) { try { v.volume = 0; } catch { /* fixed */ } }
      v.play().catch(() => { v.muted = true; v.play().catch(() => {}); });
      if (fade) {
        box.dataset.fade = "1";
        requestAnimationFrame(() => { box.dataset.reel = "on"; });
        window.clearTimeout(timer);
        timer = window.setTimeout(() => { if (R.phase === "opening") { R.phase = "open"; emit("open"); } }, 560);
        return;
      }
      R.fTw = tw(R.flare, 1, FLARE_MS * (1 - R.flare), easeEnter, now);
      if (back) { R.down = true; R.kTw = tw(R.k, 1, DOWN_MS[mode] * (1 - R.k), easeMove, now); }
      kick();
    };

    const close = () => {
      if (R.phase === "idle" || R.phase === "closing") return;
      const now = performance.now();
      if (fade) {
        R.phase = "closing";
        emit("closing");
        delete box.dataset.reel;
        window.clearTimeout(timer);
        timer = window.setTimeout(() => { if (R.phase === "closing") rest(); }, 560);
        return;
      }
      if (R.phase === "open") {
        // hand back to the light: the canvas draws this very frame first, then the video steps aside
        uploadFilm(true);
        R.phase = "closing";
        draw(now);
        delete box.dataset.reel;
      }
      R.phase = "closing";
      emit("closing");
      R.kTw = tw(R.k, 0, UP_MS[mode] * R.k, easeMove, now);
      R.fTw = tw(R.flare, 0, UP_MS[mode] * Math.max(0.35, R.k), easeMove, now);
      kick();
    };
    const onEnded = () => { if (R.phase === "open" || R.phase === "opening") close(); };
    v.addEventListener("ended", onEnded);
    const local = (clientX: number, clientY: number) => {
      const r = (section ?? box).getBoundingClientRect();
      const W = (section ?? box).offsetWidth, H = (section ?? box).offsetHeight;
      // the site may sit scaled inside its stage: client px → section px
      return { X: ((clientX - r.left) / r.width) * W, Y: ((clientY - r.top) / r.height) * H, W, H };
    };
    ctl.current = {
      open, close, phase: () => R.phase,
      tease: (x: number) => { st.teaseT = reduce || fade ? 0 : Math.max(0, Math.min(1, x)); kick(); },
      onGlass: (clientX: number, clientY: number) => {
        if (R.phase !== "idle") return false;
        const { X, Y, W, H } = local(clientX, clientY);
        if (X < 0 || Y < 0 || X > W || Y > H) return false;
        return glassAt(mode, X, Y, W, H, st.drop, st.zoom, st.cx, st.cy, st.sc);
      },
      spot: () => {
        if (!st.drawn || !section) return null;
        const W = section.offsetWidth, H = section.offsetHeight;
        // the shader's light peaks where the rim's own x (in the disc's frame, after the parallax) meets the hot spot
        const hot = mode === "desk" ? st.hot : st.hot + st.sc * 0.08;
        const pts = rimPts(mode, W, H, st.drop, R.k, st.zoom, st.cx, st.cy, st.sc);
        for (let i = 1; i < pts.length; i++) {
          const p0 = pts[i - 1], p1 = pts[i];
          if ((p1.u - hot) * (p0.u - hot) <= 0 && p1.u !== p0.u) {
            const f = (hot - p0.u) / (p1.u - p0.u);
            return { x: p0.X + (p1.X - p0.X) * f, y: p0.Y + (p1.Y - p0.Y) * f };
          }
        }
        return null;
      },
    };
    // dev only: the JS mirrors of the light, to check them against the frame
    if (import.meta.env.DEV) {
      (window as unknown as { __hlbGeo?: unknown }).__hlbGeo = {
        rim: (x: number) => section && rimAt(mode, x, section.offsetWidth, section.offsetHeight, st.drop, R.k, st.zoom, st.cx, st.cy, st.sc),
        glass: (X: number, Y: number) => section && glassAt(mode, X, Y, section.offsetWidth, section.offsetHeight, st.drop, st.zoom, st.cx, st.cy, st.sc),
        spot: () => ctl.current?.spot(),
      };
    }

    if (gl && prog) {
      gl.useProgram(prog);
      const buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      const U = (n: string) => gl.getUniformLocation(prog, n);
      const u = {
        res: U("uRes"), time: U("uTime"), mob: U("uMob"), hot: U("uHot"), ign: U("uIgn"), push: U("uPush"),
        scroll: U("uScroll"), unit: U("uUnit"), cam: U("uCam"), warm: U("uWarm"), core: U("uCore"), deep: U("uDeep"),
        reel: U("uReel"), reelA: U("uReelA"), reelAsp: U("uReelAsp"), k: U("uK"), drop: U("uDrop"), flare: U("uFlare"),
        clr: U("uClr"), fit: U("uFit"), tease: U("uTease"), haloN: U("uHaloN"), haloW: U("uHaloW"), haloF: U("uHaloF"),
        look: U("uLook"), lens: U("uLens"),
      };
      gl.uniform3f(u.warm, WARM[0], WARM[1], WARM[2]);
      gl.uniform3f(u.core, CORE[0], CORE[1], CORE[2]);
      gl.uniform3f(u.deep, DEEP[0], DEEP[1], DEEP[2]);
      gl.uniform1f(u.mob, mode === "mob" ? 1 : 0);
      gl.uniform1f(u.reelAsp, 16 / 9);
      gl.uniform1i(u.haloN, 1);
      gl.uniform1i(u.haloW, 2);
      gl.uniform1i(u.haloF, 4);

      /* the film's light: boxed down into three small targets and blurred there (units 1, 2 and 4 hold the results,
         unit 3 is the passes' scratch), redone only when a new frame of the film arrives */
      const pDown = link(DOWN), pBlur = link(BLUR);
      const target = (w: number, h: number, unit: number) => {
        const t = gl.createTexture()!;
        gl.activeTexture(gl.TEXTURE0 + unit);
        gl.bindTexture(gl.TEXTURE_2D, t);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
        const fb = gl.createFramebuffer()!;
        gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
        const ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
        return { t, fb, w, h, ok };
      };
      const nA = target(HALO.near[0], HALO.near[1], 1), wA = target(HALO.wide[0], HALO.wide[1], 2), fA = target(HALO.far[0], HALO.far[1], 4);
      const nB = target(HALO.near[0], HALO.near[1], 3), wB = target(HALO.wide[0], HALO.wide[1], 3), fB = target(HALO.far[0], HALO.far[1], 3);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      const haloOk = !!pDown && !!pBlur && [nA, wA, fA, nB, wB, fB].every((t) => t.ok);
      const G = gauss(HALO.sigma);
      const dU = pDown ? { src: gl.getUniformLocation(pDown, "uSrc"), size: gl.getUniformLocation(pDown, "uSize"), srgb: gl.getUniformLocation(pDown, "uSrgb") } : null;
      const bU = pBlur ? { src: gl.getUniformLocation(pBlur, "uSrc"), size: gl.getUniformLocation(pBlur, "uSize"), dir: gl.getUniformLocation(pBlur, "uDir") } : null;
      if (pDown && dU) { gl.useProgram(pDown); gl.uniform1i(dU.src, 3); }
      if (pBlur && bU) {
        gl.useProgram(pBlur); gl.uniform1i(bU.src, 3);
        gl.uniform1f(gl.getUniformLocation(pBlur, "uW0"), G.w0);
        gl.uniform4fv(gl.getUniformLocation(pBlur, "uOff"), G.off);
        gl.uniform4fv(gl.getUniformLocation(pBlur, "uW"), G.wt);
      }
      gl.useProgram(prog);

      // the film as a texture: the last good frame stays while the next source loads
      const tex = gl.createTexture()!;
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([3, 3, 3, 255]));
      gl.uniform1i(u.reel, 0);
      type Tgt = typeof nA;
      const pass = (src: WebGLTexture, dst: Tgt) => {
        gl.bindFramebuffer(gl.FRAMEBUFFER, dst.fb);
        gl.viewport(0, 0, dst.w, dst.h);
        gl.activeTexture(gl.TEXTURE3);
        gl.bindTexture(gl.TEXTURE_2D, src);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      };
      const halo = () => {
        if (!haloOk || !pDown || !pBlur || !dU || !bU) return;
        const blur2 = (a: Tgt, b: Tgt) => {
          gl.useProgram(pBlur);
          gl.uniform2f(bU.size, a.w, a.h);
          gl.uniform2f(bU.dir, 1, 0); pass(a.t, b);
          gl.uniform2f(bU.dir, 0, 1); pass(b.t, a);
        };
        const down = (src: WebGLTexture, dst: Tgt, srgb: number) => {
          gl.useProgram(pDown);
          gl.uniform1f(dU.srgb, srgb); gl.uniform2f(dU.size, dst.w, dst.h);
          pass(src, dst);
        };
        down(tex, nA, 1); blur2(nA, nB);
        down(nA.t, wA, 0); blur2(wA, wB);
        down(wA.t, fA, 0); blur2(fA, fB);
        // back to the frame
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.activeTexture(gl.TEXTURE0);
        gl.viewport(0, 0, canvas.width, canvas.height);
        gl.useProgram(prog);
      };
      let texW = 0, texH = 0, texOk = false, fresh = true, lastCb = 0;
      const got = (w: number, h: number) => {
        if (w !== texW || h !== texH) { texW = w; texH = h; gl.uniform1f(u.reelAsp, w / h); }
        if (!texOk) { texOk = true; R.aTw = tw(0, 1, reduce ? 0 : 2400, easeEnter, performance.now()); }
      };
      // only upload new frames where the browser says so; otherwise every drawn frame while it plays
      type RVFC = HTMLVideoElement & { requestVideoFrameCallback?: (cb: () => void) => number; cancelVideoFrameCallback?: (h: number) => void };
      const vf = v as RVFC;
      let rvfc = 0;
      const onFrame = () => { fresh = true; lastCb = performance.now(); rvfc = vf.requestVideoFrameCallback!(onFrame); };
      const arm = () => { if (!vf.requestVideoFrameCallback) return; if (rvfc) vf.cancelVideoFrameCallback?.(rvfc); rvfc = vf.requestVideoFrameCallback(onFrame); };
      arm();
      v.addEventListener("loadeddata", arm);
      uploadFilm = (force = false) => {
        if (v.readyState < 2 || !v.videoWidth) return;
        const stale = performance.now() - lastCb > 250;
        if (!force && !fresh && !(stale && !v.paused) && texOk) return;
        fresh = false;
        try {
          if (v.videoWidth !== texW || v.videoHeight !== texH) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, v);
          else gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGB, gl.UNSIGNED_BYTE, v);
          got(v.videoWidth, v.videoHeight);
        } catch { return; /* a frame that cannot be read: keep the last one */ }
        // its light, blurred, for the glow in the glass
        halo();
      };
      posterTex = () => {
        const img = new Image();
        img.decoding = "async";
        img.onload = () => {
          if (R.phase !== "idle") return;
          try { gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, img); got(img.naturalWidth, img.naturalHeight); } catch { return; }
          halo();
          if (!running) draw(performance.now());
        };
        img.src = REEL_SRC.poster;
      };

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

      draw = (now: number) => {
        // per-frame lerps made time-based; k stays < 1 for any dt, so slow frames converge without overshoot
        const dt = Math.min(0.5, Math.max(0, (now - st.last) / 1000));
        st.last = now;
        const kk = (per: number) => 1 - Math.pow(1 - per, dt * 60);
        if (reduce) {
          st.hot = st.hotT; st.cx = st.cxT; st.cy = st.cyT; st.sc = st.scT; st.tease = st.teaseT; st.ls = st.lsT;
        } else {
          st.hot += (st.hotT - st.hot) * kk(0.035);
          st.cx += (st.cxT - st.cx) * kk(0.048);
          st.cy += (st.cyT - st.cy) * kk(0.04);
          st.sc += (st.scT - st.sc) * kk(0.09);
          st.tease += (st.teaseT - st.tease) * kk(0.07);
          // the lens opens and closes over ~300 ms
          st.ls += (st.lsT - st.ls) * kk(0.12);
        }
        // the reveal: the flare holds until the film plays, then the rim goes down
        if (R.phase === "opening" && !R.down) {
          const live = src === REEL_SRC.film && !v.paused && v.readyState >= 3 && v.currentTime > 0.04;
          if ((live && fin(R.fTw, now)) || now - R.asked > WAIT_MS) {
            R.down = true;
            R.kTw = tw(R.k, 1, DOWN_MS[mode] * (1 - R.k), easeMove, now);
          }
        }
        R.flare = val(R.fTw, now);
        R.k = val(R.kTw, now);
        // dev only: freeze the reveal at a given point, and the camera (window.__hlb = { k, flare, cx, cy, hot })
        type Dbg = { k?: number; flare?: number; cx?: number; cy?: number; hot?: number };
        const dbg = import.meta.env.DEV ? (window as unknown as { __hlb?: Dbg }).__hlb : undefined;
        if (dbg) {
          if (dbg.k != null) R.k = dbg.k;
          if (dbg.flare != null) R.flare = dbg.flare;
          if (dbg.cx != null) st.cx = st.cxT = dbg.cx;
          if (dbg.cy != null) st.cy = st.cyT = dbg.cy;
          if (dbg.hot != null) st.hot = st.hotT = dbg.hot;
        }
        // the sound comes in with the light going down, and leaves as it comes back up
        if (volOk && !v.muted && (R.phase === "opening" || R.phase === "closing")) {
          const vol = R.phase === "opening" ? (R.down ? Math.min(1, R.k * 1.3) : 0) : Math.pow(R.k, 1.6);
          try { v.volume = vol; } catch { /* fixed */ }
        }
        if (glassFilm || R.phase !== "idle") uploadFilm();
        const el = (now - st.t0) / 1000;
        const ign = reduce ? 1 : easeEnter(Math.max(0, el - 0.12) / 2.4);
        const push = reduce ? 0 : easeMove(el / 12);
        const drop = DROP[mode] * R.k;
        st.zoom = 1 + 0.03 * push; st.drop = drop; st.drawn = true;
        gl.uniform2f(u.res, canvas.width, canvas.height);
        gl.uniform1f(u.look, glassLook());
        // dev only: pin the tease (window.__hlbTease = 0..1) and the lens (window.__hlbLens = { x, y, s }, section px)
        let tease = st.tease, lx = st.lx, ly = st.ly, ls = st.ls;
        if (import.meta.env.DEV) {
          const w = window as unknown as { __hlbTease?: number; __hlbLens?: { x: number; y: number; s?: number } };
          if (w.__hlbTease != null) tease = w.__hlbTease;
          if (w.__hlbLens && section) {
            const Wd = section.offsetWidth, Hd = section.offsetHeight;
            lx = (w.__hlbLens.x / Wd - 0.5) * (Wd / Hd); ly = 0.5 - w.__hlbLens.y / Hd; ls = w.__hlbLens.s ?? 1;
          }
        }
        gl.uniform1f(u.tease, tease);
        // the lens lives on the glass while it rests; the reveal takes it with it
        gl.uniform3f(u.lens, lx, ly, ls * (1 - sstep(0, 0.3, R.k)));
        gl.uniform1f(u.time, reduce ? 20 : el + 20);
        gl.uniform1f(u.hot, st.hot);
        gl.uniform1f(u.ign, ign);
        gl.uniform1f(u.push, push);
        gl.uniform1f(u.scroll, st.sc);
        gl.uniform1f(u.unit, 1 / Math.max(1, box.offsetHeight));
        gl.uniform2f(u.cam, st.cx, st.cy);
        gl.uniform1f(u.reelA, val(R.aTw, now));
        gl.uniform1f(u.k, R.k);
        gl.uniform1f(u.drop, drop);
        gl.uniform1f(u.flare, R.flare);
        gl.uniform1f(u.clr, sstep(0.08, 0.9, R.k));
        gl.uniform1f(u.fit, mode === "mob" ? sstep(0.1, 1, R.k) : 0);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        if (import.meta.env.DEV) { const w = window as unknown as { __hlbN?: number; __hlbE?: number }; w.__hlbN = (w.__hlbN ?? 0) + 1; const e = gl.getError(); if (e) w.__hlbE = e; }
        if (R.phase !== "idle" || dbg) wipe(drop, R.k, 1 + 0.03 * push);
        if (R.phase === "opening" && R.down && R.k >= 1) handOver();
        else if (R.phase === "closing" && R.k <= 0 && fin(R.fTw, now)) rest();
      };

      resize();
      draw(performance.now());
      kick();

      const ro = new ResizeObserver(() => { resize(); if (R.phase !== "open") draw(performance.now()); });
      ro.observe(box);
      const poll = window.setInterval(() => { if (visible && !document.hidden && R.phase !== "open" && resize() && !running) draw(performance.now()); }, 400);
      const onLost = (e: Event) => {
        e.preventDefault(); halt();
        plate();
        fade = true;
        if (section) section.dataset.fade = "1";
        if (R.phase === "opening" || R.phase === "closing") { box.dataset.fade = "1"; if (R.phase === "opening") handOver(); else rest(); }
      };
      canvas.addEventListener("webglcontextlost", onLost);
      stopGl = () => {
        ro.disconnect(); window.clearInterval(poll);
        canvas.removeEventListener("webglcontextlost", onLost);
        v.removeEventListener("loadeddata", arm);
        if (rvfc) vf.cancelVideoFrameCallback?.(rvfc);
        gl.getExtension("WEBGL_lose_context")?.loseContext();
      };
    }

    // behind the glass: the light cut starts once the light has begun to ignite, and only once the hero is seen
    // (a hero that starts off-screen fetches nothing); otherwise the poster sits there
    let startT = 0, wantGlass = false;
    const startGlass = () => {
      if (R.phase !== "idle" || src) return;
      if (!visible || document.hidden) { wantGlass = true; return; }
      wantGlass = false;
      setSrc(glassSrc);
      v.play().catch(() => {});
    };
    if (glassFilm) startT = window.setTimeout(startGlass, 900);
    else if (gl && prog) posterTex();

    const io = new IntersectionObserver((es) => {
      // entries can arrive batched: the last one is the current state
      visible = es[es.length - 1].isIntersecting;
      if (visible) {
        kick();
        if (wantGlass) startGlass();
        else if (R.phase === "idle" && glassFilm && src) v.play().catch(() => {});
      } else {
        halt();
        if (R.phase === "idle") v.pause();
      }
    });
    io.observe(box);

    const onMove = (e: PointerEvent) => {
      if (reduce || mode !== "desk" || e.pointerType === "touch") return;
      const r = box.getBoundingClientRect();
      const nx = (e.clientX - r.left) / r.width, ny = (e.clientY - r.top) / r.height;
      st.hotT = (Math.max(0.08, Math.min(0.92, nx)) - 0.5) * st.aspect;
      st.cxT = Math.max(-0.5, Math.min(0.5, nx - 0.5));
      st.cyT = Math.max(-0.5, Math.min(0.5, ny - 0.5));
      // the lens: a window of clearer glass around the pointer while it is over the glass (and the film is there)
      st.lx = (nx - 0.5) * st.aspect; st.ly = 0.5 - ny;
      let on = false;
      if (R.phase === "idle" && !fade && section) {
        const { X, Y, W, H } = local(e.clientX, e.clientY);
        on = glassAt(mode, X, Y, W, H, st.drop, st.zoom, st.cx, st.cy, st.sc);
      }
      st.lsT = on ? 1 : 0;
      kick();
    };
    const onLeave = () => { st.hotT = rest0; st.cxT = 0; st.cyT = 0; st.lsT = 0; };
    section?.addEventListener("pointermove", onMove);
    section?.addEventListener("pointerleave", onLeave);
    const onScroll = () => {
      if (!scroller || reduce) return;
      st.scT = Math.min(1.2, scroller.scrollTop / Math.max(1, box.offsetHeight));
    };
    scroller?.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    const onVis = () => {
      if (document.hidden) { halt(); if (R.phase === "idle") v.pause(); }
      else { kick(); if (wantGlass) startGlass(); else if (R.phase === "idle" && glassFilm && src && visible) v.play().catch(() => {}); }
    };
    document.addEventListener("visibilitychange", onVis);

    return () => {
      halt(); io.disconnect(); window.clearTimeout(startT); window.clearTimeout(timer);
      section?.removeEventListener("pointermove", onMove);
      section?.removeEventListener("pointerleave", onLeave);
      scroller?.removeEventListener("scroll", onScroll);
      document.removeEventListener("visibilitychange", onVis);
      v.removeEventListener("ended", onEnded);
      stopGl();
      unwipe();
      if (section) delete section.dataset.fade;
      ctl.current = null;
      v.pause();
      v.removeAttribute("src");
      v.load();
      canvas.remove();
    };
  }, [mode, ctl, reelRef]);

  return (
    <div ref={boxRef} className="st-hero__plate hlb grain" data-mode={mode}>
      <img className="hlb__fallback" alt="" />
      <video ref={reelRef} className="hlb__reel" muted playsInline preload="auto" aria-hidden tabIndex={-1} disablePictureInPicture />
    </div>
  );
});
