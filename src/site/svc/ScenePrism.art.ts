/* A service's shadow art on the stage: one or more balls of shards (slots), each casting a picture, or a cycle of
   pictures that the shards morph between. Built for the light's origin and the camera of the current layout, a picture
   at a time when the page is idle; animated on the CPU each frame (one dynamic mesh). */

import { ballRadius, loadPicture, shards, type Picture } from "./ScenePrism.carve";
import type { Mesh } from "./ScenePrism.objects";

type V3 = [number, number, number];

export interface ArtSlot {
  /** the pictures, in the order they follow each other (one: it holds) */
  pics: string[];
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
}

const pics = new Map<string, Promise<Picture>>();
const picture = (url: string) => {
  let p = pics.get(url);
  if (!p) { p = loadPicture(url); pics.set(url, p); }
  return p;
};

/** how long each picture holds and how long the shards take to become the next (s) */
const HOLD = 2.6, MORPH = 1.6;
const SH = 36; // floats per shard (4 faces × 3 vertices × xyz)

const smooth = (x: number) => x * x * (3 - 2 * x);

export class ShadowArt {
  key = "";
  private gen = 0;
  /** per slot, the shard sets built so far (positions, normals), one per picture in order */
  private sets: { pos: Float32Array; nrm: Float32Array }[][] = [];
  private O: V3 = [0, 0, 0];
  private ph: Float32Array | null = null;
  private live: Float32Array | null = null;
  private liveN: Float32Array | null = null;
  private slotN: number[] = [];
  private slotPics: number[] = [];
  /** set when the first picture of every slot is in: the mesh exists from then on */
  ready = false;
  /** the mesh (static index buffer) to hand to the renderer when it changes size */
  mesh: Mesh | null = null;

  /** start building for this layout (drops any build in progress) */
  build(key: string, b: ArtBuild, onMesh: (m: Mesh) => void) {
    if (key === this.key) return;
    this.key = key;
    const gen = ++this.gen;
    this.sets = b.slots.map(() => []);
    this.slotN = b.slots.map(() => b.N);
    this.slotPics = b.slots.map((s) => s.pics.length);
    this.ready = false;
    this.O = b.O;
    const total = b.N * b.slots.length;
    // each shard: drift phase and speed, where it flies in from, its delay when morphing
    const ph = new Float32Array(total * 6);
    let sd0 = 11;
    const r = () => { sd0 = (sd0 * 16807) % 2147483647; return sd0 / 2147483647; };
    for (let j = 0; j < total; j++) {
      const a = r() * Math.PI * 2, z = r() * 2 - 1, q = Math.sqrt(1 - z * z), d = 0.12 + 0.3 * r();
      ph.set([r() * Math.PI * 2, 0.5 + 0.5 * r(), Math.cos(a) * q * d, Math.abs(z) * d * 0.6, Math.sin(a) * q * d, r()], j * 6);
    }
    this.ph = ph;
    this.live = new Float32Array(total * SH);
    this.liveN = new Float32Array(total * SH);
    const idx = new Uint16Array(total * 12);
    for (let i = 0; i < idx.length; i++) idx[i] = i;
    // the jobs: every slot's first picture first, then the rest, one per idle moment
    const jobs: [number, number][] = [];
    const most = Math.max(...b.slots.map((s) => s.pics.length));
    for (let k = 0; k < most; k++) b.slots.forEach((s, i) => { if (k < s.pics.length) jobs.push([i, k]); });
    const rho: number[] = [];
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
        const base = { O: b.O, at: s.at, px: s.px, toScreen: b.toScreen, ball: s.ball, span: [0.12, 0.7] as [number, number], size: b.size, N: b.N, seed: 7 + k * 31 + i * 7 };
        // one ball for all of a slot's pictures: as wide as the widest needs
        if (rho[i] === undefined) rho[i] = Math.max(...loaded[i].map((p) => ballRadius({ ...base, pic: p })));
        const m = shards({ ...base, pic, rho: rho[i] });
        if (m) this.sets[i].push({ pos: m.pos, nrm: m.nrm });
        else if (k === 0) { this.sets[i].push({ pos: new Float32Array(b.N * SH), nrm: new Float32Array(b.N * SH) }); }
        if (!this.ready && this.sets.every((x) => x.length)) {
          this.ready = true;
          this.mesh = { pos: this.live!, nrm: this.liveN!, idx };
          this.frame(0, 1, 0);
          onMesh(this.mesh);
        }
        idle(next);
      };
      idle(next);
    }).catch(() => {});
  }

  /** this frame's shards: t (s) runs the pictures' cycle, come (0..1) gathers them in from a scatter, sc the scale */
  frame(t: number, come: number, sc: number, drift = 0.09) {
    const P = this.live, Nn = this.liveN, ph = this.ph;
    if (!this.ready || !P || !Nn || !ph) return false;
    const Ol = this.O, away = 1 - come;
    let j0 = 0;
    this.sets.forEach((sets, si) => {
      // the cycle starts once all of a slot's pictures are in (until then the first holds)
      const n = this.slotN[si], m = sets.length === this.slotPics[si] ? sets.length : 1;
      // which picture holds now and how far the shards are on their way to the next
      const per = HOLD + MORPH, cyc = Math.floor(t / per), ph0 = t - cyc * per;
      const a = sets[((cyc % m) + m) % m], b = sets[((cyc + 1) % m + m) % m];
      const mo = m > 1 ? Math.max(0, (ph0 - HOLD) / MORPH) : 0;
      for (let j = 0; j < n; j++) {
        const g = (j0 + j) * 6;
        const mj = mo > 0 ? smooth(Math.min(1, Math.max(0, mo * 1.6 - ph[g + 5] * 0.6))) : 0;
        const k = 1 + drift * Math.sin(ph[g + 1] * 0.6 * t + ph[g]);
        const ox = ph[g + 2] * away * sc, oy = ph[g + 3] * away * sc, oz = ph[g + 4] * away * sc;
        const o = j * SH, L = (j0 + j) * SH;
        for (let v = 0; v < SH; v += 3) {
          const x = a.pos[o + v] + (b.pos[o + v] - a.pos[o + v]) * mj;
          const y = a.pos[o + v + 1] + (b.pos[o + v + 1] - a.pos[o + v + 1]) * mj;
          const z = a.pos[o + v + 2] + (b.pos[o + v + 2] - a.pos[o + v + 2]) * mj;
          P[L + v] = Ol[0] + (x - Ol[0]) * k + ox;
          P[L + v + 1] = Ol[1] + (y - Ol[1]) * k + oy;
          P[L + v + 2] = Ol[2] + (z - Ol[2]) * k + oz;
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
