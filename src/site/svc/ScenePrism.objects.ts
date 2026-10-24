/* The things the prism's light falls on: real meshes standing on the floor to the right of the glass, lit only by the
   light that leaves it (our warm 3500 K, or the AI spectrum) and casting their shadows across the floor and through the
   haze. Nothing else lights them: where the light does not reach, they stay in the dark.

   Per frame: (1) a shadow map from the light's origin (where it leaves the glass), linear distance packed in RGBA8;
   (2) the prism's own full-screen picture, which reads that map for the floor and the haze; (3) the objects mirrored
   in the satin floor, added faintly; (4) the objects. The light's shape — its wedge, its height, its fall-off, its
   colour — is one GLSL function both shaders share (CONE_GLSL), so the floor and the objects always agree. */

import { cross, dot, norm, sub, type V3 } from "./ScenePrism.optics";

export interface Mesh { pos: Float32Array; nrm: Float32Array; idx: Uint16Array }

/* ---------- the light, shared by the prism's shader and the objects' ---------- */
/** needs, from its host: `vec3 spectrum(float s)` (all colours fold into our warm light when the spectrum is off) */
export const CONE_GLSL = `
uniform vec3 uLO;            // where the light leaves the glass
uniform float uLSpec;        // how much the light is the AI spectrum
uniform float uLAE, uLAM;    // the bundle's first and last colour, as directions on the floor (rad)
uniform float uLWedge;       // how much wider than the bundle the light spreads (rad, each side)
uniform float uLGain;
uniform mat4 uLVP;           // the light's view-projection (its shadow map)
uniform sampler2D uShadow;
uniform float uShadowOn, uLFar, uShadowTx;
float unpackD(vec4 c){ return dot(c, vec4(1.0, 1.0 / 255.0, 1.0 / 65025.0, 1.0 / 16581375.0)); }
float wrapPi(float a){ return mod(a + 3.14159265, 6.2831853) - 3.14159265; }
/* the light's frame (Vertical): a portrait 9:16 frame in front of the light, like a projector's gate, so the light lands
   on the floor as an upright screen with rounded corners; a point is lit if its ray from the light lands inside.
   uGobo: how much of it (0 off); centre, half-axes (floor xz), corner radius and softness in frame units; uGoboOut: the
   light left outside the frame; uGoboAll: frame the air too (the prism's pass), or the floor alone (the things' pass) */
uniform float uGobo, uGoboR, uGoboSoft, uGoboOut, uGoboAll;
uniform vec2 uGoboC, uGoboU, uGoboV;
float gobo(vec3 p){
  // the things standing in the frame keep their light (only the floor and the air are framed)
  if (uGobo < 0.001 || (uGoboAll < 0.5 && p.y > 0.01)) return 1.0;
  vec3 d = p - uLO;
  if (d.y > -1e-4) return mix(1.0, uGoboOut, uGobo);
  vec2 q = uLO.xz + d.xz * (uLO.y / -d.y) - uGoboC;
  // into the frame's own units: solve q = a U + b V
  float det = uGoboU.x * uGoboV.y - uGoboU.y * uGoboV.x;
  vec2 ab = vec2(q.x * uGoboV.y - q.y * uGoboV.x, uGoboU.x * q.y - uGoboU.y * q.x) / det;
  vec2 e = abs(ab) - vec2(1.0) + uGoboR;
  float sdf = length(max(e, 0.0)) + min(max(e.x, e.y), 0.0) - uGoboR;
  float inside = 1.0 - smoothstep(-uGoboSoft, uGoboSoft, sdf);
  return mix(1.0, mix(uGoboOut, 1.0, inside), uGobo);
}
/* the light that reaches p: its colour across the bundle, the wedge, the cone's height, the distance */
vec3 coneLight(vec3 p){
  vec3 v = p - uLO;
  float r = length(v.xz);
  float a = atan(v.z, v.x);
  float da = wrapPi(uLAM - uLAE);
  float am = uLAE + 0.5 * da;
  float hw = 0.5 * abs(da) + uLWedge;
  float A = smoothstep(hw, hw * 0.35, abs(wrapPi(a - am)));
  float el = atan(v.y, max(r, 1e-3));
  float E = smoothstep(-0.66, -0.34, el) * smoothstep(0.85, 0.5, el);
  // the spectrum (AI) leaves the glass dark and gathers light as it opens; our light is there at once
  float near = mix(smoothstep(0.1, 0.5, r), smoothstep(0.12, 1.15, r), uLSpec);
  float fall = 1.0 / (1.0 + r * r * 0.26);
  float s = wrapPi(a - uLAE) / (abs(da) < 1e-3 ? 1e-3 : da);
  near *= gobo(p);
  // and the further its colours travel apart, the purer each gets
  vec3 c = spectrum(s);
  c = max(mix(vec3(dot(c, vec3(0.3, 0.5, 0.2))), c, 1.0 + 1.3 * uLSpec * smoothstep(0.5, 2.0, r)), 0.0);
  return c * A * E * near * fall * uLGain;
}
/* one comparison against the shadow map, interpolated between its four nearest texels (no stair-steps) */
float shadowTap(vec2 uv, float d){
  vec2 t = uv / uShadowTx - 0.5;
  vec2 f = fract(t), b = (floor(t) + 0.5) * uShadowTx;
  float a = step(d, unpackD(texture2D(uShadow, b)));
  float c = step(d, unpackD(texture2D(uShadow, b + vec2(uShadowTx, 0.0))));
  float e = step(d, unpackD(texture2D(uShadow, b + vec2(0.0, uShadowTx))));
  float g = step(d, unpackD(texture2D(uShadow, b + vec2(uShadowTx))));
  return mix(mix(a, c, f.x), mix(e, g, f.x), f.y);
}
vec3 shadowUV(vec3 p){
  vec4 q = uLVP * vec4(p, 1.0);
  if (q.w <= 1e-4) return vec3(-1.0);
  vec2 uv = q.xy / q.w * 0.5 + 0.5;
  if (uv.x <= 0.0 || uv.x >= 1.0 || uv.y <= 0.0 || uv.y >= 1.0) return vec3(-1.0);
  return vec3(uv, length(p - uLO) / uLFar - 0.004);
}
/* how much of the light gets past the objects to p: soft-edged (an interpolated tap and four around it) */
float shadowVis(vec3 p){
  if (uShadowOn < 0.5) return 1.0;
  vec3 s = shadowUV(p);
  if (s.x < 0.0) return 1.0;
  float o = uShadowTx * 1.5;
  float v = shadowTap(s.xy, s.z) * 4.0;
  v += step(s.z, unpackD(texture2D(uShadow, s.xy + vec2(o, o))));
  v += step(s.z, unpackD(texture2D(uShadow, s.xy + vec2(-o, o))));
  v += step(s.z, unpackD(texture2D(uShadow, s.xy + vec2(o, -o))));
  v += step(s.z, unpackD(texture2D(uShadow, s.xy + vec2(-o, -o))));
  return v / 8.0;
}
/* the spectrum's shadows: each colour leaves the glass a little further along the fan, so the edges of a shadow
   split into colour; three interpolated taps across the light's width, one per channel */
vec3 shadowVisRGB(vec3 p, float spread){
  if (uShadowOn < 0.5) return vec3(1.0);
  vec3 s = shadowUV(p);
  if (s.x < 0.0) return vec3(1.0);
  vec2 o = vec2(uShadowTx * spread, 0.0);
  return vec3(shadowTap(s.xy - o, s.z), shadowTap(s.xy, s.z), shadowTap(s.xy + o, s.z));
}
/* the same, one tap (for the haze, where many are taken along a ray) */
float shadowVis1(vec3 p){
  if (uShadowOn < 0.5) return 1.0;
  vec3 s = shadowUV(p);
  if (s.x < 0.0) return 1.0;
  return step(s.z, unpackD(texture2D(uShadow, s.xy)));
}
`;

