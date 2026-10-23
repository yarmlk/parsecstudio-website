/* Shadow art: a ball of black shards hanging in the light. From the camera it reads as debris; seen from where the
   light leaves the glass the shards close up, so their shadow on the floor is a picture, the right way up for the viewer.
   The pictures are black-on-white masks (public/shadow), read into signed distance fields.
   Each shard sits on a ray from the light's origin O to a point of the picture on the floor, somewhere along the
   way, and is kept only if its whole shadow lands inside the picture. The picture is placed in screen space, so it
   reads undistorted from the camera. */

import type { Mesh } from "./ScenePrism.objects";

type V3 = [number, number, number];

/** a picture as a signed distance in its own units (negative inside), with its extent [u0, v0, u1, v1] */
export interface Picture { sdf: (u: number, v: number) => number; box: [number, number, number, number] }

const sdBox = (u: number, v: number, cx: number, cy: number, hx: number, hy: number, r: number) => {
  const dx = Math.abs(u - cx) - hx + r, dy = Math.abs(v - cy) - hy + r;
  return Math.hypot(Math.max(dx, 0), Math.max(dy, 0)) + Math.min(Math.max(dx, dy), 0) - r;
};
const sdCircle = (u: number, v: number, cx: number, cy: number, r: number) => Math.hypot(u - cx, v - cy) - r;
const sdSeg = (u: number, v: number, ax: number, ay: number, bx: number, by: number, w: number) => {
  const px = u - ax, py = v - ay, ex = bx - ax, ey = by - ay;
  const h = Math.max(0, Math.min(1, (px * ex + py * ey) / (ex * ex + ey * ey)));
  return Math.hypot(px - ex * h, py - ey * h) - w;
};

/** 1-D squared distance transform (Felzenszwalb & Huttenlocher) */
function edt1(f: Float64Array, n: number, d: Float64Array, v: Int32Array, z: Float64Array) {
  let k = 0;
  v[0] = 0; z[0] = -Infinity; z[1] = Infinity;
  for (let q = 1; q < n; q++) {
    let s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    while (s <= z[k]) { k--; s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]); }
    k++; v[k] = q; z[k] = s; z[k + 1] = Infinity;
  }
  k = 0;
  for (let q = 0; q < n; q++) { while (z[k + 1] < q) k++; d[q] = (q - v[k]) * (q - v[k]) + f[v[k]]; }
}
/** distance (px) from every pixel to the nearest pixel where on[] is set */
function edt(on: Uint8Array, w: number, h: number): Float64Array {
  const INF = 1e20, g = new Float64Array(w * h), n = Math.max(w, h);
  const f = new Float64Array(n), d = new Float64Array(n), v = new Int32Array(n), z = new Float64Array(n + 1);
  for (let i = 0; i < w * h; i++) g[i] = on[i] ? 0 : INF;
  for (let x = 0; x < w; x++) { for (let y = 0; y < h; y++) f[y] = g[y * w + x]; edt1(f, h, d, v, z); for (let y = 0; y < h; y++) g[y * w + x] = d[y]; }
  for (let y = 0; y < h; y++) { for (let x = 0; x < w; x++) f[x] = g[y * w + x]; edt1(f, w, d, v, z); for (let x = 0; x < w; x++) g[y * w + x] = Math.sqrt(d[x]); }
  return g;
}

/** a picture from a black-on-white mask image: its signed distance field, in units of the image's longer side */
export async function loadPicture(url: string): Promise<Picture> {
  const img = new Image();
  img.decoding = "async";
  img.src = url;
  await img.decode();
  const w = img.naturalWidth, h = img.naturalHeight;
  const cv = document.createElement("canvas");
  cv.width = w; cv.height = h;
  const cx = cv.getContext("2d", { willReadFrequently: true })!;
  cx.fillStyle = "#fff"; cx.fillRect(0, 0, w, h);
  cx.drawImage(img, 0, 0);
  const px = cx.getImageData(0, 0, w, h).data;
  const ins = new Uint8Array(w * h), out = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) { const dark = px[i * 4] < 128; ins[i] = dark ? 1 : 0; out[i] = dark ? 0 : 1; }
  const dIn = edt(ins, w, h), dOut = edt(out, w, h);
  const M = Math.max(w, h), field = new Float32Array(w * h);
  // outside: distance to the shape; inside: minus the distance to the outside
  for (let i = 0; i < w * h; i++) field[i] = (ins[i] ? -(dOut[i] - 0.5) : dIn[i] - 0.5) / M;
  const W = w / M, H = h / M;
  return {
    box: [0, 0, W, H],
    sdf: (u, v) => {
      const x = (u / W) * w - 0.5, y = (v / H) * h - 0.5;
      // off the image: far outside
      if (x < 0 || y < 0 || x > w - 1 || y > h - 1) {
        const dx = Math.max(-x, x - (w - 1), 0), dy = Math.max(-y, y - (h - 1), 0);
        return Math.hypot(dx, dy) / M + 0.01;
      }
      const x0 = Math.floor(x), y0 = Math.floor(y), x1 = Math.min(w - 1, x0 + 1), y1 = Math.min(h - 1, y0 + 1), fx = x - x0, fy = y - y0;
      const a = field[y0 * w + x0], b = field[y0 * w + x1], c = field[y1 * w + x0], d = field[y1 * w + x1];
      return (a + (b - a) * fx) + ((c + (d - c) * fx) - (a + (b - a) * fx)) * fy;
    },
  };
}

