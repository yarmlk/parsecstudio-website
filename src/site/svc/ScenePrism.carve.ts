/* Shadow art: a scatter of black shards lying in the light. From the camera they read as debris; seen from where the
   light leaves the glass they close up, so their shadow on the floor is a picture, the right way up for the viewer.
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

/** a film camera on its tripod, two reels on top, the lens to the right (u right, v down); drawn bold, as a shadow
 *  softens every edge */
export const FILM_CAMERA: Picture = {
  box: [-0.58, -0.74, 0.98, 1.24],
  sdf: (u, v) => {
    let d = sdBox(u, v, 0, 0.24, 0.52, 0.29, 0.07);
    // the reels, apart, each with its hub open
    d = Math.min(d, Math.max(sdCircle(u, v, -0.27, -0.36, 0.3), -sdCircle(u, v, -0.27, -0.36, 0.075)));
    d = Math.min(d, Math.max(sdCircle(u, v, 0.33, -0.33, 0.26), -sdCircle(u, v, 0.33, -0.33, 0.065)));
    d = Math.max(d, -sdBox(u, v, 0.04, -0.27, 0.035, 0.24, 0));
    // the lens: a short barrel widening to a hood
    d = Math.min(d, sdBox(u, v, 0.62, 0.24, 0.12, 0.12, 0.02));
    d = Math.min(d, Math.max(Math.abs(u - 0.86) - 0.12, Math.abs(v - 0.24) - (0.13 + (u - 0.74) * 0.6)));
    // the tripod
    d = Math.min(d, sdBox(u, v, 0, 0.6, 0.14, 0.09, 0.02));
    d = Math.min(d, sdSeg(u, v, -0.05, 0.64, -0.4, 1.18, 0.07));
    d = Math.min(d, sdSeg(u, v, 0.05, 0.64, 0.4, 1.18, 0.07));
    d = Math.min(d, sdSeg(u, v, 0, 0.66, 0, 1.19, 0.06));
    return d;
  },
};

export interface ShardsIn {
  /** the light's origin */
  O: V3;
  /** the picture's centre, on the floor */
  at: V3;
  /** the picture's height on screen, px */
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

export function shards({ O, at, px, toScreen, pic, span = [0.5, 0.93], size = 0.03, N = 900, seed = 7, ball }: ShardsIn): Mesh | null {
  const [cx, cy] = toScreen(at);
  const [bu0, bv0, bu1, bv1] = pic.box, mu = (bu0 + bu1) / 2, mv = (bv0 + bv1) / 2;
  const s = px / (bv1 - bv0);
  /** a floor point → the picture's signed distance there (picture units) */
  const sd = (q: V3) => { const [sx, sy] = toScreen(q); return pic.sdf((sx - cx) / s + mu, (sy - cy) / s + mv); };
  // how many world units a screen px is, about the picture, to sample the floor around it
  const a0 = toScreen([at[0] + 0.1, 0, at[2]]), a1 = toScreen([at[0], 0, at[2] + 0.1]);
  const pxU = Math.min(Math.hypot(a0[0] - cx, a0[1] - cy), Math.hypot(a1[0] - cx, a1[1] - cy)) / 0.1;
  const reach = (px * 1.2) / Math.max(pxU, 1e-3);

  const rand = rng(seed);
  // the ball: centred on the light's way to the picture, just wide enough to hold the picture's cone there
  let C: V3 | null = null, rho = 0;
  if (ball) {
    C = [O[0] + (at[0] - O[0]) * ball, O[1] * (1 - ball), O[2] + (at[2] - O[2]) * ball];
    const ax = norm(sub(at, O));
    for (let k = 0; k < 4000; k++) {
      const q: V3 = [at[0] + (rand() * 2 - 1) * reach, 0, at[2] + (rand() * 2 - 1) * reach];
      if (sd(q) > 0) continue;
      const p: V3 = [O[0] + (q[0] - O[0]) * ball, O[1] * (1 - ball), O[2] + (q[2] - O[2]) * ball], w = sub(p, C);
      const along = w[0] * ax[0] + w[1] * ax[1] + w[2] * ax[2];
      rho = Math.max(rho, Math.hypot(w[0] - ax[0] * along, w[1] - ax[1] * along, w[2] - ax[2] * along));
    }
    rho *= 1.06;
  }
  const pos: number[] = [], nrm: number[] = [], idx: number[] = [];
  let tries = 0, made = 0;
  while (made < N && tries < N * 120) {
    tries++;
    const q: V3 = [at[0] + (rand() * 2 - 1) * reach, 0, at[2] + (rand() * 2 - 1) * reach];
    if (sd(q) > -0.02) continue;
    // somewhere along the ray from O to that floor point
    const f = span[0] + (span[1] - span[0]) * rand();
    const p: V3 = [O[0] + (q[0] - O[0]) * f, O[1] * (1 - f), O[2] + (q[2] - O[2]) * f];
    if (C && Math.hypot(p[0] - C[0], p[1] - C[1], p[2] - C[2]) > rho) continue;
    // the later shards smaller, so they reach into the picture's thin parts
    // a flake: a thin, irregular tetrahedron, randomly turned
    const sz = size * (0.55 + 0.9 * rand() * rand()) * (made > N * 0.6 ? 0.6 : 1);
    const ax = norm([rand() - 0.5, rand() - 0.5, rand() - 0.5]), bx = norm(cross(ax, [rand() - 0.5, rand() - 0.5, rand() - 0.5])), cx2 = cross(ax, bx);
    const L = [1 + rand(), 0.6 + 0.6 * rand(), 0.18 + 0.25 * rand()];
    const v: V3[] = [];
    for (const [x, y, z] of [[1, 0, 0], [-0.6, 0.8, 0], [-0.5, -0.9, 0.1], [0.1, 0.1, 1]]) {
      const jx = x * L[0] + (rand() - 0.5) * 0.4, jy = y * L[1] + (rand() - 0.5) * 0.4, jz = z * L[2] * (rand() > 0.5 ? 1 : -1);
      v.push([p[0] + (ax[0] * jx + bx[0] * jy + cx2[0] * jz) * sz, p[1] + (ax[1] * jx + bx[1] * jy + cx2[1] * jz) * sz, p[2] + (ax[2] * jx + bx[2] * jy + cx2[2] * jz) * sz]);
    }
    const inside = (u: V3) => { if (u[1] < 0.004) return false; const fq = toFloor(O, u); return !!fq && sd(fq) < -0.008; };
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
  return made ? { pos: new Float32Array(pos), nrm: new Float32Array(nrm), idx: new Uint16Array(idx) } : null;
}