/* ---------- meshes ---------- */
/** a ring with an elliptical section: radius R, half-width a (radial), half-height b; axis = y */
export function ring(R: number, a: number, b: number, nu = 160, nv = 28): Mesh {
  const pos: number[] = [], nrm: number[] = [], idx: number[] = [];
  for (let i = 0; i <= nu; i++) {
    const u = (i / nu) * Math.PI * 2, cu = Math.cos(u), su = Math.sin(u);
    for (let j = 0; j <= nv; j++) {
      const v = (j / nv) * Math.PI * 2, cv = Math.cos(v), sv = Math.sin(v);
      const rr = R + a * cv;
      pos.push(rr * cu, b * sv, rr * su);
      const n = norm([(cv / a) * cu, sv / b, (cv / a) * su]);
      nrm.push(n[0], n[1], n[2]);
    }
  }
  for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) {
    const k = i * (nv + 1) + j, k2 = k + nv + 1;
    idx.push(k, k2, k + 1, k + 1, k2, k2 + 1);
  }
  return { pos: new Float32Array(pos), nrm: new Float32Array(nrm), idx: new Uint16Array(idx) };
}
/** a disc with a fully rounded rim (a puck): radius R, thickness t; axis = y */
export function puck(R: number, t: number, nu = 128, nv = 24): Mesh {
  // the profile, from the top centre round the rim to the bottom centre: (radius, height, normal r, normal y)
  const prof: [number, number, number, number][] = [];
  const h = t / 2, rr = R - h;
  for (let j = 0; j <= 6; j++) prof.push([(rr * j) / 6, h, 0, 1]);
  for (let j = 1; j < nv; j++) { const a = Math.PI / 2 - (j / nv) * Math.PI; prof.push([rr + h * Math.cos(a), h * Math.sin(a), Math.cos(a), Math.sin(a)]); }
  for (let j = 6; j >= 0; j--) prof.push([(rr * j) / 6, -h, 0, -1]);
  const pos: number[] = [], nrm: number[] = [], idx: number[] = [];
  const np = prof.length;
  for (let i = 0; i <= nu; i++) {
    const u = (i / nu) * Math.PI * 2, cu = Math.cos(u), su = Math.sin(u);
    for (const [r, y, nr, ny] of prof) { pos.push(r * cu, y, r * su); nrm.push(nr * cu, ny, nr * su); }
  }
  for (let i = 0; i < nu; i++) for (let j = 0; j < np - 1; j++) {
    const k = i * np + j, k2 = k + np;
    idx.push(k, k2, k + 1, k + 1, k2, k2 + 1);
  }
  return { pos: new Float32Array(pos), nrm: new Float32Array(nrm), idx: new Uint16Array(idx) };
}
export function sphere(r: number, nu = 96, nv = 48): Mesh {
  const pos: number[] = [], nrm: number[] = [], idx: number[] = [];
  for (let j = 0; j <= nv; j++) {
    const v = (j / nv) * Math.PI, sv = Math.sin(v), cv = Math.cos(v);
    for (let i = 0; i <= nu; i++) {
      const u = (i / nu) * Math.PI * 2;
      const n: V3 = [sv * Math.cos(u), cv, sv * Math.sin(u)];
      pos.push(n[0] * r, n[1] * r, n[2] * r); nrm.push(n[0], n[1], n[2]);
    }
  }
  for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
    const k = j * (nu + 1) + i, k2 = k + nu + 1;
    idx.push(k, k2, k + 1, k + 1, k2, k2 + 1);
  }
  return { pos: new Float32Array(pos), nrm: new Float32Array(nrm), idx: new Uint16Array(idx) };
}

