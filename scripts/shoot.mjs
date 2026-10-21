#!/usr/bin/env node
/**
 * Headless check of the running dev server in Claude's sandbox (a dev tool, not shipped).
 *
 *   node scripts/shoot.mjs --port 5173 --out <dir> [--mobile] [--wait 6000] [--media <dir>]
 *        [--hover 900,260] [--settle 2500] [--eval "<js before the shot>"]
 *        [--open 0,600,1400,2600,4200] [--click "<selector>"] [--tag name]
 *
 * WebGL runs on SwiftShader. This Chromium cannot decode H.264, so with --media every request for <name>.mp4 is
 * answered with <media>/<name>.webm when that file exists (VP9 copies made with ffmpeg).
 * --hover moves the pointer there (site px of the window) and waits --settle ms before the shot.
 * --open clicks the showreel control and shoots at each of the given ms after the click.
 * Prints the console (errors included) at the end.
 */
import { createRequire } from "node:module";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";

const require = createRequire(import.meta.url);
let pw = null;
for (const p of ["playwright-core", "/opt/node-tools/node_modules/playwright-core", "/opt/npm-tools/node_modules/playwright-core"]) {
  try { pw = require(p); break; } catch { /* next */ }
}
if (!pw) { console.error("playwright-core not found"); process.exit(1); }

const argv = process.argv.slice(2);
const opt = (k, d) => {
  const i = argv.indexOf(`--${k}`);
  if (i < 0) return d;
  const v = argv[i + 1];
  return v != null && !v.startsWith("--") ? v : true;
};
const port = opt("port", "5173");
const out = opt("out", "shots");
const mobile = !!opt("mobile", false);
const wait = Number(opt("wait", 6000));
const media = opt("media", null);
const hover = opt("hover", null);
const settle = Number(opt("settle", 2500));
const evalJs = opt("eval", null);
const openAt = opt("open", null);
const click = opt("click", '[aria-label="Watch the showreel"]');
const tag = opt("tag", mobile ? "mob" : "desk");
const W = mobile ? 390 : 1440, H = mobile ? 844 : 900;
mkdirSync(out, { recursive: true });

const browser = await pw.chromium.launch({
  executablePath: "/opt/pw-browsers/chromium",
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--autoplay-policy=no-user-gesture-required"],
});
const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1, isMobile: mobile, hasTouch: mobile });
const page = await ctx.newPage();
const logs = [];
page.on("console", (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on("pageerror", (e) => logs.push(`[pageerror] ${e.message}`));
if (media) {
  await page.route("**/*.mp4", async (route) => {
    const name = basename(new URL(route.request().url()).pathname, ".mp4");
    const f = join(String(media), `${name}.webm`);
    if (existsSync(f)) await route.fulfill({ status: 200, contentType: "video/webm", body: readFileSync(f) });
    else await route.continue();
  });
}
await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "load" });
await page.waitForTimeout(wait);
if (hover && hover !== true) {
  const [x, y] = String(hover).split(",").map(Number);
  await page.mouse.move(x, y, { steps: 14 });
  await page.waitForTimeout(settle);
}
if (evalJs && evalJs !== true) { await page.evaluate(String(evalJs)); await page.waitForTimeout(400); }
await page.screenshot({ path: join(out, `${tag}-hero.png`) });
if (openAt && openAt !== true) {
  const times = String(openAt).split(",").map(Number);
  await page.click(String(click));
  const t0 = Date.now();
  for (const t of times) {
    const d = t - (Date.now() - t0);
    if (d > 0) await page.waitForTimeout(d);
    await page.screenshot({ path: join(out, `${tag}-open-${t}.png`) });
  }
}
console.log(logs.length ? logs.join("\n") : "(console clean)");
await browser.close();
