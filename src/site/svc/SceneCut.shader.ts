/* SceneCut — "light makes the form".
   The cover's arc, built for real: a thin slit of 3500 K light cut into a satin-black floor, curving round behind and
   under a glossy black ceramic object (a half ring around it; from the camera it reads as the cover's ∩ arc, with the
   cover's bloom and its haze rising behind the object). Nothing else lights the object: every highlight on it is that
   slit's own reflection (clear coat + satin sheen) or its glow, so the form exists only where the light reaches it.
   The floor mirrors the haze and the object, softly.
   World: floor y = 0, slit = circle of radius RR round the origin (only its far half is lit), object above the origin.
   One pass; the background is analytic; the object is ray-marched only inside its bounding sphere. */

export const CUT_VERT = `#version 300 es
in vec2 a;
void main(){ gl_Position = vec4(a, 0.0, 1.0); }`;

export const CUT_FRAG = `#version 300 es
precision highp float;
out vec4 fragColor;

uniform vec2 uRes;        // canvas, device px
uniform float uCore;      // line core, device px (cover: 1.2 * dpr)
uniform float uTime;      // s, haze drift only
uniform vec3 uCam;
uniform mat3 uCamM;       // columns: right, up, forward
uniform float uF;         // focal length, frame heights
uniform vec2 uShift;      // lens shift, frame heights
uniform vec3 uArc;        // lit part of the slit: left end, right end, hot spot (azimuths, rad; 0 = straight behind)
uniform vec4 uIgn;        // light, opening, form, haze
uniform float uGrain;
uniform float uSoft;      // 0 desk, 1 phone (softer)
uniform vec3 uWarm, uCoreCol;
uniform mat3 uR;         // world -> local
uniform vec4 uB;          // half extents xyz, corner radius
uniform vec2 uE;          // edge radius, lens amount
uniform vec4 uObj;        // centre, bounding radius

const float RR = 1.55;            // radius of the slit round the object
const float SLIT = 0.006;         // slit thickness (world): what the object sees
const float FLOOR_GLOSS = 0.5;
const float FLOOR_BLUR = 0.014;
// how the object sees the light: the slit's true radiance is far above what the display shows of it (its core is
// tone-mapped to near white), and its haze is a real volume of lit air close behind the object
const float G_HAZE = 7.0, G_CORE = 24.0, G_HEIGHT = 2.4, G_SATIN = 3.5;

float hash(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float vnoise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash(i), b = hash(i + vec2(1.0, 0.0)), c = hash(i + vec2(0.0, 1.0)), d = hash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
float fbm(vec2 p){ float v = 0.0, a = 0.5; for (int i = 0; i < 4; i++) { v += a * vnoise(p); p = p * 2.03 + vec2(1.7, 9.2); a *= 0.5; } return v; }
float smax(float a, float b, float k){ float h = clamp(0.5 + 0.5 * (a - b) / k, 0.0, 1.0); return mix(b, a, h) + k * h * (1.0 - h); }
float fres(float c){ float m = 1.0 - clamp(c, 0.0, 1.0); float m2 = m * m; return 0.05 + 0.95 * m2 * m2 * m; }

/* ---------- the form ---------- */
// rounded rect (local XY, corner rc) extruded along local Z, edges rounded by re; front = -Z.
// lens > 0 adds a lens front: a groove ring, a recessed step and a glass dome.
float sdShape(vec3 p, mat3 R, vec4 B, vec2 E){
  vec3 q = R * p;
  float rc = B.w, re = E.x;
  vec2 a = abs(q.xy) - B.xy + rc;
  float d2 = length(max(a, 0.0)) + min(max(a.x, a.y), 0.0) - rc;
  vec2 w = vec2(d2 + re, abs(q.z) - B.z + re);
  float d = length(max(w, 0.0)) + min(max(w.x, w.y), 0.0) - re;
  if (E.y > 0.002) {
    float r = length(q.xy);
    float zf = -B.z;
    float rIn = B.x * 0.68;
    float dep = 0.05 * E.y;
    float rec = max(r - rIn, q.z - (zf + dep));
    d = smax(d, -rec, 0.014);
    float h = 0.06 * E.y;
    float rD = rIn - 0.03;
    float Rs = (rD * rD + h * h) / (2.0 * h);
    float zc = zf + dep - h + Rs;
    float dome = max(max(length(q - vec3(0.0, 0.0, zc)) - Rs, q.z - (zf + dep + 0.005)), r - rD);
    d = min(d, dome);
    float g = length(vec2(r - B.x * 0.85, q.z - zf)) - 0.014 * E.y;
    d = smax(d, -g, 0.008);
  }
  return d;
}

float map(vec3 p){ return sdShape(p - uObj.xyz, uR, uB, uE); }

vec3 nrm(vec3 p){
  const vec2 k = vec2(1.0, -1.0);
  const float e = 0.0007;
  return normalize(k.xyy * map(p + k.xyy * e) + k.yyx * map(p + k.yyx * e) + k.yxy * map(p + k.yxy * e) + k.xxx * map(p + k.xxx * e));
}

// sphere-trace inside the bounding sphere; returns coverage (1 = hit, soft fringe within the cone) and the closest point
float trace(vec3 ro, vec3 rd, float cone, out float tc){
  tc = -1.0;
  vec3 oc = ro - uObj.xyz;
  float b = dot(oc, rd);
  float c = dot(oc, oc) - uObj.w * uObj.w;
  float disc = b * b - c;
  if (disc < 0.0) return 0.0;
  float s = sqrt(disc);
  float t = max(-b - s, 0.0), t1 = -b + s;
  if (t1 <= 0.0) return 0.0;
  float kmin = 1e9;
  bool exited = false;
  for (int i = 0; i < 96; i++) {
    float d = map(ro + rd * t);
    float k = d / (cone * max(t, 0.05));
    if (k < kmin) { kmin = k; tc = t; }
    if (d < 0.00025 * t + 0.0001) { kmin = 0.0; tc = t; break; }
    t += max(d * 0.9, 0.0008);
    if (t > t1) { exited = true; break; }
  }
  if (!exited) { kmin = 0.0; tc = t; }        // still inside a narrow recess when the steps ran out: count it as a hit
  return tc < 0.0 ? 0.0 : 1.0 - smoothstep(0.0, 1.0, kmin);
}

/* ---------- the light: the slit ---------- */
// where a ray leaves the slit's cylinder (far side): (distance, height there, azimuth, valid)
vec4 rimHit(vec3 o, vec3 d){
  vec2 dx = d.xz;
  float a = max(dot(dx, dx), 1e-7);
  float b = dot(o.xz, dx);
  float c = dot(o.xz, o.xz) - RR * RR;
  float disc = b * b - a * c;
  float t = (-b + sqrt(max(disc, 0.0))) / a;
  vec3 X = o + d * t;
  return vec4(t, X.y, atan(X.x, X.z), step(0.0, disc) * step(0.0, t));
}

// along the slit: lit over the far half, the left end fading before the type, the cover's gaussian hot spot riding on it;
// on ignite the light opens out from the hot spot
vec2 arcProf(float phi){
  float ax = (phi - uArc.z) / 0.7;
  float lit = smoothstep(uArc.x, uArc.x + 0.42, phi) * (1.0 - smoothstep(uArc.y - 0.35, uArc.y, phi));
  float open = 1.0 - smoothstep(0.1 + 1.4 * uIgn.y, 0.4 + 3.6 * uIgn.y, abs(ax));
  float prof = (0.3 + 0.7 * exp(-ax * ax * 1.35)) * lit * open;
  float hprof = (0.16 + 0.84 * exp(-ax * ax * 2.2)) * lit * open;
  return vec2(prof, hprof);
}

// the slit as seen along a ray from a point in the scene (object or floor), blurred by 'blur' (rad), energy kept
vec3 rimLight(vec3 o, vec3 d, float blur){
  vec4 h = rimHit(o, d);
  vec2 pr = arcProf(h.z) * h.w;
  if (pr.x + pr.y < 1e-4) return vec3(0.0);
  float t = max(h.x, 1e-3), y = h.y;
  float ang = y / t;
  float cA = SLIT / t;
  float cw = sqrt(cA * cA + blur * blur);
  float core = exp(-ang * ang / (cw * cw)) * (cA / cw);
  float nA = 0.028 / t, wA = 0.12 / t;
  float bN = exp(-abs(ang) / (nA + blur)) * nA / (nA + blur);
  float bW = exp(-abs(ang) / (wA + blur)) * wA / (wA + blur);
  float yh = max(y, 0.0);
  float hz = exp(-yh / (0.32 * G_HEIGHT)) * smoothstep(-0.01, 0.02, y) * 0.85 + exp(-yh / (0.83 * G_HEIGHT)) * smoothstep(0.0, 0.06, y) * 0.16;
  vec3 col = uWarm * hz * 0.32 * uIgn.w * pr.y * G_HAZE;
  col += uWarm * (bN * 0.55 + bW * 0.12) * pr.x * G_CORE * 0.25;
  col += uCoreCol * core * pr.x * 1.6 * G_CORE;
  return col * uIgn.x;
}

// what a reflected ray meets besides the object: the glossy floor in front of the slit (it mirrors the slit) or the slit
vec3 env(vec3 o, vec3 d, float blur){
  vec3 direct = rimLight(o, d, blur);
  if (d.y < 0.0) {
    float t = -o.y / d.y;
    vec3 h = o + d * t;
    float rh = length(h.xz);
    float w = 1.0 - smoothstep(RR - 0.12, RR + 0.02, rh);   // the floor ends at the slit: hand over softly
    if (w > 0.0) {
      vec3 fl = fres(-d.y) * FLOOR_GLOSS * rimLight(h, vec3(d.x, -d.y, d.z), blur + FLOOR_BLUR);
      // the satin floor is lit just in front of the slit (the cover's sheen under the rim)
      fl += uWarm * 0.5 * exp(-max(RR - rh, 0.0) / 0.1) * arcProf(atan(h.x, h.z)).x * uIgn.x;
      return mix(direct, fl, w);
    }
  }
  return direct;
}

// glossy black ceramic: a clear coat that mirrors the slit, a satin base that holds a soft sheen of it
vec3 shade(vec3 p, vec3 n, vec3 rd, float blur){
  float c = -dot(n, rd);
  if (c < 0.0) { n = normalize(n + rd * c * 1.02); c = -dot(n, rd); }   // near-miss fringe: keep the normal facing us
  vec3 r = reflect(rd, n);
  float F = fres(c);
  vec3 o = p + n * 0.004;
  vec3 sharp = env(o, r, blur + 0.0012 * (1.0 + 2.5 * uSoft));
  vec3 satin = env(o, r, 0.16 + blur);
  vec3 col = vec3(0.0042, 0.0041, 0.0044);
  col += F * sharp + satin * (0.10 + 0.6 * F) * G_SATIN;
  // the slit also lights the satin base a little (strongest low down, facing the hot part)
  vec3 lp = vec3(RR * sin(uArc.z), 0.02, RR * cos(uArc.z)) - p;
  float ld = length(lp);
  col += uWarm * 0.03 * max(dot(n, lp / ld), 0.0) / (0.6 + ld * ld) * uIgn.x;
  return col;
}

void main(){
  vec2 uv = gl_FragCoord.xy / uRes;
  float aspect = uRes.x / uRes.y;
  vec2 sp = (uv - 0.5) * vec2(aspect, 1.0) - uShift;
  vec3 ro = uCam;
  vec3 rd = normalize(uCamM * vec3(sp, uF));
  float pxd = 1.0 / uRes.y;                 // one device px, frame heights
  float pxA = pxd / uF;                     // ... in radians

  /* --- the arc: exactly the cover's light, measured from the slit's far side --- */
  vec4 h = rimHit(ro, rd);
  float dd = h.y / max(h.x, 1e-3) * uF;     // signed offset from the line, frame heights (> 0 above)
  vec2 pr = arcProf(h.z) * h.w;
  float above = h.w > 0.5 ? clamp(dd / pxd + 0.5, 0.0, 1.0) : step(0.0, rd.y);
  float I = uIgn.x;
  float dc = dd / (uCore * pxd);
  float core = exp(-dc * dc);
  float bloomN = exp(-abs(dd) / (6.0 * pxd));
  float bloomW = exp(-abs(dd) / (26.0 * pxd));
  float occl = mix(0.12, 1.0, above);
  float tt = uTime * 0.035;
  float du = max(dd, 0.0);
  float hz = 0.0;
  if (pr.y > 0.001 && dd > -0.002 && du < 1.1) {           // the smoke only where there is haze to break up
    float smoke = fbm(vec2(h.z * 2.6 + tt, du * 5.5 - tt * 1.6));
    float smoke2 = fbm(vec2(h.z * 5.6 - tt * 1.3, du * 11.0 + 3.0));
    float rise = exp(-du / 0.085) * smoothstep(-0.002, 0.012, dd);
    float riseW = exp(-du / 0.22) * smoothstep(0.0, 0.05, dd);
    hz = rise * mix(0.45, 1.25, smoke) + riseW * 0.22 * mix(0.3, 1.2, smoke2);
  }

  vec3 col = vec3(0.034, 0.034, 0.039);
  // the floor: as dark as the cover's dome in front of the slit, dissolving back into the void beyond it
  float fl = 0.0;
  vec3 fp = vec3(0.0);
  if (rd.y < 0.0) {
    float tf = -ro.y / rd.y;
    fp = ro + rd * tf;
    float depth = dot(fp - ro, uCamM[2]) - (length(uObj.xz - ro.xz) + RR);   // past the slit's far side
    fl = 1.0 - smoothstep(-0.2, 1.6, depth);
    col *= mix(1.0, 0.72, fl);
  }
  vec3 unlit = col;                         // the dark before the light: an unlit object is indistinguishable from it
  float inside = fl * (1.0 - above);
  col += vec3(0.05, 0.044, 0.038) * inside * exp(dd / 0.018) * pr.x * I;
  col += uWarm * hz * 0.32 * uIgn.w * pr.y * I;
  vec3 glow = uWarm * (bloomN * 0.55 + bloomW * 0.12) * pr.x * I;
  col += glow * occl;
  col += uCoreCol * core * pr.x * I * 1.6;

  /* --- the floor mirrors the slit's glow and the object, softly --- */
  if (inside > 0.0) {
    vec3 rr = vec3(rd.x, -rd.y, rd.z);
    vec3 refl = rimLight(fp, rr, FLOOR_BLUR + 0.004 * uSoft);
    float tcf;
    float cv = trace(fp, rr, 0.05 + 0.03 * uSoft, tcf);
    if (cv > 0.001) {
      // the object in the floor: softer and fainter the further it is from the floor (satin, not a mirror)
      vec3 q = fp + rr * tcf;
      float fade = exp(-q.y * (2.0 + 1.2 * uSoft));
      refl = mix(refl, shade(q, nrm(q), rr, 0.03 + 0.08 * q.y) * uIgn.z, cv * fade);
    }
    col += fres(-rd.y) * FLOOR_GLOSS * refl * inside;
  }

  /* --- the object --- */
  float tc;
  float cov = trace(ro, rd, pxA * 1.2, tc);
  vec3 n = -rd, pc = ro;
  if (cov > 0.0) { pc = ro + rd * tc; n = nrm(pc); }
  vec3 rf = reflect(rd, n);
  float wAA = clamp(length(fwidth(rf)) * 0.6, 0.0, 0.04);     // pixel footprint of the reflection: no shimmering lines
  if (cov > 0.0) {
    vec3 base = vec3(0.0042, 0.0041, 0.0044);
    // before the light the form does not exist: it is only the thing that cuts the light; then its edges come
    vec3 oc = mix(unlit, base, uIgn.z) + (shade(pc, n, rd, wAA) - base) * uIgn.z;
    oc += glow * 0.16;                                         // the hidden line still blooms in the lens
    col = mix(col, oc, cov);
  }

  // filmic shoulder, static grain, vignette (the cover's)
  col = vec3(1.0) - exp(-col * 1.4);
  float g = (hash(gl_FragCoord.xy) + hash(gl_FragCoord.xy + 71.3) - 1.0) * 0.5;
  col += g * uGrain;
  vec2 qv = uv - 0.5;
  col *= 1.0 - dot(qv, qv) * 0.6;
  fragColor = vec4(max(col, 0.0), 1.0);
}`;