/** a packed mesh: "PMSH", u32 vertex count, u32 index count, f32 scale, then int16 xyz (+pad), int8 normals xyz
 *  (+pad), u16 indices. Units: the mesh stands on y = 0, 1 = its height. */
export async function loadMesh(url: string): Promise<Mesh> {
  const buf = await (await fetch(url)).arrayBuffer();
  const dv = new DataView(buf);
  if (dv.getUint32(0, true) !== 0x48534d50) throw new Error("not a packed mesh");
  const nV = dv.getUint32(4, true), nI = dv.getUint32(8, true), sc = dv.getFloat32(12, true);
  let o = 16;
  const qp = new Int16Array(buf, o, nV * 4); o += nV * 8;
  const qn = new Int8Array(buf, o, nV * 4); o += nV * 4;
  const idx = new Uint16Array(buf, o, nI);
  const pos = new Float32Array(nV * 3), nrm = new Float32Array(nV * 3);
  for (let i = 0; i < nV; i++) {
    for (let c = 0; c < 3; c++) { pos[i * 3 + c] = (qp[i * 4 + c] / 32767) * sc; nrm[i * 3 + c] = qn[i * 4 + c] / 127; }
  }
  return { pos, nrm, idx };
}

/* ---------- matrices (column-major, as WebGL takes them) ---------- */
export type M4 = Float32Array;
export function m4(): M4 { const m = new Float32Array(16); m[0] = m[5] = m[10] = m[15] = 1; return m; }
export function mul4(a: M4, b: M4): M4 {
  const o = new Float32Array(16);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
    let s = 0;
    for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k];
    o[c * 4 + r] = s;
  }
  return o;
}
/** translate · rotY(yaw) · rotX(pitch) · rotZ(roll) · scale */
export function model(t: V3, yaw: number, pitch = 0, roll = 0, s = 1): M4 {
  const cy = Math.cos(yaw), sy = Math.sin(yaw), cx = Math.cos(pitch), sx = Math.sin(pitch), cz = Math.cos(roll), sz = Math.sin(roll);
  // R = Ry * Rx * Rz
  const r00 = cy * cz + sy * sx * sz, r01 = -cy * sz + sy * sx * cz, r02 = sy * cx;
  const r10 = cx * sz, r11 = cx * cz, r12 = -sx;
  const r20 = -sy * cz + cy * sx * sz, r21 = sy * sz + cy * sx * cz, r22 = cy * cx;
  return new Float32Array([r00 * s, r10 * s, r20 * s, 0, r01 * s, r11 * s, r21 * s, 0, r02 * s, r12 * s, r22 * s, 0, t[0], t[1], t[2], 1]);
}
/** rotation about an arbitrary unit axis (for the rings' orbits), then placed */
export function axisAngle(t: V3, ax: V3, ang: number, s = 1, pre?: M4): M4 {
  const [x, y, z] = norm(ax), c = Math.cos(ang), si = Math.sin(ang), C = 1 - c;
  const R = new Float32Array([
    (c + x * x * C) * s, (y * x * C + z * si) * s, (z * x * C - y * si) * s, 0,
    (x * y * C - z * si) * s, (c + y * y * C) * s, (z * y * C + x * si) * s, 0,
    (x * z * C + y * si) * s, (y * z * C - x * si) * s, (c + z * z * C) * s, 0,
    t[0], t[1], t[2], 1,
  ]);
  return pre ? mul4(R, pre) : R;
}
/** the upper-left 3×3 of a model matrix, inverse-transposed (uniform scale: just normalise) */
export function normalMat(m: M4): Float32Array {
  const s = Math.hypot(m[0], m[1], m[2]) || 1;
  return new Float32Array([m[0] / s, m[1] / s, m[2] / s, m[4] / s, m[5] / s, m[6] / s, m[8] / s, m[9] / s, m[10] / s]);
}
/** the scene camera as a clip matrix: a pinhole with a lens shift (screen y spans -1 … 1, x spans -A … A) */
export function camClip(pos: V3, f: V3, r: V3, u: V3, focal: number, shift: [number, number], A: number, near = 0.5, far = 40): M4 {
  const za = (far + near) / (far - near), zb = (-2 * far * near) / (far - near);
  const rowX: V3 = [(focal * r[0] + shift[0] * f[0]) / A, (focal * r[1] + shift[0] * f[1]) / A, (focal * r[2] + shift[0] * f[2]) / A];
  const rowY: V3 = [focal * u[0] + shift[1] * f[0], focal * u[1] + shift[1] * f[1], focal * u[2] + shift[1] * f[2]];
  const rowZ: V3 = [za * f[0], za * f[1], za * f[2]];
  const rowW: V3 = f;
  const row = (v: V3, k = 0) => [v[0], v[1], v[2], -dot(v, pos) + k];
  const R = [row(rowX), row(rowY), row(rowZ, zb), row(rowW)];
  const m = new Float32Array(16);
  for (let c = 0; c < 4; c++) for (let q = 0; q < 4; q++) m[c * 4 + q] = R[q][c];
  return m;
}
/** a perspective view from the light's origin along dir (fovY, aspect) */
export function lightClip(o: V3, dir: V3, fovY: number, aspect: number, near: number, far: number): M4 {
  const f = norm(dir), r = norm(cross([0, 1, 0], f)), u = cross(f, r);
  const t = 1 / Math.tan(fovY / 2);
  const za = (far + near) / (far - near), zb = (-2 * far * near) / (far - near);
  const rows: [V3, number][] = [[[r[0] * t / aspect, r[1] * t / aspect, r[2] * t / aspect], 0], [[u[0] * t, u[1] * t, u[2] * t], 0], [[f[0] * za, f[1] * za, f[2] * za], zb], [f, 0]];
  const m = new Float32Array(16);
  rows.forEach(([v, k], q) => { m[q] = v[0]; m[4 + q] = v[1]; m[8 + q] = v[2]; m[12 + q] = -dot(v, o) + k; });
  return m;
}