export interface ShardsIn {
  /** the light's origin */
  O: V3;
  /** the picture's centre, on the floor */
  at: V3;
  /** the picture's longer side on screen, px */
  px: number;
  /** world point → screen px */
  toScreen: (p: V3) => [number, number];
  pic: Picture;
  /** how far along each ray (0 = at O, 1 = on the floor) the shards may lie */
  span?: [number, number];
  /** the shards' size, world units */
  size?: number;
  N?: number;
  seed?: number;
  /** gather the shards into a ball this far along the light's way to the picture (0..1), instead of a long drift */
  ball?: number;
  /** the ball's radius, when several pictures share one ball (see ballRadius) */
  rho?: number;
}

const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const norm = (a: V3): V3 => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
/** where the ray from O through p meets the floor (y = 0), or null if it never comes down */
const toFloor = (O: V3, p: V3): V3 | null => {
  const dy = O[1] - p[1];
  if (dy <= 1e-4) return null;
  const t = O[1] / dy;
  return [O[0] + (p[0] - O[0]) * t, 0, O[2] + (p[2] - O[2]) * t];
};
/** a small seeded random, so the same layout always lays the same shards */
const rng = (seed: number) => () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

/** the picture's signed distance at a floor point, and how far around its centre the floor needs sampling */
function frame({ at, px, toScreen, pic }: ShardsIn) {
  const [cx, cy] = toScreen(at);
  const [bu0, bv0, bu1, bv1] = pic.box, mu = (bu0 + bu1) / 2, mv = (bv0 + bv1) / 2;
  const s = px / Math.max(bu1 - bu0, bv1 - bv0);
  const sd = (q: V3) => { const [sx, sy] = toScreen(q); return pic.sdf((sx - cx) / s + mu, (sy - cy) / s + mv); };
  const a0 = toScreen([at[0] + 0.1, 0, at[2]]), a1 = toScreen([at[0], 0, at[2] + 0.1]);
  const pxU = Math.min(Math.hypot(a0[0] - cx, a0[1] - cy), Math.hypot(a1[0] - cx, a1[1] - cy)) / 0.1;
  return { sd, reach: (px * 0.8) / Math.max(pxU, 1e-3) };
}

/** the radius of the ball that holds this picture's cone at its place along the light */
export function ballRadius(o: ShardsIn): number {
  const { O, at, ball = 0.36 } = o, { sd, reach } = frame(o), rand = rng(3);
  const C: V3 = [O[0] + (at[0] - O[0]) * ball, O[1] * (1 - ball), O[2] + (at[2] - O[2]) * ball], ax = norm(sub(at, O));
  let rho = 0;
  for (let k = 0; k < 5000; k++) {
    const q: V3 = [at[0] + (rand() * 2 - 1) * reach, 0, at[2] + (rand() * 2 - 1) * reach];
    if (sd(q) > 0) continue;
    const p: V3 = [O[0] + (q[0] - O[0]) * ball, O[1] * (1 - ball), O[2] + (q[2] - O[2]) * ball], w = sub(p, C);
    const along = w[0] * ax[0] + w[1] * ax[1] + w[2] * ax[2];
    rho = Math.max(rho, Math.hypot(w[0] - ax[0] * along, w[1] - ax[1] * along, w[2] - ax[2] * along));
  }
  return rho * 1.06;
}

