/* The prism scene's optics, solved on the CPU once per frame: one thin beam meets an upright glass prism (equilateral
   cross-section, axis vertical, standing on the floor y = 0) and is traced exactly (Snell + Fresnel) for each colour of
   the AI spectrum. The shader then draws the light it is given: the beam, its path through the glass, one faint internal
   reflection, the dispersed fan and where it lands on the floor. World: x right, y up, z away from the camera. */

export type V3 = [number, number, number];

export const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const mul = (a: V3, s: number): V3 => [a[0] * s, a[1] * s, a[2] * s];
export const dot = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const len = (a: V3): number => Math.hypot(a[0], a[1], a[2]);
export const norm = (a: V3): V3 => mul(a, 1 / (len(a) || 1));

/** GLSL refract(): N must face against I. null = total internal reflection. */
export function refract(I: V3, N: V3, eta: number): V3 | null {
  const c = dot(N, I);
  const k = 1 - eta * eta * (1 - c * c);
  if (k < 0) return null;
  return sub(mul(I, eta), mul(N, eta * c + Math.sqrt(k)));
}
export const reflect = (I: V3, N: V3): V3 => sub(I, mul(N, 2 * dot(N, I)));

/** Unpolarised Fresnel reflectance at an interface n1 → n2 for a ray with incidence cosine cosI. */
export function fresnel(cosI: number, n1: number, n2: number): number {
  const ci = Math.min(1, Math.abs(cosI));
  const s = (n1 / n2) * Math.sqrt(Math.max(0, 1 - ci * ci));
  if (s >= 1) return 1;
  const ct = Math.sqrt(1 - s * s);
  const rs = (n1 * ci - n2 * ct) / (n1 * ci + n2 * ct);
  const rp = (n1 * ct - n2 * ci) / (n1 * ct + n2 * ci);
  return 0.5 * (rs * rs + rp * rp);
}

/** Convex prism as 5 planes dot(n, p) = d (outward normals): 3 sides, top, bottom. */
export interface Prism { n: V3[]; d: number[]; c: V3; R: number; H: number; rot: number }

export function makePrism(c: V3, R: number, H: number, rot: number): Prism {
  const n: V3[] = [], d: number[] = [];
  const r = R * 0.5; // inradius of an equilateral triangle
  for (let k = 0; k < 3; k++) {
    const a = rot + (k * 2 * Math.PI) / 3;
    const nk: V3 = [Math.cos(a), 0, Math.sin(a)];
    n.push(nk); d.push(dot(nk, c) + r);
  }
  n.push([0, 1, 0]); d.push(H);
  n.push([0, -1, 0]); d.push(0);
  return { n, d, c, R, H, rot };
}

/** Ray from outside: entry distance and face, or null. */
export function hitOutside(P: Prism, o: V3, dir: V3): { t: number; i: number } | null {
  let tN = -1e9, tF = 1e9, iN = -1;
  for (let i = 0; i < 5; i++) {
    const den = dot(P.n[i], dir), dist = P.d[i] - dot(P.n[i], o);
    if (Math.abs(den) < 1e-9) { if (dist < 0) return null; continue; }
    const t = dist / den;
    if (den < 0) { if (t > tN) { tN = t; iN = i; } } else if (t < tF) tF = t;
  }
  return tN < tF && tN > 0 ? { t: tN, i: iN } : null;
}

/** Ray from inside: exit distance and face. */
export function hitInside(P: Prism, o: V3, dir: V3): { t: number; i: number } {
  let tF = 1e9, iF = 0;
  for (let i = 0; i < 5; i++) {
    const den = dot(P.n[i], dir);
    if (den <= 1e-9) continue;
    const t = (P.d[i] - dot(P.n[i], o)) / den;
    if (t < tF) { tF = t; iF = i; }
  }
  return { t: tF, i: iF };
}

export interface ColourRay {
  /** where this colour leaves the glass */
  out: V3;
  /** direction in air after the exit face (null = trapped by total internal reflection) */
  dir: V3 | null;
  /** transmitted fraction (both faces) */
  T: number;
}

export interface Trace {
  pin: V3;
  /** entry face normal */
  nin: V3;
  /** per colour (same order as the refractive indices passed in) */
  rays: ColourRay[];
  /** the entry face's own reflection: direction and strength */
  entryRefl: { dir: V3; F: number };
  /** one internal reflection (mid colour): from its exit point to where it meets the glass again, then out */
  inner: { a: V3; b: V3; F: number; out: V3 | null; T: number };
}

/** Trace the beam (origin o, direction d0) through the prism for each refractive index. */
export function traceBeam(P: Prism, o: V3, d0: V3, ns: number[]): Trace | null {
  const h = hitOutside(P, o, d0);
  if (!h || h.i > 2) return null;
  const pin = add(o, mul(d0, h.t));
  const nin = P.n[h.i];
  const cos1 = -dot(d0, nin);
  const rays: ColourRay[] = ns.map((n) => {
    const t1 = refract(d0, nin, 1 / n);
    if (!t1) return { out: pin, dir: null, T: 0 };
    const x = hitInside(P, pin, t1);
    const out = add(pin, mul(t1, x.t));
    const nx = P.n[x.i];
    const dir = refract(t1, mul(nx, -1), n);
    const T = (1 - fresnel(cos1, 1, n)) * (dir ? 1 - fresnel(dot(t1, nx), n, 1) : 0);
    return { out, dir: dir ? norm(dir) : null, T };
  });
  // the entry face's reflection
  const entryRefl = { dir: norm(reflect(d0, nin)), F: fresnel(cos1, 1, ns[Math.floor(ns.length / 2)]) };
  // one internal reflection for the mid colour
  const nm = ns[Math.floor(ns.length / 2)];
  const t1 = refract(d0, nin, 1 / nm) ?? d0;
  const x = hitInside(P, pin, t1);
  const a = add(pin, mul(t1, x.t));
  const nx = P.n[x.i];
  const F = fresnel(dot(t1, nx), nm, 1);
  const r1 = norm(reflect(t1, nx));
  const y = hitInside(P, add(a, mul(r1, 1e-4)), r1);
  const b = add(a, mul(r1, y.t + 1e-4));
  const ny = P.n[y.i];
  const out = refract(r1, mul(ny, -1), nm);
  const T = out ? 1 - fresnel(dot(r1, ny), nm, 1) : 0;
  return { pin, nin, rays, entryRefl, inner: { a, b, F, out: out ? norm(out) : null, T } };
}

/** Pinhole camera with a lens shift; basis is right-handed (r, u, f). */
export interface Cam { pos: V3; f: V3; r: V3; u: V3; focal: number; shift: [number, number] }

export function lookCam(pos: V3, target: V3, fovY: number, shift: [number, number]): Cam {
  const f = norm(sub(target, pos));
  const r = norm(cross([0, 1, 0], f));
  const u = cross(f, r);
  return { pos, f, r, u, focal: 1 / Math.tan(fovY / 2), shift };
}

/** World point → section uv (0..1, y down), for layout checks. */
export function project(c: Cam, p: V3, aspect: number): [number, number] {
  const q = sub(p, c.pos);
  const z = dot(q, c.f);
  const x = (dot(q, c.r) / z) * c.focal + c.shift[0];
  const y = (dot(q, c.u) / z) * c.focal + c.shift[1];
  return [0.5 + x / (2 * aspect), 0.5 - y / 2];
}