/* ---------- the objects' shaders ---------- */
const MESH_VERT = `
attribute vec3 aP; attribute vec3 aN;
uniform mat4 uM, uVP; uniform mat3 uMN;
uniform float uMirror;
varying vec3 vW, vN;
void main(){
  vec4 w = uM * vec4(aP, 1.0);
  vW = w.xyz; vN = uMN * aN;
  gl_Position = uVP * vec4(w.x, uMirror > 0.5 ? -w.y : w.y, w.z, 1.0);
}`;
const DEPTH_FRAG = `
precision highp float;
uniform vec3 uLO; uniform float uLFar;
varying vec3 vW, vN;
vec4 packD(float d){
  vec4 e = vec4(1.0, 255.0, 65025.0, 16581375.0) * clamp(d, 0.0, 0.99999);
  e = fract(e); e -= e.yzww * vec4(1.0 / 255.0, 1.0 / 255.0, 1.0 / 255.0, 0.0); return e;
}
void main(){ gl_FragColor = packD(length(vW - uLO) / uLFar); }`;
const LIT_FRAG = (cone: string) => `
precision highp float;
uniform vec3 uS0, uS1, uS2, uS3, uS4;
vec3 spectrum(float s){
  float x = clamp(s, 0.0, 1.0) * 4.0;
  vec3 c = mix(uS0, uS1, smoothstep(0.0, 1.0, x));
  c = mix(c, uS2, smoothstep(1.0, 2.0, x));
  c = mix(c, uS3, smoothstep(2.0, 3.0, x));
  return mix(c, uS4, smoothstep(3.0, 4.0, x));
}
${cone}
uniform vec3 uCamPos;
uniform vec3 uAlb;            // albedo
uniform float uRough, uF0, uWrap, uGlow, uRim, uMirror, uFade;
uniform vec2 uRes;
uniform float uTopY, uTopSoft, uGain, uGrain, uTime;
varying vec3 vW, vN;
float hash(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
void main(){
  vec3 eye = uCamPos;
  if (uMirror > 0.5) eye.y = -eye.y;
  vec3 V = normalize(eye - vW);
  vec3 N = normalize(vN);
  if (dot(N, V) < 0.0) N = -N;
  vec3 L = normalize(uLO - vW);
  vec3 alb = uAlb;
  float rough = uRough;
  vec3 Li = coneLight(vW) * shadowVis(vW + N * 0.02) * 1.7;   // the things catch more of the light than the satin floor
  float ndl = dot(N, L);
  // marble lets a little light through: the shadow side warms a touch (wrap)
  float diff = max((ndl + uWrap) / (1.0 + uWrap), 0.0);
  vec3 H = normalize(L + V);
  float sh = exp2(10.0 * (1.0 - rough) + 1.0);
  float spec = pow(max(dot(N, H), 0.0), sh) * (sh + 2.0) / 8.0;
  float fr = uF0 + (1.0 - uF0) * pow(1.0 - max(dot(N, V), 0.0), 5.0);
  vec3 col = Li * (alb * diff * (1.0 - fr) + spec * fr * step(0.0, ndl));
  // where the surface turns away from us on the lit side, the light runs along the edge: a line of light on the form
  col += Li * pow(1.0 - max(dot(N, V), 0.0), 3.0) * smoothstep(-0.15, 0.45, ndl) * uRim;
  // the dark room: barely anything, only so the forms are there when the light leaves
  col += alb * 0.006 * (0.4 + 0.6 * max(N.y, 0.0)) + fr * 0.004;
  col += alb * uGlow * length(Li);
  // the lit floor throws a little of the light back up: surfaces that face down pick it up, warm
  col += alb * coneLight(vec3(vW.x, 0.0, vW.z)) * 0.16 * max(0.0, 0.35 - 0.65 * N.y);
  col *= uFade;
  vec2 frag = gl_FragCoord.xy;
  if (uMirror > 0.5) {
    // the satin floor: a soft, dim mirror, fading with the depth of the reflection
    col *= 0.07 * exp(-max(vW.y, 0.0) * 8.0);
    gl_FragColor = vec4(1.0 - exp(-col * 1.4 * uGain), 1.0);
    return;
  }
  col *= 1.0 - smoothstep(uTopY - uTopSoft, uTopY, frag.y);
  col *= (0.985 + 0.015 * sin(uTime * 0.31)) * uGain;
  col = vec3(1.0) - exp(-col * 1.4);
  float gr = (hash(frag) + hash(frag + 71.3) - 1.0) * 0.5;
  col += gr * (uGrain + dot(col, vec3(0.3, 0.5, 0.2)) * 0.07);
  vec2 q = frag / uRes - 0.5;
  col *= 1.0 - dot(q, q) * 0.45;
  gl_FragColor = vec4(max(col, 0.0), 1.0);
}`;

