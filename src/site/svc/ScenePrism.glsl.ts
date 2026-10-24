/* The prism scene, one fragment shader. A pinhole camera looks down onto a satin-black floor (y = 0) on which an
   upright glass prism stands. Every camera ray is traced analytically: floor, prism (5 planes, rounded edges by a
   smooth-max normal), refraction through the glass per colour channel (so the light seen through it fringes as real
   glass does), one faint internal reflection, absorption of the dark tint. The light itself — the beam, its path inside
   the glass, the fan of colour and where it lands — comes solved from the CPU (ScenePrism.optics.ts) and is drawn with
   the cover's line model (a thin core and two bloom falloffs in pixels), the cover's smoke, static grain and tone.
   Cost: the floor's mirror and everything seen through the glass use cheaper smoke; the blurred spectrum is a texture. */

import { CONE_GLSL } from "./ScenePrism.objects";

export const PRISM_VERT = `attribute vec2 a; void main(){ gl_Position = vec4(a, 0.0, 1.0); }`;

export const PRISM_FRAG = `
precision highp float;
uniform vec2 uRes;
uniform float uTime;
uniform vec3 uCamPos, uCamF, uCamR, uCamU;
uniform float uFocal;
uniform vec2 uShift;
uniform float uPx, uCore;

uniform vec4 uPl[5];
uniform float uBev;
uniform vec3 uTint, uEta;
uniform float uFrost;

uniform vec3 uBA, uPin, uPoE, uPoM;
uniform vec3 uIrA, uIrB;
uniform float uIrI;
uniform vec3 uFanO, uFanN;
uniform float uFanAE, uFanAM, uFanM;
uniform float uIB, uIF, uIForm, uFront, uIG, uIP, uBeamF;
uniform vec3 uWarm, uCoreCol;
/* the beam comes out of the active service's name: it fades in over this length from its origin (world units) */
uniform float uFadeLen, uTaper;
/* the beam before a switch, going where it was (uIB0 → 0) */
uniform vec3 uBA0, uPin0;
uniform float uIB0;
/* uSpecW: how much the light is the AI spectrum (1) rather than our one warm light (0) */
uniform float uSpecW;
uniform float uTopY, uTopSoft;   // the hairline under the head: the scene fades out before it (canvas px from the bottom)
uniform vec3 uS0, uS1, uS2, uS3, uS4;
uniform sampler2D uSpec;
/* Motion's projection: the video, its frame on the floor (centre, half-axes), how much of the video the frame shows */
uniform sampler2D uProj;
uniform float uProjW, uProjGain;
uniform vec2 uProjC, uProjU, uProjV, uProjCrop;
uniform float uGrain, uHaze, uFanGain, uLandGain, uEnv, uAirFan, uFanRefl;
uniform vec2 uBeamFade;
uniform float uFanBlur, uPoolSoft, uPoolTh, uGain;

float hash(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float vnoise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash(i), b = hash(i + vec2(1.0, 0.0)), c = hash(i + vec2(0.0, 1.0)), d = hash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
float fbm(vec2 p){ float v = 0.0, a = 0.5; for (int i = 0; i < 4; i++) { v += a * vnoise(p); p = p * 2.03 + vec2(1.7, 9.2); a *= 0.5; } return v; }
float fbm2(vec2 p){ return 0.5 * vnoise(p) + 0.25 * vnoise(p * 2.03 + vec2(1.7, 9.2)) + 0.125; }
/* the cover's smoke, drifting very slowly */
float smoke(vec2 q){ float t = uTime * 0.035; return fbm(vec2(q.x + t, q.y - t * 1.6)); }
float smokeLite(vec2 q){ float t = uTime * 0.035; return fbm2(vec2(q.x + t, q.y - t * 1.6)); }

/* the AI spectrum, warm to cool (s outside 0..1 holds the end colours) */
vec3 spectrum(float s){
  float x = clamp(s, 0.0, 1.0) * 4.0;
  vec3 c = mix(uS0, uS1, smoothstep(0.0, 1.0, x));
  c = mix(c, uS2, smoothstep(1.0, 2.0, x));
  c = mix(c, uS3, smoothstep(2.0, 3.0, x));
  return mix(c, uS4, smoothstep(3.0, 4.0, x));
}
/* the colour of a bundle of the fan that is still w (in s units) wide — a Gaussian-blurred spectrum, precomputed;
   near the glass all colours overlap into warm white */
vec3 spectrumW(float s, float w){ return texture2D(uSpec, vec2((s + 0.75) / 2.5, clamp(w / 2.4, 0.0, 1.0))).rgb * 1.6; }
/* the light leaving the glass as it falls on the objects and the floor, and their shadows (shared with the objects) */
${CONE_GLSL}
/* our light in the haze (left out of the LITE build, the fallback for GPUs that cannot link the full one): the whole
   cone glows faintly in the air, and the objects cut shafts of shadow through it
   (marched in 12 dithered steps inside the light's reach) */
uniform float uAirCone;
vec3 coneAir(vec3 ro, vec3 rd, float tmax){
#ifdef LITE
  return vec3(0.0);
#else
  if (uAirCone < 1e-4) return vec3(0.0);
  vec3 oc = ro - uLO;
  float b = dot(oc, rd), c = dot(oc, oc) - 10.0;
  float h = b * b - c;
  if (h < 0.0) return vec3(0.0);
  h = sqrt(h);
  float t0 = max(-b - h, 0.0), t1 = min(-b + h, tmax);
  if (t1 <= t0) return vec3(0.0);
  float dt = (t1 - t0) / 12.0;
  float j = hash(gl_FragCoord.xy * 1.37 + 5.1);
  vec3 acc = vec3(0.0);
  for (int i = 0; i < 12; i++) {
    vec3 p = ro + rd * (t0 + (float(i) + j) * dt);
    if (p.y < 0.0) break;
    vec3 cl = coneLight(p);
    if (cl.r + cl.g + cl.b < 1e-4) continue;
    acc += cl * shadowVis1(p);
  }
  vec3 pm = ro + rd * (0.5 * (t0 + t1));
  return acc * dt * uAirCone * mix(0.7, 1.3, smokeLite(pm.xz * 1.7 + pm.y));
#endif
}

/* closest approach of the ray ro + rd t (t0..t1) to the segment a → b: (distance, t, u 0..1) */
vec3 seg(vec3 ro, vec3 rd, float t0, float t1, vec3 a, vec3 b){
  vec3 ab = b - a; float L2 = max(dot(ab, ab), 1e-8);
  vec3 w0 = ro - a;
  float B = dot(rd, ab), C = dot(rd, w0), D = dot(ab, w0);
  float den = L2 - B * B;
  float u = den > 1e-7 ? clamp((D - B * C) / den, 0.0, 1.0) : 0.0;
  float t = clamp(B * u - C, t0, t1);
  u = clamp((D + B * t) / L2, 0.0, 1.0);
  t = clamp(B * u - C, t0, t1);
  return vec3(length(w0 + rd * t - ab * u), t, u);
}
float segPt(vec3 p, vec3 a, vec3 b){
  vec3 ab = b - a;
  float u = clamp(dot(p - a, ab) / max(dot(ab, ab), 1e-8), 0.0, 1.0);
  return length(p - a - ab * u);
}
float pt(vec3 ro, vec3 rd, float t0, float t1, vec3 p, out float tt){
  tt = clamp(dot(p - ro, rd), t0, t1);
  return length(ro + rd * tt - p);
}

/* the incoming beam: the cover's line with its core width scaled by w (thin at its birth) and its blooms by g */
vec3 beamGlow(float dpx, float w, float g, float b){
  float d = dpx / b;
  float c = d / (uCore * w);
  return (uCoreCol * exp(-c * c) * 1.6 * mix(0.55, 1.0, w) + uWarm * (exp(-d / (5.0 * w)) * 0.5 + exp(-d / 18.0) * 0.06) * g) / b;
}
/* the cover's line: a thin core and two bloom falloffs, measured in pixels; b > 1 blurs it (the satin mirror) */
vec3 lineGlow(float dpx, vec3 warm, vec3 core, float b){
  float d = dpx / b;
  float c = d / uCore;
  return (core * exp(-c * c) * 1.6 + warm * (exp(-d / 6.0) * 0.55 + exp(-d / 26.0) * 0.12)) / b;
}

/* ---------- prism ---------- */
vec2 prismHit(vec3 ro, vec3 rd){
  float tN = -1e5, tF = 1e5;
  for (int i = 0; i < 5; i++) {
    float den = dot(uPl[i].xyz, rd);
    float dist = uPl[i].w - dot(uPl[i].xyz, ro);
    float dd = abs(den) < 1e-6 ? (den < 0.0 ? -1e-6 : 1e-6) : den;
    float t = dist / dd;
    if (dd < 0.0) tN = max(tN, t); else tF = min(tF, t);
  }
  return vec2(tN, tF);
}
float prismExit(vec3 ro, vec3 rd){
  float tF = 1e5;
  for (int i = 0; i < 5; i++) {
    float den = dot(uPl[i].xyz, rd);
    if (den > 1e-6) tF = min(tF, (uPl[i].w - dot(uPl[i].xyz, ro)) / den);
  }
  return tF;
}
/* smooth-max normal = finely rounded edges (not the foot: it stands crisp on the floor); edge = 0 on a face, → 0.5 */
vec3 prismN(vec3 p, out float edge){
  vec3 n = vec3(0.0); float wm = 0.0, ws = 0.0;
  for (int i = 0; i < 4; i++) {
    float w = exp((dot(uPl[i].xyz, p) - uPl[i].w) / uBev);
    n += uPl[i].xyz * w; ws += w; wm = max(wm, w);
  }
  edge = 1.0 - wm / max(ws, 1e-20);
  if (p.y < 1e-3) { edge = 0.0; n = vec3(0.0, -1.0, 0.0); }
  return normalize(n);
}
/* 2D distance from a floor point to the prism's footprint (> 0 outside) */
float footD(vec2 xz){
  float d = -1e5;
  for (int i = 0; i < 3; i++) d = max(d, dot(uPl[i].xz, xz) - uPl[i].w);
  return d;
}

/* ---------- the fan ---------- */
/* light of the fan above the floor point xz (sheet height there: ys); soft widens each colour's bundle */
vec3 fanCol(vec2 xz, float soft, out float r){
  vec2 v = xz - uFanO.xz;
  r = max(length(v), 1e-4);
  float a = atan(v.y, v.x);
  float da = uFanAM - uFanAE;
  float wid = (0.022 + uFanBlur * r) * soft;
  float sg = da < 0.0 ? -1.0 : 1.0;
  float latE = r * sin((a - uFanAE) * sg);
  float latM = r * sin((uFanAM - a) * sg);
  float body = smoothstep(-wid, wid, latE) * smoothstep(-wid, wid, latM) * smoothstep(uFront, uFront - 0.45, r);
  if (body < 1e-4) return vec3(0.0);
  float s = (a - uFanAE) / da;
  float ws = wid / max(r * abs(da), 1e-3);
  // our light (Motion, Vertical) carries one colour; AI parts it into the spectrum
  // AI: the further the colours travel apart, the purer each one gets
  vec3 sc = spectrumW(s, ws);
  sc = max(mix(vec3(dot(sc, vec3(0.3, 0.5, 0.2))), sc, 1.0 + 1.3 * smoothstep(0.45, 1.8, r)), 0.0);
  // and comes out of the glass dark, gathering light as it opens
  float entry = mix(1.0, smoothstep(0.06, 0.85, r), uSpecW);
  return mix(uS0, sc, uSpecW) * body * entry * 0.06 / (0.06 + r * abs(da) + wid);
}
/* the fan in the haze: a sheet of light leaving the glass, opening warm → cool, descending onto the floor */
vec3 fanAir(vec3 ro, vec3 rd, float t0, float t1, float soft, float lite){
  float den = dot(rd, uFanN);
  float dd = abs(den) < 1e-4 ? 1e-4 : den;
  float t = dot(uFanO - ro, uFanN) / dd;
  if (t < t0 || t > t1) return vec3(0.0);
  vec3 p = ro + rd * t;
  if (p.y < -0.02) return vec3(0.0);
  float r;
  vec3 c = fanCol(p.xz, soft, r);
  if (c.r + c.g + c.b < 1e-5) return vec3(0.0);
  float sm = lite > 0.5 ? 0.8 : mix(0.35, 1.35, smokeLite(vec2(r * 2.4, (p.x - p.z) * 3.0 + p.y * 4.0)));
  // the objects cut the sheet of light in the haze: their shadows run through the air
  float vis = lite > 0.5 ? 1.0 : shadowVis1(p);
  // (Motion's projector: the hard-edged sheet gives way to the soft haze of the cone, so the beam opens into the picture)
  return c * vis * gobo(p) * smoothstep(-0.02, 0.06, p.y) * exp(-r / uAirFan) * sm / max(abs(den), 0.22) * uIF * uFanGain * (1.0 - uProjW);
}

/* ---------- the beam ---------- */
/* the beam and the two hot spots, seen along a ray in air; tc = path length before ro; b = blur; lite = no smoke */
vec3 lightsAir(vec3 ro, vec3 rd, float t0, float t1, float tc, float b, float lite){
  vec3 col = vec3(0.0);
  // the beam comes up out of the dark on the left and runs to the glass
  vec3 q = seg(ro, rd, t0, t1, uBA, uPin);
  float dpx = q.x / (max(tc + q.y, 0.05) * uPx);
  // it comes out of the last letter (fades in from its origin) and the light travels to the glass when it ignites
  float Lb = length(uPin - uBA);
  float dist = (1.0 - q.z) * Lb;
  float along = smoothstep(0.0, uFadeLen, q.z * Lb);
  along *= smoothstep(uBeamF - 0.25, uBeamF + 0.05, dist);
  // it is born thin: a hair of light out of the letter, gathering its core and its glow over the first stretch, so
  // there is no cut where it starts; its wide bloom stays modest all along
  float tp = smoothstep(0.0, uTaper, q.z * Lb);
  float hz = (exp(-q.x / 0.022) * 0.12 + exp(-q.x / 0.1) * 0.025) * tp * tp;
  float sm = lite > 0.5 ? 0.85 : mix(0.45, 1.25, smoke(vec2(q.z * 7.0, q.x * 9.0)));
  col += (beamGlow(dpx, mix(0.28, 1.0, tp), tp * tp, b) + uWarm * hz * sm * uHaze) * along * uIB;
  // the beam before a switch fades where it is
  if (uIB0 > 0.001) {
    q = seg(ro, rd, t0, t1, uBA0, uPin0);
    dpx = q.x / (max(tc + q.y, 0.05) * uPx);
    float al0 = smoothstep(0.0, uFadeLen, q.z * length(uPin0 - uBA0));
    col += (lineGlow(dpx, uWarm, uCoreCol, b) + uWarm * (exp(-q.x / 0.025) * 0.14 + exp(-q.x / 0.12) * 0.04) * 0.85 * uHaze) * al0 * uIB0;
  }
  // where the light meets the glass, and where it leaves it in colour
  float tt;
  float d = pt(ro, rd, t0, t1, uPin, tt);
  dpx = d / (max(tc + tt, 0.05) * uPx) / b;
  col += (uCoreCol * exp(-dpx / 2.2) * 0.9 + uWarm * exp(-dpx / 11.0) * 0.32 + uWarm * exp(-dpx / 48.0) * 0.08) * uIG / b;
  vec3 po = (uPoE + uPoM) * 0.5;
  d = pt(ro, rd, t0, t1, po, tt);
  dpx = d / (max(tc + tt, 0.05) * uPx) / b;
  vec3 mid = spectrum(0.5);
  col += (uCoreCol * exp(-dpx / 2.0) * 0.55 + mix(uWarm, mid, 0.5) * exp(-dpx / 12.0) * 0.26 + mid * exp(-dpx / 55.0) * 0.07) * uIF / b;
  return col;
}

/* light inside the glass: the beam's path (it parts into colour toward the exit face) and one internal reflection */
vec3 lightsGlass(vec3 ro, vec3 rd, float t1, float tc){
  vec3 col = vec3(0.0);
  vec3 q = seg(ro, rd, 0.0, t1, uPin, uPoE);
  float dpx = q.x / (max(tc + q.y, 0.05) * uPx);
  vec3 cE = mix(uCoreCol, uS0, smoothstep(0.3, 1.0, q.z));
  col += (lineGlow(dpx, uWarm, cE, 1.0) * 0.5 + uWarm * exp(-q.x / 0.03) * 0.1) * uIG;
  q = seg(ro, rd, 0.0, t1, uPin, uPoM);
  dpx = q.x / (max(tc + q.y, 0.05) * uPx);
  vec3 cM = mix(uCoreCol, uS4, smoothstep(0.3, 1.0, q.z));
  vec3 wM = mix(uWarm, uS3, q.z);
  col += (lineGlow(dpx, wM, cM, 1.0) * 0.5 + wM * exp(-q.x / 0.03) * 0.1) * uIG * smoothstep(0.0, 0.4, uIF + 0.2);
  q = seg(ro, rd, 0.0, t1, uIrA, uIrB);
  dpx = q.x / (max(tc + q.y, 0.05) * uPx);
  col += (lineGlow(dpx, uWarm, uWarm, 1.3) + uWarm * exp(-q.x / 0.05) * 0.25) * uIrI * uIG;
  float tt;
  float d = pt(ro, rd, 0.0, t1, uPin, tt);
  dpx = d / (max(tc + tt, 0.05) * uPx);
  col += (uCoreCol * exp(-dpx / 2.4) * 0.8 + uWarm * exp(-dpx / 14.0) * 0.3) * uIG;
  vec3 po = (uPoE + uPoM) * 0.5;
  d = pt(ro, rd, 0.0, t1, po, tt);
  dpx = d / (max(tc + tt, 0.05) * uPx);
  col += (uCoreCol * exp(-dpx / 2.2) * 0.5 + spectrum(0.5) * exp(-dpx / 14.0) * 0.22) * uIF;
  return col;
}

/* how much of the trapped light reaches a point of the glass */
vec3 glassGlow(vec3 p){
  vec3 po = (uPoE + uPoM) * 0.5;
  float d1 = segPt(p, uPin, po), d2 = segPt(p, uIrA, uIrB);
  vec3 c = uWarm * (exp(-d1 / 0.1) * 0.6 + exp(-d1 / 0.35) * 0.06 + exp(-d2 / 0.2) * 0.4 * uIrI) * uIG;
  c += uCoreCol * exp(-length(p - uPin) / 0.1) * 0.6 * uIG;
  c += spectrum(0.5) * exp(-length(p - po) / 0.14) * 0.45 * uIF;
  return c;
}
/* the edges gather the trapped light (it leaves where the surface turns): brightest near the beam */
vec3 edgeLight(vec3 p){
  vec3 po = (uPoE + uPoM) * 0.5;
  float d1 = segPt(p, uPin, po);
  vec3 c = uWarm * (exp(-d1 / 0.12) * 2.2 + exp(-d1 / 0.4) * 0.5) * uIG;
  c += mix(uCoreCol, spectrum(0.5), 0.5) * exp(-length(p - po) / 0.15) * 1.2 * uIF;
  return c;
}

/* a dim studio, only so the glass has something to mirror (no second light) */
vec3 env(vec3 rd){
  return vec3(0.030, 0.028, 0.027) * (0.35 + smoothstep(-0.15, 0.7, rd.y)) * uEnv;
}

/* ---------- floor ---------- */
vec3 floorLight(vec3 p, vec3 rd){
  vec3 col = vec3(0.0);
  // the fan lands: each colour's bundle meets the floor along a soft footprint, the satin spreads it a little more
  float r2;
  vec3 c2 = fanCol(p.xz, uPoolSoft * 2.4, r2);
  vec3 cl = coneLight(p);
  bool inLight = c2.r + c2.g + c2.b > 1e-5 || cl.r + cl.g + cl.b > 1e-5;
  float vis1 = inLight ? shadowVis(p) : 1.0;
  // the spectrum's shadows part into colour at their edges
  vec3 vis = inLight && uSpecW > 0.01 ? mix(vec3(vis1), shadowVisRGB(p, 5.0), uSpecW) : vec3(vis1);
  if (c2.r + c2.g + c2.b > 1e-5) {
    float r;
    vec3 c = fanCol(p.xz, uPoolSoft, r);
    float ys = uFanO.y - uFanM * r;
    float th = 0.04 + uPoolTh * r;
    float land = exp(-(ys * ys) / (th * th));
    float under = exp(-max(ys, 0.0) / 0.12) * smoothstep(-0.05, 0.02, ys);
    float th2 = th * 2.6 + 0.05;
    float halo = exp(-(ys * ys) / (th2 * th2));
    vec2 v = (p.xz - uFanO.xz) / r;
    vec3 Rf = normalize(vec3(v.x, uFanM, v.y));
    float lobe = pow(max(dot(Rf, -rd), 0.0), 2.0);
    float sm = smokeLite(vec2(r * 2.0 + 3.0, (p.x - p.z) * 2.5));
    // and the haze just above the field glows with it
    float r3;
    vec3 c3 = fanCol(p.xz, uPoolSoft * 4.5, r3);
    float th3 = th * 5.0 + 0.15;
    float bloom = exp(-(ys * ys) / (th3 * th3));
    // (Motion's projector: the picture is the light there, so the plain landing gives way to it)
    col += (c * (land * (0.6 + 1.4 * lobe) + under * 0.05) + c2 * halo * 0.26 + c3 * bloom * 0.1) * mix(0.75, 1.15, sm) * uIP * uLandGain * vis * gobo(p) * (1.0 - uProjW);
  }
  // the light spreading over the floor beyond the glass (our light wide, the spectrum faintly), cut by the objects'
  // shadows; the satin breaks it up a little
  // Motion: the light is a projector's: our work lies on the floor where the light falls, true to its own colours (a
  // touch held back), shaped by the light itself (no frame edge anywhere), the floor showing through by about a tenth
  float pin = 0.0;
  if (uProjW > 0.001 && cl.r + cl.g + cl.b > 1e-5) {
    vec2 q = p.xz - uProjC;
    float det = uProjU.x * uProjV.y - uProjU.y * uProjV.x;
    vec2 ab = vec2(q.x * uProjV.y - q.y * uProjV.x, uProjU.x * q.y - uProjU.y * q.x) / det;
    // the picture is carried by the light itself, like a slide in a projector: as bright as the light is there (full
    // where the beam opens, thinning out with it), softened at the sides and dying away toward the far end
    vec2 fe = vec2(smoothstep(1.0, 0.25, ab.x) * smoothstep(-1.0, -0.6, ab.x), smoothstep(1.0, 0.45, abs(ab.y)));
    float lit = smoothstep(0.0, 0.42, length(cl) / max(uLGain, 1e-3));
    pin = fe.x * fe.y * lit;
    if (pin > 0.001) {
      vec2 uv = clamp(vec2(0.5 + ab.x * 0.5 * uProjCrop.x, 0.5 + ab.y * 0.5 * uProjCrop.y), 0.0, 1.0);
      vec3 d = texture2D(uProj, uv).rgb * 0.86 * pin;
      // what the floor must hold so the screen shows the video as it is (the inverse of the final filmic curve)
      vec3 pre = -log(max(vec3(1.0) - d, vec3(0.02))) / (1.4 * max(uGain, 1e-3));
      col += pre * 0.9 * uProjW * vis;
    }
  }
  if (cl.r + cl.g + cl.b > 1e-5) {
    float sm = smokeLite(vec2(length(p.xz - uLO.xz) * 2.0, atan(p.z - uLO.z, p.x - uLO.x) * 3.0));
    col += cl * vis * mix(0.8, 1.15, sm) * mix(0.32, 0.34, uSpecW) * uIP * mix(1.0, 1.0 - 0.9 * pin, uProjW);
  }
  // a soft warm sheen under the beam, and the glass's own glow around its foot
  vec3 a = vec3(uBA.x, 0.0, uBA.z), b = vec3(uPin.x, 0.0, uPin.z);
  vec3 ab = b - a;
  float u = clamp(dot(vec3(p.x, 0.0, p.z) - a, ab) / dot(ab, ab), 0.0, 1.0);
  float dh = length(vec3(p.x, 0.0, p.z) - a - ab * u);
  float hb = mix(uBA.y, uPin.y, u);
  col += uWarm * exp(-dh / (0.08 + hb * 0.3)) * exp(-hb / 0.35) * smoothstep(0.1, 0.8, u) * 0.12 * uIB;
  float fd = max(footD(p.xz), 0.0);
  col += mix(uWarm, spectrum(0.4), 0.35) * exp(-fd / 0.12) * 0.05 * uIG;
  return col;
}

/* the prism as the floor mirrors it (no refraction, soft) */
vec3 prismMirror(vec3 ro, vec3 rd){
  vec2 h = prismHit(ro, rd);
  if (h.x >= h.y || h.y <= 0.0) return vec3(0.0);
  vec3 p = ro + rd * h.x;
  float e;
  prismN(p, e);
  float tx = h.y - h.x;
  // a light frost on the glass: the satin floor mirrors it as a soft glow, not a second sharp prism
  return lightsGlass(p, rd, tx, 3.0) * exp(-uTint * tx) * 0.16 + glassGlow(p) * (0.05 + e * 0.5);
}

/* ---------- glass, seen ---------- */
vec3 beyond(vec3 ro, vec3 rd, float tc){
  float tFl = rd.y < -1e-4 ? -ro.y / rd.y : 1e4;
  vec3 col = lightsAir(ro, rd, 0.0, min(tFl, 8.0), tc, 1.0, 1.0) + fanAir(ro, rd, 0.0, tFl, 1.0, 1.0);
  if (tFl < 1e3) col += floorLight(ro + rd * tFl, rd) + vec3(0.024);
  else col += env(rd);
  return col;
}

vec3 glassView(vec3 ro, vec3 rd, float tN, float tc){
  vec3 p = ro + rd * tN;
  float e;
  vec3 n = prismN(p, e);
  float ci = clamp(-dot(rd, n), 0.0, 1.0);
  float F = 0.04 + 0.96 * pow(1.0 - ci, 5.0);
  vec3 rr = reflect(rd, n);
  vec3 refl = env(rr) + lightsAir(p + n * 1e-3, rr, 0.0, 6.0, tc + tN, 1.0, 1.0) + fanAir(p, rr, 0.0, 6.0, 1.0, 1.0);
  vec3 tr = vec3(0.0), ghost = vec3(0.0);
  for (int c = 0; c < 3; c++) {
    float eta = c == 0 ? uEta.x : (c == 1 ? uEta.y : uEta.z);
    vec3 td = refract(rd, n, 1.0 / eta);
    float tx = prismExit(p + td * 1e-4, td) + 1e-4;
    vec3 q = p + td * tx;
    float e2;
    vec3 n2 = prismN(q, e2);
    vec3 inner = lightsGlass(p, td, tx, tc + tN);
    vec3 od = refract(td, -n2, eta);
    vec3 back;
    if (dot(od, od) < 1e-6) {
      // trapped: one more bounce inside, then out
      vec3 r2 = reflect(td, n2);
      float tx2 = prismExit(q + r2 * 1e-4, r2) + 1e-4;
      vec3 q2 = q + r2 * tx2;
      inner += lightsGlass(q, r2, tx2, tc + tN + tx);
      float e3;
      vec3 n3 = prismN(q2, e3);
      vec3 od2 = refract(r2, -n3, eta);
      back = dot(od2, od2) < 1e-6 ? env(r2) : beyond(q2, od2, tc + tN + tx + tx2);
      back *= exp(-uTint * tx2);
      back += edgeLight(q2) * e3 * 0.7;
    } else {
      back = beyond(q, od, tc + tN + tx);
      if (c == 1) {
        // a faint internal reflection: the far face also mirrors the light inside the glass back at us
        float cx = clamp(dot(td, n2), 0.0, 1.0);
        float Fi = 0.04 + 0.96 * pow(1.0 - cx, 5.0);
        vec3 r2 = reflect(td, n2);
        float tx2 = prismExit(q + r2 * 1e-4, r2) + 1e-4;
        ghost = lightsGlass(q, r2, tx2, tc + tN + tx) * Fi * exp(-uTint * (tx + tx2)) * 1.6;
      }
    }
    back += glassGlow(q) * 0.02 + edgeLight(q) * e2 * 0.7;
    vec3 v = (back + inner) * exp(-uTint * tx);
    if (c == 0) tr.r = v.r; else if (c == 1) tr.g = v.g; else tr.b = v.b;
  }
  // a very light frost: the surface mirrors a little less sharply, and a milky veil of the light held inside lifts it
  vec3 col = refl * F * uIForm * (1.0 - 0.45 * uFrost) + (tr + ghost) * (1.0 - F) * (1.0 - 0.18 * uFrost);
  col += (glassGlow(p) * 0.12 + uWarm * 0.006) * uFrost * uIForm;
  // the rounded edges catch the light trapped in the glass, and the room's faint sheen
  col += glassGlow(p) * 0.025 + edgeLight(p) * e;
  col += (env(rr) * 1.5 + uWarm * 0.02) * e * uIForm;
  return col;
}

void main(){
  vec2 frag = gl_FragCoord.xy;
  vec2 sc = (frag - 0.5 * uRes) / (0.5 * uRes.y) - uShift;
  vec3 ro = uCamPos;
  vec3 rd = normalize(uCamF * uFocal + uCamR * sc.x + uCamU * sc.y);

  float tFl = rd.y < -1e-4 ? -ro.y / rd.y : 1e4;
  vec3 pf = ro + rd * tFl;

  // the room: haze, then the satin floor (it mirrors softly and fades into the dark)
  vec3 bg = lightsAir(ro, rd, 0.0, min(tFl, 40.0), 0.0, 1.0, 0.0) + fanAir(ro, rd, 0.0, tFl, 1.0, 0.0) + coneAir(ro, rd, min(tFl, 40.0));
  if (tFl < 1e3) {
    vec3 fl = vec3(0.029, 0.029, 0.033) + floorLight(pf, rd);
    vec3 rr = reflect(rd, vec3(0.0, 1.0, 0.0));
    float Ff = 0.04 + 0.96 * pow(1.0 - clamp(-rd.y, 0.0, 1.0), 5.0);
    vec3 refl = lightsAir(pf, rr, 0.0, 8.0, tFl, 12.0, 1.0) * 0.5 + fanAir(pf, rr, 0.0, 8.0, 2.6, 1.0) * uFanRefl + env(rr) + prismMirror(pf, rr);
    fl += refl * Ff * 0.85;
    fl *= mix(mix(1.0, 0.45, uIForm), 1.0, smoothstep(0.0, 0.16, footD(pf.xz)));
    fl *= exp(-max(length(pf.xz - uFanO.xz) - 2.2, 0.0) * 0.45);
    bg += fl;
  } else bg += env(rd);

  vec3 col = bg;
  // the glass, anti-aliased along its silhouette (derivatives taken outside any branch)
  vec2 h = prismHit(ro, rd);
  float g = h.x - h.y;
#ifdef DERIV
  float cov = clamp(0.5 - g / max(fwidth(g), 1e-5), 0.0, 1.0);
#else
  float cov = g < 0.0 ? 1.0 : 0.0;
#endif
  if (h.x >= tFl) cov = 0.0;
  if (cov > 0.0 && h.y > 0.0) {
    float tN = max(h.x, 0.0);
    vec3 gc = lightsAir(ro, rd, 0.0, tN, 0.0, 1.0, 0.0) + fanAir(ro, rd, 0.0, tN, 1.0, 0.0) + glassView(ro, rd, tN, 0.0);
    // light first: the glass itself comes forward just after it (uIForm)
    col = mix(bg, gc, cov * (0.25 + 0.75 * uIForm));
  }

  // nothing crosses the hairline under the section's head
  col *= 1.0 - smoothstep(uTopY - uTopSoft, uTopY, frag.y);
  // the cover's grade: breathing very slowly, filmic shoulder, static grain (a touch more in the light), vignette
  col *= (0.985 + 0.015 * sin(uTime * 0.31)) * uGain;
  col = vec3(1.0) - exp(-col * 1.4);
  float gr = (hash(frag) + hash(frag + 71.3) - 1.0) * 0.5;
  col += gr * (uGrain + dot(col, vec3(0.3, 0.5, 0.2)) * 0.07);
  vec2 q = frag / uRes - 0.5;
  col *= 1.0 - dot(q, q) * 0.45;
  gl_FragColor = vec4(max(col, 0.0), 1.0);
}`;
