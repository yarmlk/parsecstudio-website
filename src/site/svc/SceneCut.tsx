import { useEffect, useRef } from "react";
import { kelvinRGB } from "../../ui/LightField";
import type { SceneProps } from "./types";
import { CUT_FRAG, CUT_VERT } from "./SceneCut.shader";

/* Motion, 3D & CGI — "light makes the form".
   The cover's arc in real 3D: a thin 3500 K slit cut into a satin-black floor, curving round behind and under a glossy
   black ceramic product (from the camera it is the cover's ∩, with its bloom and its haze). The product exists only where
   that light reaches it — rims and specular lines, its glass catching the glow, nothing else; before the light it is
   only the thing that cuts the light. It slowly becomes one product and then another (device slab → lens → can → slab),
   long eased morphs plus a slow sway, never a loop you can see. The pointer moves the hot part of the slit (and the
   camera a few degrees) with the cover's inertia, so the highlights slide over the surface. Shader: SceneCut.shader.ts. */

type V3 = [number, number, number];
interface Form { b: V3; rc: number; re: number; lens: number; yaw: number; pitch: number }

/* local frame: rounded rect in XY, extruded along Z, front = -Z (towards the camera when unrotated) */
const SLAB: Form = { b: [0.25, 0.5, 0.05], rc: 0.09, re: 0.05, lens: 0, yaw: -0.95, pitch: 0.05 };
const LENS: Form = { b: [0.4, 0.4, 0.085], rc: 0.4, re: 0.05, lens: 1, yaw: -0.8, pitch: 0.1 };
const CAN: Form = { b: [0.29, 0.29, 0.45], rc: 0.29, re: 0.06, lens: 0, yaw: 0, pitch: Math.PI / 2 }; // round; yaw 0 = it tips straight towards us
/* the cycle, every step a morph of one form's parameters (no blending of fields, so no creases):
   slab -> lens: a lens grows out of the slab's face as it rounds out;  lens -> can: the lens tips back and draws out
   into a can (the lens on its lid);  can -> slab: the can tips towards us, its lid becomes the screen, and only then
   does the slab turn its glass to the light (`stagger`) */
const CYCLE: { form: Form; stagger: boolean }[] = [{ form: SLAB, stagger: false }, { form: LENS, stagger: false }, { form: CAN, stagger: true }];
const HOLD = 3.4, MORPH = 2.8, PERIOD = HOLD + MORPH;   // a new product every ~6 s

function bezier(x1: number, y1: number, x2: number, y2: number) {
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
  const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  return (x: number) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let t = x;
    for (let i = 0; i < 6; i++) {
      const fx = ((ax * t + bx) * t + cx) * t - x;
      const d = (3 * ax * t + 2 * bx) * t + cx;
      if (Math.abs(d) < 1e-6) break;
      t = Math.min(1, Math.max(0, t - fx / d));
    }
    return ((ay * t + by) * t + cy) * t;
  };
}
const easeEnter = bezier(0.2, 0.7, 0.1, 1);
const easeMove = bezier(0.45, 0, 0.2, 1);
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** world -> local rotation (column-major mat3) for a form turned by yaw (about Y) after pitch (about X) */
function rotWL(yaw: number, pitch: number): Float32Array {
  const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
  // M = Ry * Rx (local -> world), rows:
  const m = [
    [cy, sy * sp, sy * cp],
    [0, cp, -sp],
    [-sy, cy * sp, cy * cp],
  ];
  // R = M^T (world -> local); column-major storage of R = row-major storage of M
  return new Float32Array([m[0][0], m[0][1], m[0][2], m[1][0], m[1][1], m[1][2], m[2][0], m[2][1], m[2][2]]);
}

/** t = shape and tip, ty = turn (yaw) */
function mixForm(a: Form, b: Form, t: number, ty: number): Form {
  return {
    b: [lerp(a.b[0], b.b[0], t), lerp(a.b[1], b.b[1], t), lerp(a.b[2], b.b[2], t)],
    rc: lerp(a.rc, b.rc, t), re: lerp(a.re, b.re, t), lens: lerp(a.lens, b.lens, t),
    yaw: lerp(a.yaw, b.yaw, ty), pitch: lerp(a.pitch, b.pitch, t),
  };
}

/** harmless debug hook (screenshots): freeze the scene clock, the ignite clock, the pointer */
interface Debug { t?: number; ign?: number; hot?: number; hy?: number }
declare global { interface Window { __stCut?: Debug } }