/* dust: points drifting off the figures and hanging in the light; each glows only where the light reaches it (and
   not in the figures' shadows), soft round, added over the picture */
const DUST_VERT = `
attribute vec3 aP;   // world position
attribute vec3 aN;   // size (world), strength, unused
uniform mat4 uVP;
uniform float uScale;
varying vec3 vW;
varying float vA;
void main(){
  vW = aP; vA = aN.y;
  vec4 c = uVP * vec4(aP, 1.0);
  gl_Position = c;
  gl_PointSize = clamp(aN.x * uScale / max(c.w, 1e-3), 1.0, 12.0);
}`;
const DUST_FRAG = (cone: string) => `
precision highp float;
uniform vec3 uS0, uS1, uS2, uS3, uS4;
vec3 spectrum(float s){
  float x = clamp(s, 0.0, 1.0) * 4.0;
  vec3 c = mix(uS0, uS1, smoothstep(0.0, 1.0, x));
  c = mix(c, uS2, smoothstep(1.0, 2.0, x));
  c = mix(c, uS3, smoothstep(2.0, 3.0, x));
  return mix(c, uS4, smoothstep(3.0, 4.0, x));
}
${cone}
uniform float uGain, uFade, uTopY, uTopSoft;
varying vec3 vW;
varying float vA;
void main(){
  vec2 d = gl_PointCoord - 0.5;
  float r = dot(d, d) * 4.0;
  if (r > 1.0) discard;
  float soft = exp(-r * 2.6);
  vec3 Li = coneLight(vW) * shadowVis1(vW);
  // lit by our light, and a faint glow of its own so a stream or a shape of dust still reads where the light is weak
  vec3 col = (Li * 1.3 + vec3(1.0, 0.84, 0.62) * 0.16) * soft * vA * uFade;
  col *= 1.0 - smoothstep(uTopY - uTopSoft, uTopY, gl_FragCoord.y);
  gl_FragColor = vec4(1.0 - exp(-col * 1.4 * uGain), 1.0);
}`;

