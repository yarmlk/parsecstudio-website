/* Motion's object: a glossy black ceramic cube that inflates into a cushion, drops onto the floor, squashes, wobbles,
   settles, breathes, then lets its air out and floats back up as a cube. One shape, one material, one warm light
   sliding over it: the kind of soft-body moment that can only be CGI.
   Built on the CPU each frame: six face grids of a unit cube; each face bulges out by (1 - u²)(1 - v²) so the seams
   stay crisp like a stitched cushion; squash keeps the volume; normals from the grid. */

import type { Mesh } from "./ScenePrism.objects";

const G = 40; // cells per face side
const FACES: [number, number, number][][] = [
  // normal axis, u axis, v axis (unit vectors) for the six faces
  [[1, 0, 0], [0, 0, -1], [0, 1, 0]],
  [[-1, 0, 0], [0, 0, 1], [0, 1, 0]],
  [[0, 1, 0], [1, 0, 0], [0, 0, -1]],
  [[0, -1, 0], [1, 0, 0], [0, 0, 1]],
  [[0, 0, 1], [1, 0, 0], [0, 1, 0]],
  [[0, 0, -1], [-1, 0, 0], [0, 1, 0]],
];
const V = (G + 1) * (G + 1);

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const smooth = (x: number) => { const t = clamp01(x); return t * t * (3 - 2 * t); };
const easeIn = (x: number) => { const t = clamp01(x); return t * t * t; };

/** the loop (s) and what happens in it */
export const PILLOW_LOOP = 6.4;

export interface PillowPose {
  /** how far up its centre is, in its own half-size units above resting on the floor */
  lift: number;
  /** how inflated (0 a crisp cube … 1 a full cushion) */
  inflate: number;
  /** vertical squash (1 none; < 1 flattened), the width grows to keep the volume */
  squash: number;
  /** tilt while it wobbles (rad), and its slow turn */
  tilt: number;
  yaw: number;
}

/** where in its loop the cushion is at time t (s) */
export function pillowPose(t: number): PillowPose {
  const s = ((t % PILLOW_LOOP) + PILLOW_LOOP) % PILLOW_LOOP;
  const H = 1.0;
  let lift = H, inflate = 0, squash = 1, tilt = 0;
  if (s < 1.5) {
    // hovering, filling with air
    inflate = smooth(s / 1.4);
    lift = H + 0.06 * Math.sin(s * 2.2);
  } else if (s < 2.05) {
    // the drop
    inflate = 1;
    lift = H * (1 - easeIn((s - 1.5) / 0.55));
  } else if (s < 4.4) {
    // the hit and the wobble, dying away
    inflate = 1;
    const k = s - 2.05;
    squash = 1 - 0.3 * Math.exp(-k * 3.2) * Math.cos(k * 15);
    tilt = 0.06 * Math.exp(-k * 2.4) * Math.sin(k * 9);
    lift = 0;
  } else if (s < 5.2) {
    // resting, breathing
    inflate = 1;
    squash = 1 - 0.015 * Math.sin((s - 4.4) * 6);
    lift = 0;
  } else {
    // the air goes out and it floats back up, a cube again
    const k = (s - 5.2) / 1.2;
    inflate = 1 - smooth(k);
    lift = H * smooth(k);
  }
  return { lift, inflate, squash, tilt, yaw: 0.35 * Math.sin((t / PILLOW_LOOP) * Math.PI * 2) + 0.12 * t };
}

export class Pillow {
  readonly pos = new Float32Array(6 * V * 3);
  readonly nrm = new Float32Array(6 * V * 3);
  readonly idx: Uint16Array;
  constructor() {
    const idx: number[] = [];
    for (let f = 0; f < 6; f++) for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) {
      const a = f * V + j * (G + 1) + i, b = a + 1, c = a + G + 1, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
    this.idx = new Uint16Array(idx);
  }
  mesh(): Mesh { this.shape(0, 1); return { pos: this.pos, nrm: this.nrm, idx: this.idx }; }

  /** the shape for this much air and this squash (unit cube, half-size 0.5, resting on y = 0) */
  shape(inflate: number, squash: number) {
    const P = this.pos, N = this.nrm, bulge = 0.3 * inflate;
    // squash keeps the volume: wider as it flattens
    const sy = squash, sxz = 1 / Math.sqrt(Math.max(0.3, squash));
    for (let f = 0; f < 6; f++) {
      const [n, u, v] = FACES[f];
      for (let j = 0; j <= G; j++) for (let i = 0; i <= G; i++) {
        const a = (i / G) * 2 - 1, b = (j / G) * 2 - 1;
        // the seams pull in a little as the cushion fills (the fabric is shared with the bulge)
        const pull = 1 - 0.1 * inflate * (1 - Math.max(Math.abs(a), Math.abs(b)) ** 6);
        const h = 1 + bulge * (1 - a * a) * (1 - b * b) * 2;
        const x = (n[0] * h + (u[0] * a + v[0] * b) * pull) * 0.5, y = (n[1] * h + (u[1] * a + v[1] * b) * pull) * 0.5, z = (n[2] * h + (u[2] * a + v[2] * b) * pull) * 0.5;
        const k = (f * V + j * (G + 1) + i) * 3;
        P[k] = x * sxz; P[k + 1] = (y + 0.5 * (1 + bulge * 0.0)) * sy; P[k + 2] = z * sxz;
      }
    }
    // stand it on the floor: the lowest point at y = 0
    let lo = 1e9;
    for (let k = 1; k < P.length; k += 3) lo = Math.min(lo, P[k]);
    for (let k = 1; k < P.length; k += 3) P[k] -= lo;
    // normals across each face's grid
    for (let f = 0; f < 6; f++) for (let j = 0; j <= G; j++) for (let i = 0; i <= G; i++) {
      const at = (ii: number, jj: number) => (f * V + Math.max(0, Math.min(G, jj)) * (G + 1) + Math.max(0, Math.min(G, ii))) * 3;
      const r = at(i + 1, j), l = at(i - 1, j), up = at(i, j + 1), dn = at(i, j - 1);
      const ex = P[r] - P[l], ey = P[r + 1] - P[l + 1], ez = P[r + 2] - P[l + 2];
      const fx = P[up] - P[dn], fy = P[up + 1] - P[dn + 1], fz = P[up + 2] - P[dn + 2];
      let nx = ey * fz - ez * fy, ny = ez * fx - ex * fz, nz = ex * fy - ey * fx;
      const nl = Math.hypot(nx, ny, nz) || 1;
      nx /= nl; ny /= nl; nz /= nl;
      // facing out
      const n0 = FACES[f][0];
      if (nx * n0[0] + ny * n0[1] + nz * n0[2] < 0) { nx = -nx; ny = -ny; nz = -nz; }
      const k = at(i, j);
      N[k] = nx; N[k + 1] = ny; N[k + 2] = nz;
    }
  }
}
