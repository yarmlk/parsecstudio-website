/** cubic-bezier easing (x→y), Newton steps from x */
export function bezier(x1: number, y1: number, x2: number, y2: number) {
  const A = (a: number, b: number) => 1 - 3 * b + 3 * a, B = (a: number, b: number) => 3 * b - 6 * a, C = (a: number) => 3 * a;
  const f = (t: number, a: number, b: number) => ((A(a, b) * t + B(a, b)) * t + C(a)) * t;
  const df = (t: number, a: number, b: number) => 3 * A(a, b) * t * t + 2 * B(a, b) * t + C(a);
  return (x: number) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let t = x;
    for (let i = 0; i < 6; i++) { const d = df(t, x1, x2); if (Math.abs(d) < 1e-6) break; t -= (f(t, x1, x2) - x) / d; }
    t = Math.min(1, Math.max(0, t));
    return f(t, y1, y2);
  };
}
/** the brand's two curves (tokens --ease-enter, --ease-move) */
export const easeEnter = bezier(0.2, 0.7, 0.1, 1);
export const easeMove = bezier(0.45, 0, 0.2, 1);
