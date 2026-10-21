#!/usr/bin/env node
/**
 * Local review of the site: the dev server, following the `review` branch.
 * Every change pushed to `review` shows up here within a few seconds (Vite reloads it in place).
 *
 *   npm run live      start (opens the browser)
 *   Ctrl+C            stop
 *
 * LIVE_BRANCH=<name> follows another branch; PORT=<n> serves on another port.
 * Production is `main` only (Vercel); nothing here deploys anything.
 */
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

const BRANCH = process.env.LIVE_BRANCH || "review";
const PORT = process.env.PORT || "5173";
const EVERY = 4000;
const win = process.platform === "win32";

const git = (...args) => execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
const say = (s) => console.log(`\n\x1b[38;2;246;200;140m●\x1b[0m ${s}\n`);

let vite = null;
let restarting = false;

function install() {
  say("Ставлю залежності (npm ci)…");
  const r = spawnSync(win ? "npm.cmd" : "npm", ["ci", "--no-audit", "--no-fund"], { stdio: "inherit" });
  if (r.status !== 0) { say("npm ci не пройшов, деталі вище."); process.exit(1); }
}

function startVite(open) {
  const args = ["vite", "--host", "127.0.0.1", "--port", PORT, "--strictPort"];
  if (open) args.push("--open");
  vite = spawn(win ? "npx.cmd" : "npx", args, { stdio: "inherit" });
  vite.on("exit", (code) => { if (!restarting) process.exit(code ?? 0); });
}

// stand on the review branch
try {
  if (git("rev-parse", "--abbrev-ref", "HEAD") !== BRANCH) {
    git("fetch", "-q", "origin", BRANCH);
    git("checkout", "-q", BRANCH);
  }
} catch {
  say(`Не вдалося перейти на гілку ${BRANCH}, лишаюсь на поточній.`);
}

if (!existsSync("node_modules")) install();
startVite(true);
say(`Сайт: http://127.0.0.1:${PORT}/  ·  стежу за гілкою ${BRANCH}, нові правки підтягнуться самі.`);

// follow the branch: a cheap ls-remote every few seconds, a fast-forward when it moved
let warned = false;
setInterval(() => {
  try {
    const remote = git("ls-remote", "origin", `refs/heads/${BRANCH}`).split(/\s+/)[0];
    const head = git("rev-parse", "HEAD");
    if (!remote || remote === head) return;
    git("fetch", "-q", "origin", BRANCH);
    git("merge", "--ff-only", "-q", `origin/${BRANCH}`);
    warned = false;
    const changed = git("diff", "--name-only", head, "HEAD").split("\n");
    if (changed.includes("package-lock.json")) {
      restarting = true;
      vite?.kill("SIGTERM");
      install();
      startVite(false);
      restarting = false;
    }
    say(`Оновлено: ${git("log", "-1", "--format=%s")}`);
  } catch {
    if (!warned) {
      warned = true;
      say("Не можу підтягнути зміни (немає мережі або є локальні правки). Пробую далі.");
    }
  }
}, EVERY);

const stop = () => { restarting = true; vite?.kill("SIGTERM"); process.exit(0); };
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
