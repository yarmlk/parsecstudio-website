/* A service's shadow art on the stage: one or more balls of shards (slots), each casting a picture, or a sequence of
   pictures that the shards travel between. Built for the light's origin and the camera of the current layout, a picture
   at a time when the page is idle; animated on the CPU each frame (one dynamic mesh).
   Between two pictures each shard goes to the nearest free place of the next one (the shards of both are ordered along
   one space-filling curve over the picture), so a shape grows, folds or turns into the next instead of scattering. */

import { ballRadius, loadPicture, shards, type Picture, type ShardSet } from "./ScenePrism.carve";
import type { Mesh } from "./ScenePrism.objects";

type V3 = [number, number, number];

export interface ArtSlot {
  /** the pictures, in the order they follow each other (one: it holds) */
  pics: string[];
  /** per picture: how long it holds, then how long its shards take to become the next one's (s) */
  hold?: number[];
  morph?: number[];
  /** the picture's centre on the floor */
  at: V3;
  /** its longer side on screen, px */
  px: number;
  /** where the ball hangs along the light's way to the picture (0..1) */
  ball: number;
}

export interface ArtBuild {
  O: V3;
  slots: ArtSlot[];
  toScreen: (p: V3) => [number, number];
  size: number;
  N: number;
  shape?: "flake" | "voxel";
}

const pics = new Map<string, Promise<Picture>>();
const picture = (url: string) => {
  let p = pics.get(url);
  if (!p) { p = loadPicture(url); pics.set(url, p); }
  return p;
};

const HOLD = 2.6, MORPH = 1.6;
const smooth = (x: number) => x * x * (3 - 2 * x);

/** index along a Hilbert curve of a point in [0,1)² (order 10) */
function hilbert(x: number, y: number) {
  const n = 1024;
  let xi = Math.max(0, Math.min(n - 1, Math.floor(x * n))), yi = Math.max(0, Math.min(n - 1, Math.floor(y * n))), d = 0;
  for (let s = n >> 1; s > 0; s >>= 1) {
    const rx = (xi & s) > 0 ? 1 : 0, ry = (yi & s) > 0 ? 1 : 0;
    d += s * s * ((3 * rx) ^ ry);
    if (ry === 0) { if (rx === 1) { xi = s - 1 - xi; yi = s - 1 - yi; } const t = xi; xi = yi; yi = t; }
  }
  return d;
}

/** the set's shards reordered along the curve (positions, normals); u, v normalised by the slot's extent */
function ordered(m: ShardSet, ext: number) {
  const n = m.uv.length / 2, f = m.per * 3, keys = new Float64Array(n), order = new Uint32Array(n);
  for (let j = 0; j < n; j++) { keys[j] = hilbert(m.uv[j * 2] / ext, m.uv[j * 2 + 1] / ext); order[j] = j; }
  order.sort((a, b) => keys[a] - keys[b]);
  const pos = new Float32Array(m.pos.length), nrm = new Float32Array(m.nrm.length);
  for (let j = 0; j < n; j++) { pos.set(m.pos.subarray(order[j] * f, order[j] * f + f), j * f); nrm.set(m.nrm.subarray(order[j] * f, order[j] * f + f), j * f); }
  return { pos, nrm };
}

export class ShadowArt {
  key = "";
  private gen = 0;
  /** per slot, the shard sets built so far, one per picture in order */
  private sets: { pos: Float32Array; nrm: Float32Array }[][] = [];
  private slots: ArtSlot[] = [];
  private O: V3 = [0, 0, 0];
  private ph: Float32Array | null = null;
  private live: Float32Array | null = null;
  private liveN: Float32Array | null = null;
  private N = 0;
  /** floats per shard (vertices × 3) */
  private F = 36;
  /** set when the first picture of every slot is in: the mesh exists from then on */
  ready = false;
  mesh: Mesh | null = null;