export function SceneCut({ on, mode }: SceneProps) {
  const boxRef = useRef<HTMLDivElement | null>(null);
  const onRef = useRef(on);
  const api = useRef<{ setOn: (v: boolean) => void } | null>(null);

  useEffect(() => {
    onRef.current = on;
    api.current?.setOn(on);
  }, [on]);

  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const canvas = document.createElement("canvas");
    canvas.setAttribute("aria-hidden", "true");
    canvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%;display:block";
    const gl = canvas.getContext("webgl2", { antialias: false, alpha: false, premultipliedAlpha: false, powerPreference: "high-performance" });
    if (!gl) return; // no WebGL: the stage stays dark
    const sh = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) console.warn("SceneCut shader:", gl.getShaderInfoLog(s));
      return s;
    };
    const prog = gl.createProgram()!;
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, CUT_VERT));
    gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, CUT_FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) { gl.getExtension("WEBGL_lose_context")?.loseContext(); return; }
    box.appendChild(canvas);
    gl.useProgram(prog);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, "a");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const names = ["uRes", "uCore", "uTime", "uCam", "uCamM", "uF", "uShift", "uArc", "uIgn", "uGrain", "uSoft", "uWarm", "uCoreCol",
      "uR", "uB", "uE", "uObj"] as const;
    const U = Object.fromEntries(names.map((n) => [n, gl.getUniformLocation(prog, n)])) as Record<(typeof names)[number], WebGLUniformLocation | null>;

    const mob = mode === "mob";
    /* framing: where the object sits in the frame (0..1 from left / bottom), its distance, the lens */
    const FR = mob
      ? { sx: 0.775, sy: 0.56, dist: 7.8, h: 0.85, f: 1.5, soft: 1, light: 0.78, haze: 0.75 }
      : { sx: 0.71, sy: 0.5, dist: 4.4, h: 0.85, f: 1.6, soft: 0, light: 1, haze: 0.9 };
    const OBJ: V3 = [0, 0.6, 0];
    const warm = kelvinRGB(3500);
    const cc = kelvinRGB(5200);
    gl.uniform3f(U.uWarm, warm[0], warm[1], warm[2]);
    gl.uniform3f(U.uCoreCol, Math.min(1, cc[0] + 0.02), Math.min(1, cc[1] + 0.08), Math.min(1, cc[2] + 0.2));
    gl.uniform1f(U.uGrain, 0.03);
    gl.uniform1f(U.uSoft, FR.soft);
    gl.uniform4f(U.uObj, OBJ[0], OBJ[1], OBJ[2], 0.64);

    const reduce = !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    let raf = 0, visible = true, running = false, dpr = 1;
    let last = performance.now();
    let sceneT = 1.2;                 // s of scene life (morph clock, haze); only advances while running
    let ignT = reduce ? 10000 : 0;    // ms since the light was switched on
    let offAt = -1;
    let hot = 0.5, hotT = 0.5, hy = 0.5, hyT = 0.5;
    /* resolution governor: if a weak GPU cannot hold ~60 fps, step the pixel ratio down twice at most (never back up) */
    let quality = 1, slow = 0, frames = 0;

    const resize = () => {
      const r = box.getBoundingClientRect();
      const base = Math.min(window.devicePixelRatio || 1, 1.5);
      dpr = Math.min(base, Math.sqrt(2_600_000 / Math.max(1, r.width * r.height))) * quality;
      canvas.width = Math.max(2, Math.round(r.width * dpr));
      canvas.height = Math.max(2, Math.round(r.height * dpr));
      gl.viewport(0, 0, canvas.width, canvas.height);
    };

    const draw = () => {
      const dbg = window.__stCut;
      const T = dbg?.t ?? sceneT;
      const ig = dbg?.ign ?? ignT;
      const hs = dbg?.hot ?? hot;
      const hv = dbg?.hy ?? hy;
      const W = canvas.width, H = canvas.height, aspect = W / H;

      /* ignite: light first, the arc opens out from its hot spot, the form follows */
      const light = easeEnter(clamp01(ig / 600)) * FR.light;
      const open = easeMove(clamp01(ig / 1300));
      const form = easeEnter(clamp01((ig - 120) / 1100));
      const haze = easeEnter(clamp01((ig - 80) / 1600)) * FR.haze;

      /* camera: a few degrees with the pointer, verticals stay vertical (lens shift places the object) */
      const th = (hs - 0.5) * -0.1;
      const ch = FR.h + (hv - 0.5) * -0.12;
      const cam: V3 = [OBJ[0] - Math.sin(th) * FR.dist, ch, OBJ[2] - Math.cos(th) * FR.dist];
      const fw: V3 = [Math.sin(th), 0, Math.cos(th)];
      const rt: V3 = [Math.cos(th), 0, -Math.sin(th)];
      const v: V3 = [OBJ[0] - cam[0], OBJ[1] - cam[1], OBJ[2] - cam[2]];
      const z = v[0] * fw[0] + v[2] * fw[2];
      const px = FR.f * (v[0] * rt[0] + v[2] * rt[2]) / z, py = FR.f * v[1] / z;
      const shift: [number, number] = [(FR.sx - 0.5) * aspect - px, FR.sy - 0.5 - py];

      /* the lit part of the slit: from just left of the object round the back to the right; the hot spot follows the pointer */
      const arcL = mob ? -0.95 : -1.22, arcR = 2.3;
      const arcHot = 0.3 + (hs - 0.5) * (hs < 0.5 ? 1.2 : 1.6);   // travels less far towards the type

      /* the form: hold, then a long eased morph into the next product; a slow sway on top */
      const k = Math.floor(T / PERIOD);
      const ph = T - k * PERIOD;
      const i = ((k % CYCLE.length) + CYCLE.length) % CYCLE.length;
      const u = ph < HOLD ? 0 : (ph - HOLD) / MORPH;
      const st = CYCLE[i].stagger;
      const m = easeMove(st ? clamp01(u / 0.72) : u);
      const my = easeMove(st ? clamp01((u - 0.38) / 0.62) : u);
      const sway = 0.2 * Math.sin(T * 2 * Math.PI / 37) + 0.07 * Math.sin(T * 2 * Math.PI / 17 + 1.3);
      const fm = mixForm(CYCLE[i].form, CYCLE[(i + 1) % CYCLE.length].form, m, my);

      gl.uniform2f(U.uRes, W, H);
      gl.uniform1f(U.uCore, 1.2 * dpr);
      gl.uniform1f(U.uTime, T);
      gl.uniform3f(U.uCam, cam[0], cam[1], cam[2]);
      gl.uniformMatrix3fv(U.uCamM, false, new Float32Array([rt[0], rt[1], rt[2], 0, 1, 0, fw[0], fw[1], fw[2]]));
      gl.uniform1f(U.uF, FR.f);
      gl.uniform2f(U.uShift, shift[0], shift[1]);
      gl.uniform3f(U.uArc, arcL, arcR, arcHot);
      gl.uniform4f(U.uIgn, light, open, form, haze);
      gl.uniformMatrix3fv(U.uR, false, rotWL(fm.yaw + sway, fm.pitch));
      gl.uniform4f(U.uB, fm.b[0], fm.b[1], fm.b[2], fm.rc);
      gl.uniform2f(U.uE, fm.re, fm.lens);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };

    const loop = (now: number) => {
      const dt = Math.min(0.25, Math.max(0, (now - last) / 1000));
      last = now;
      sceneT += Math.min(dt, 0.05);
      ignT += dt * 1000;
      const a = 1 - Math.pow(1 - 0.035, dt * 60);   // the cover's inertia, frame-rate independent
      hot += (hotT - hot) * a;
      hy += (hyT - hy) * a;
      if (++frames > 20 && quality > 0.7 && !window.__stCut) {
        slow = dt > 0.021 ? slow + 1 : Math.max(0, slow - 2);
        if (slow > 24) { quality *= 0.82; slow = 0; frames = 0; resize(); }
      }
      draw();
      raf = requestAnimationFrame(loop);
    };
    const start = () => {
      if (running || reduce || !visible || document.hidden || !onRef.current) return;
      running = true;
      last = performance.now();
      frames = 0;
      raf = requestAnimationFrame(loop);
    };
    const stop = () => { running = false; cancelAnimationFrame(raf); };

    resize();
    draw();
    const ro = new ResizeObserver(() => { resize(); draw(); });
    ro.observe(box);
    const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible) start(); else stop(); });
    io.observe(box);
    const onMove = (e: PointerEvent) => {
      const r = box.getBoundingClientRect();
      if (r.width < 2) return;
      hotT = Math.max(0.1, Math.min(0.9, (e.clientX - r.left) / r.width));
      hyT = Math.max(0, Math.min(1, (e.clientY - r.top) / r.height));
      if (reduce) { hot = hotT; hy = hyT; draw(); }
    };
    window.addEventListener("pointermove", onMove);
    const onVis = () => { if (document.hidden) stop(); else start(); };
    document.addEventListener("visibilitychange", onVis);

    api.current = {
      setOn: (v) => {
        if (v) {
          // re-lit while the stage is still fading the old frame out: stay lit (no retracting arc), the stage fades it
          // back in; after a real absence the light ignites again
          const back = offAt >= 0 && performance.now() - offAt < 700;
          ignT = reduce || back ? 10000 : 0;
          offAt = -1;
          draw();
          start();
        } else {
          offAt = performance.now();
          stop();
        }
      },
    };
    if (onRef.current) start();

    return () => {
      stop();
      api.current = null;
      ro.disconnect();
      io.disconnect();
      window.removeEventListener("pointermove", onMove);
      document.removeEventListener("visibilitychange", onVis);
      gl.getExtension("WEBGL_lose_context")?.loseContext();
      canvas.remove();
    };
  }, [mode]);

  return <div ref={boxRef} className="st-stage__fill" />;
}