export interface Material { alb: V3; rough: number; f0: number; wrap: number; glow: number; rim: number }
export const MARBLE: Material = { alb: [0.86, 0.84, 0.8], rough: 0.42, f0: 0.04, wrap: 0.28, glow: 0.035, rim: 0.12 };
/** glossy black ceramic: almost no colour of its own, the light lives in its highlight and along its edges */
export const CERAMIC: Material = { alb: [0.014, 0.014, 0.016], rough: 0.1, f0: 0.07, wrap: 0, glow: 0, rim: 0.9 };
/** thick frosted glass: the light goes into it and glows through */
export const FROST: Material = { alb: [0.4, 0.4, 0.41], rough: 0.5, f0: 0.04, wrap: 0.9, glow: 0.3, rim: 0.7 };

/** one thing on the stage this frame */
export interface Item { mesh: number; m: M4; mat: Material; fade: number; cast?: boolean }

interface GPUMesh { vb: WebGLBuffer; nb: WebGLBuffer; ib: WebGLBuffer; n: number }

export class Objects {
  private gl: WebGLRenderingContext;
  private meshes: (GPUMesh | null)[] = [];
  private cpu: (Mesh | null)[] = [];
  private depthProg: WebGLProgram;
  private litProg: WebGLProgram;
  private dustProg: WebGLProgram;
  private dustBuf: WebGLBuffer | null = null;
  private U = new Map<WebGLProgram, Map<string, WebGLUniformLocation | null>>();
  readonly shadowTex: WebGLTexture;
  private fbo: WebGLFramebuffer;
  readonly shadowSize = 2048;
  ok = false;