  /** start building for this layout (drops any build in progress) */
  build(key: string, b: ArtBuild, onMesh: (m: Mesh) => void) {
    if (key === this.key) return;
    this.key = key;
    const gen = ++this.gen;
    this.sets = b.slots.map(() => []);
    this.slots = b.slots;
    this.N = b.N;
    this.ready = false;
    this.O = b.O;
    const total = b.N * b.slots.length;
    // each shard: drift phase and speed, where it flies in from, its delay when changing picture
    const ph = new Float32Array(total * 6);
    let sd0 = 11;
    const r = () => { sd0 = (sd0 * 16807) % 2147483647; return sd0 / 2147483647; };
    for (let j = 0; j < total; j++) {
      const a = r() * Math.PI * 2, z = r() * 2 - 1, q = Math.sqrt(1 - z * z), d = 0.12 + 0.3 * r();
      ph.set([r() * Math.PI * 2, 0.5 + 0.5 * r(), Math.cos(a) * q * d, Math.abs(z) * d * 0.6, Math.sin(a) * q * d, r()], j * 6);
    }
    this.ph = ph;
    // the jobs: every slot's first picture first, then the rest, one per idle moment
    const jobs: [number, number][] = [];
    const most = Math.max(...b.slots.map((s) => s.pics.length));
    for (let k = 0; k < most; k++) b.slots.forEach((s, i) => { if (k < s.pics.length) jobs.push([i, k]); });
    const rho: number[] = [];
    let idxOne: Uint16Array | null = null;
    const idle = (fn: () => void) => {
      const ric = (window as unknown as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
      if (ric) ric(fn, { timeout: 400 }); else setTimeout(fn, 30);
    };
    Promise.all(b.slots.map((s) => Promise.all(s.pics.map(picture)))).then((loaded) => {
      if (gen !== this.gen) return;
      const next = () => {
        if (gen !== this.gen || !jobs.length) return;
        const [i, k] = jobs.shift()!;
        const s = b.slots[i], pic = loaded[i][k];
        const base = { O: b.O, at: s.at, px: s.px, toScreen: b.toScreen, ball: s.ball, span: [0.12, 0.7] as [number, number], size: b.size, N: b.N, seed: 7 + k * 31 + i * 7, shape: b.shape };
        // one ball for all of a slot's pictures: as wide as the widest needs
        if (rho[i] === undefined) rho[i] = Math.max(...loaded[i].map((p) => ballRadius({ ...base, pic: p })));
        const t0 = performance.now();
        const m = shards({ ...base, pic, rho: rho[i] });
        if (import.meta.env.DEV) (window as unknown as { __stArtMs?: number[] }).__stArtMs?.push(Math.round(performance.now() - t0));
        if (m) {
          this.F = m.per * 3;
          if (!idxOne) idxOne = m.idx;
          const ext = Math.max(...loaded[i].map((p) => Math.max(p.box[2], p.box[3])));
          this.sets[i].push(ordered(m, ext));
        } else if (k === 0) this.sets[i].push({ pos: new Float32Array(b.N * this.F), nrm: new Float32Array(b.N * this.F) });
        if (!this.ready && idxOne && this.sets.every((x) => x.length)) {
          this.ready = true;
          // one index buffer for all slots: the first set's pattern, repeated
          const one = idxOne, verts = this.F / 3, ipe = one.length / b.N;
          const idx = new Uint16Array(ipe * total);
          for (let j = 0; j < total; j++) for (let q = 0; q < ipe; q++) idx[j * ipe + q] = one[(j % b.N) * ipe + q] - (j % b.N) * verts + j * verts;
          this.live = new Float32Array(total * this.F);
          this.liveN = new Float32Array(total * this.F);
          this.mesh = { pos: this.live, nrm: this.liveN, idx };
          this.frame(0, 1, 0);
          onMesh(this.mesh);
        }
        idle(next);
      };
      idle(next);
    }).catch(() => {});
  }

  /** this frame's shards: t (s) runs the pictures' sequence, come (0..1) gathers them in from a scatter, sc the scale,
   *  Ol where the light leaves the glass now. The pointer turns the prism and moves that point a little: each shard
   *  then slides with it by as much as keeps its own shadow where it was (the nearer the light, the more), so the
   *  picture on the floor holds while the ball sways */
  frame(t: number, come: number, sc: number, Ol: V3 = this.O, drift = 0.09) {
    const P = this.live, Nn = this.liveN, ph = this.ph, F = this.F;
    if (!this.ready || !P || !Nn || !ph) return false;
    const Ob = this.O, away = 1 - come, dO = [Ol[0] - Ob[0], Ol[1] - Ob[1], Ol[2] - Ob[2]];
    let j0 = 0;
    this.sets.forEach((sets, si) => {
      const slot = this.slots[si], n = this.N;
      // the sequence starts once all of a slot's pictures are in (until then the first holds)
      const m = sets.length === slot.pics.length ? sets.length : 1;
      const hold = (k: number) => slot.hold?.[k] ?? HOLD, morph = (k: number) => slot.morph?.[k] ?? MORPH;
      let per = 0;
      for (let k = 0; k < m; k++) per += hold(k) + (m > 1 ? morph(k) : 0);
      let tt = m > 1 ? ((t % per) + per) % per : 0, cur = 0, mo = 0;
      for (let k = 0; k < m; k++) {
        if (tt < hold(k)) { cur = k; mo = 0; break; }
        tt -= hold(k);
        if (tt < morph(k)) { cur = k; mo = tt / morph(k); break; }
        tt -= morph(k);
      }
      const a = sets[cur], b = sets[(cur + 1) % m];
      for (let j = 0; j < n; j++) {
        const g = (j0 + j) * 6;
        const mj = mo > 0 ? smooth(Math.min(1, Math.max(0, mo * 1.5 - ph[g + 5] * 0.5))) : 0;
        const k = 1 + drift * Math.sin(ph[g + 1] * 0.6 * t + ph[g]);
        const ox = ph[g + 2] * away * sc, oy = ph[g + 3] * away * sc, oz = ph[g + 4] * away * sc;
        const o = j * F, L = (j0 + j) * F;
        // how far along its ray from the light the shard hangs (0 at the light, 1 on the floor)
        const yc = a.pos[o + 1] + (b.pos[o + 1] - a.pos[o + 1]) * mj, fr = Math.min(1, Math.max(0, 1 - yc / Math.max(Ob[1], 1e-3)));
        const sx = dO[0] * (1 - fr), sy = dO[1] * (1 - fr), sz = dO[2] * (1 - fr);
        for (let v = 0; v < F; v += 3) {
          const x = a.pos[o + v] + (b.pos[o + v] - a.pos[o + v]) * mj;
          const y = a.pos[o + v + 1] + (b.pos[o + v + 1] - a.pos[o + v + 1]) * mj;
          const z = a.pos[o + v + 2] + (b.pos[o + v + 2] - a.pos[o + v + 2]) * mj;
          P[L + v] = Ol[0] + (x + sx - Ol[0]) * k + ox;
          P[L + v + 1] = Ol[1] + (y + sy - Ol[1]) * k + oy;
          P[L + v + 2] = Ol[2] + (z + sz - Ol[2]) * k + oz;
          Nn[L + v] = a.nrm[o + v] + (b.nrm[o + v] - a.nrm[o + v]) * mj;
          Nn[L + v + 1] = a.nrm[o + v + 1] + (b.nrm[o + v + 1] - a.nrm[o + v + 1]) * mj;
          Nn[L + v + 2] = a.nrm[o + v + 2] + (b.nrm[o + v + 2] - a.nrm[o + v + 2]) * mj;
        }
      }
      j0 += n;
    });
    return true;
  }

  get positions() { return this.live; }
  get normals() { return this.liveN; }
}