/** exactly N shards (fewer found: some laid twice), so that sets for several pictures pair shard for shard */
export function shards(o: ShardsIn): Mesh | null {
  const { O, at, pic, span = [0.5, 0.93], size = 0.03, N = 900, seed = 7, ball } = o;
  void pic;
  const { sd, reach } = frame(o);
  const rand = rng(seed);
  let C: V3 | null = null;
  const rho = ball ? o.rho ?? ballRadius(o) : 0;
  if (ball) C = [O[0] + (at[0] - O[0]) * ball, O[1] * (1 - ball), O[2] + (at[2] - O[2]) * ball];
  const pos: number[] = [], nrm: number[] = [], idx: number[] = [];
  let tries = 0, made = 0;
  while (made < N && tries < N * 200) {
    tries++;
    const q: V3 = [at[0] + (rand() * 2 - 1) * reach, 0, at[2] + (rand() * 2 - 1) * reach];
    // the last third of the shards, small, go only along the picture's edges and into its thin parts: the outline sharp
    const edge = made > N * 0.66, dq = sd(q);
    if (dq > -0.004 || (edge && dq < -0.035)) continue;
    // somewhere along the ray from O to that floor point
    const f = span[0] + (span[1] - span[0]) * rand();
    const p: V3 = [O[0] + (q[0] - O[0]) * f, O[1] * (1 - f), O[2] + (q[2] - O[2]) * f];
    if (C && Math.hypot(p[0] - C[0], p[1] - C[1], p[2] - C[2]) > rho) continue;
    // a flake: a thin, irregular tetrahedron, randomly turned
    const sz = size * (0.55 + 0.9 * rand() * rand()) * (edge ? 0.45 : 1);
    const ax = norm([rand() - 0.5, rand() - 0.5, rand() - 0.5]), bx = norm(cross(ax, [rand() - 0.5, rand() - 0.5, rand() - 0.5])), cx2 = cross(ax, bx);
    const L = [0.85 + 0.45 * rand(), 0.65 + 0.45 * rand(), 0.2 + 0.25 * rand()];
    const v: V3[] = [];
    for (const [x, y, z] of [[1, 0, 0], [-0.6, 0.8, 0], [-0.5, -0.9, 0.1], [0.1, 0.1, 1]]) {
      const jx = x * L[0] + (rand() - 0.5) * 0.4, jy = y * L[1] + (rand() - 0.5) * 0.4, jz = z * L[2] * (rand() > 0.5 ? 1 : -1);
      v.push([p[0] + (ax[0] * jx + bx[0] * jy + cx2[0] * jz) * sz, p[1] + (ax[1] * jx + bx[1] * jy + cx2[1] * jz) * sz, p[2] + (ax[2] * jx + bx[2] * jy + cx2[2] * jz) * sz]);
    }
    const inside = (u: V3) => { if (u[1] < 0.004) return false; const fq = toFloor(O, u); return !!fq && sd(fq) < -0.002; };
    const mid = (a: V3, b: V3): V3 => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
    if (!v.every(inside) || ![[0, 1], [0, 2], [0, 3], [1, 2], [1, 3], [2, 3]].every(([i, j]) => inside(mid(v[i], v[j])))) continue;
    const ctr: V3 = [(v[0][0] + v[1][0] + v[2][0] + v[3][0]) / 4, (v[0][1] + v[1][1] + v[2][1] + v[3][1]) / 4, (v[0][2] + v[1][2] + v[2][2] + v[3][2]) / 4];
    for (const [i0, i1, i2] of [[0, 1, 2], [0, 1, 3], [1, 2, 3], [0, 2, 3]]) {
      let nn = norm(cross(sub(v[i1], v[i0]), sub(v[i2], v[i0])));
      const fc = sub(v[i0], ctr);
      let tri = [v[i0], v[i1], v[i2]];
      if (nn[0] * fc[0] + nn[1] * fc[1] + nn[2] * fc[2] < 0) { nn = [-nn[0], -nn[1], -nn[2]]; tri = [v[i0], v[i2], v[i1]]; }
      for (const u of tri) { idx.push(pos.length / 3); pos.push(u[0], u[1], u[2]); nrm.push(nn[0], nn[1], nn[2]); }
    }
    made++;
  }
  if (!made) return null;
  // pad to N with copies of shards already laid
  const one = 36;
  while (made < N) {
    const j = Math.floor(rand() * made) * one;
    for (let k = 0; k < one; k += 3) { idx.push(pos.length / 3); pos.push(pos[j + k], pos[j + k + 1], pos[j + k + 2]); nrm.push(nrm[j + k], nrm[j + k + 1], nrm[j + k + 2]); }
    made++;
  }
  return { pos: new Float32Array(pos), nrm: new Float32Array(nrm), idx: new Uint16Array(idx) };
}