  constructor(gl: WebGLRenderingContext) {
    this.gl = gl;
    const mk = (vs: string, fs: string) => {
      const p = gl.createProgram()!;
      const sh = (t: number, src: string) => {
        const s = gl.createShader(t)!; gl.shaderSource(s, src); gl.compileShader(s);
        if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) console.warn("ScenePrism objects:", gl.getShaderInfoLog(s));
        gl.attachShader(p, s);
      };
      sh(gl.VERTEX_SHADER, vs); sh(gl.FRAGMENT_SHADER, fs);
      gl.bindAttribLocation(p, 0, "aP"); gl.bindAttribLocation(p, 1, "aN");
      gl.linkProgram(p);
      if (!gl.getProgramParameter(p, gl.LINK_STATUS)) console.warn("ScenePrism objects link:", gl.getProgramInfoLog(p));
      return p;
    };
    this.depthProg = mk(MESH_VERT, DEPTH_FRAG);
    this.litProg = mk(MESH_VERT, LIT_FRAG(CONE_GLSL));
    this.dustProg = mk(DUST_VERT, DUST_FRAG(CONE_GLSL));
    this.ok = !!gl.getProgramParameter(this.depthProg, gl.LINK_STATUS) && !!gl.getProgramParameter(this.litProg, gl.LINK_STATUS);
    // the shadow map: packed distance, cleared to "nothing in the way"
    this.shadowTex = gl.createTexture()!;
    gl.activeTexture(gl.TEXTURE3);
    gl.bindTexture(gl.TEXTURE_2D, this.shadowTex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, this.shadowSize, this.shadowSize, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    this.fbo = gl.createFramebuffer()!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.shadowTex, 0);
    const rb = gl.createRenderbuffer();
    gl.bindRenderbuffer(gl.RENDERBUFFER, rb);
    gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, this.shadowSize, this.shadowSize);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, rb);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) this.ok = false;
    gl.clearColor(1, 1, 1, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  /** upload a mesh into slot i */
  set(i: number, m: Mesh) {
    const gl = this.gl, old = this.meshes[i];
    if (old) { gl.deleteBuffer(old.vb); gl.deleteBuffer(old.nb); gl.deleteBuffer(old.ib); }
    const b = (target: number, data: ArrayBufferView) => { const x = gl.createBuffer()!; gl.bindBuffer(target, x); gl.bufferData(target, data, gl.STATIC_DRAW); return x; };
    this.meshes[i] = { vb: b(gl.ARRAY_BUFFER, m.pos), nb: b(gl.ARRAY_BUFFER, m.nrm), ib: b(gl.ELEMENT_ARRAY_BUFFER, m.idx), n: m.idx.length };
    this.cpu[i] = m;
  }
  /** new positions for mesh i (same count; normals kept) */
  update(i: number, pos: Float32Array, nrm?: Float32Array) {
    const g = this.meshes[i], gl = this.gl;
    if (!g) return;
    gl.bindBuffer(gl.ARRAY_BUFFER, g.vb);
    gl.bufferData(gl.ARRAY_BUFFER, pos, gl.DYNAMIC_DRAW);
    if (nrm) { gl.bindBuffer(gl.ARRAY_BUFFER, g.nb); gl.bufferData(gl.ARRAY_BUFFER, nrm, gl.DYNAMIC_DRAW); }
  }
  /** mesh i's own vertices (positions, in its frame), for things that follow its surface */
  points(i: number) { return this.cpu[i]?.pos ?? null; }
  /** dust: n points, interleaved [x, y, z, size, strength, 0], over what is drawn (depth tested, not written) */
  dust(data: Float32Array, n: number, vp: M4, scale: number, fade: number, setShared: (p: WebGLProgram) => void) {
    const gl = this.gl, p = this.dustProg;
    if (!n || !gl.getProgramParameter(p, gl.LINK_STATUS)) return;
    if (!this.dustBuf) this.dustBuf = gl.createBuffer();
    gl.useProgram(p);
    setShared(p);
    gl.uniformMatrix4fv(this.u(p, "uVP"), false, vp);
    gl.uniform1f(this.u(p, "uScale"), scale); gl.uniform1f(this.u(p, "uFade"), fade);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.dustBuf);
    gl.bufferData(gl.ARRAY_BUFFER, data.subarray(0, n * 6), gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 24, 0);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 24, 12);
    gl.enable(gl.DEPTH_TEST); gl.depthMask(false);
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);
    gl.drawArrays(gl.POINTS, 0, n);
    gl.disable(gl.BLEND); gl.depthMask(true); gl.disable(gl.DEPTH_TEST);
    gl.disableVertexAttribArray(1);
  }
  /** the lowest point of mesh i once tilted by pitch (so a tilted thing can still rest on the floor) */
  lowest(i: number, pitch: number) {
    const m = this.cpu[i];
    if (!m) return 0;
    const c = Math.cos(pitch), s = Math.sin(pitch);
    let lo = 1e9;
    for (let k = 0; k < m.pos.length; k += 3) lo = Math.min(lo, c * m.pos[k + 1] - s * m.pos[k + 2]);
    return lo;
  }
  has(i: number) { return !!this.meshes[i]; }

  u(p: WebGLProgram, n: string) {
    let m = this.U.get(p);
    if (!m) { m = new Map(); this.U.set(p, m); }
    if (!m.has(n)) m.set(n, this.gl.getUniformLocation(p, n));
    return m.get(n)!;
  }

  private bindMesh(g: GPUMesh) {
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, g.vb); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, g.nb); gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, g.ib);
  }

  /** (1) the shadow map from the light's origin */
  shadow(items: Item[], lvp: M4, lo: V3, far: number) {
    const gl = this.gl, p = this.depthProg;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    gl.viewport(0, 0, this.shadowSize, this.shadowSize);
    gl.clearColor(1, 1, 1, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.useProgram(p);
    gl.enable(gl.DEPTH_TEST); gl.depthMask(true); gl.disable(gl.BLEND);
    gl.uniformMatrix4fv(this.u(p, "uVP"), false, lvp);
    gl.uniform3f(this.u(p, "uLO"), lo[0], lo[1], lo[2]);
    gl.uniform1f(this.u(p, "uLFar"), far);
    gl.uniform1f(this.u(p, "uMirror"), 0);
    for (const it of items) {
      const g = this.meshes[it.mesh];
      if (!g || it.fade < 0.3 || it.cast === false) continue;
      this.bindMesh(g);
      gl.uniformMatrix4fv(this.u(p, "uM"), false, it.m);
      gl.uniformMatrix3fv(this.u(p, "uMN"), false, normalMat(it.m));
      gl.drawElements(gl.TRIANGLES, g.n, gl.UNSIGNED_SHORT, 0);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  /** (3) and (4): the objects, first mirrored in the floor (added), then themselves */
  draw(items: Item[], vp: M4, setShared: (p: WebGLProgram) => void, w: number, h: number) {
    const gl = this.gl, p = this.litProg;
    gl.viewport(0, 0, w, h);
    gl.useProgram(p);
    setShared(p);
    gl.uniformMatrix4fv(this.u(p, "uVP"), false, vp);
    gl.enable(gl.DEPTH_TEST); gl.depthMask(true);
    for (const mirror of [1, 0]) {
      gl.clear(gl.DEPTH_BUFFER_BIT);
      if (mirror) { gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE); } else gl.disable(gl.BLEND);
      gl.uniform1f(this.u(p, "uMirror"), mirror);
      for (const it of items) {
        const g = this.meshes[it.mesh];
        if (!g || it.fade < 0.004) continue;
        this.bindMesh(g);
        gl.uniformMatrix4fv(this.u(p, "uM"), false, it.m);
        gl.uniformMatrix3fv(this.u(p, "uMN"), false, normalMat(it.m));
        gl.uniform3f(this.u(p, "uAlb"), it.mat.alb[0], it.mat.alb[1], it.mat.alb[2]);
        gl.uniform1f(this.u(p, "uRough"), it.mat.rough); gl.uniform1f(this.u(p, "uF0"), it.mat.f0);
        gl.uniform1f(this.u(p, "uWrap"), it.mat.wrap); gl.uniform1f(this.u(p, "uGlow"), it.mat.glow); gl.uniform1f(this.u(p, "uRim"), it.mat.rim);
        gl.uniform1f(this.u(p, "uFade"), it.fade);
        gl.drawElements(gl.TRIANGLES, g.n, gl.UNSIGNED_SHORT, 0);
      }
    }
    gl.disable(gl.BLEND); gl.disable(gl.DEPTH_TEST);
    gl.disableVertexAttribArray(1);
  }

  dispose() {
    const gl = this.gl;
    this.meshes.forEach((g) => { if (g) { gl.deleteBuffer(g.vb); gl.deleteBuffer(g.nb); gl.deleteBuffer(g.ib); } });
    gl.deleteTexture(this.shadowTex); gl.deleteFramebuffer(this.fbo);
    gl.deleteProgram(this.depthProg); gl.deleteProgram(this.litProg); gl.deleteProgram(this.dustProg);
    if (this.dustBuf) gl.deleteBuffer(this.dustBuf);
  }
}

/** where a direction on the floor points (unit xz → V3) */
export const dirXZ = (az: number): V3 => [Math.cos(az), 0, Math.sin(az)];
export { sub };
