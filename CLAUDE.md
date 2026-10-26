# parsecstudio-website — how we work

The Parsec Studio site (Vite + React + TypeScript). Production is `main`, deployed by Vercel to demo.parsec.studio.

## Review before deploy (Vlad's rule)

- **Never push to `main` without Vlad's explicit "yes" in chat.** A push to `main` is a production deploy.
- Work lands on the `review` branch. Vlad runs it on his Mac with `npm run live` (scripts/live.mjs): the dev server on
  http://127.0.0.1:5173 that pulls every push to `review` within seconds. Vercel also builds a preview of `review`
  (not production).
- After a change: commit with a clear message, push to `review`, tell Vlad in a few lines what to look at locally, and
  ask whether to deploy.
- On "yes": fast-forward `main` to `review`, push, check demo.parsec.studio serves the new build.
- Small commits, one idea each, so any of them can be reverted alone.

## Parallel agents

- One git worktree per agent (`git worktree add ../wt-<name> -b wt/<name> review`, `node_modules` symlinked), its own
  dev-server port, and a strict list of files it may edit.
- The lead reviews every diff and the screenshots personally before anything reaches `review`.
- Design alternatives ship as dev-only variants (switch visible only under `import.meta.env.DEV`) so Vlad can compare
  them on localhost; the losers are deleted before deploy.

## Checking the work in Claude's sandbox

- `npm run build` must pass (typecheck + build).
- `node scripts/shoot.mjs --port <p> --out <dir> --media <dir-with-webm-copies>` screenshots desk (1440) or `--mobile`
  (390), can hover, open the showreel and shoot a sequence. The sandbox Chromium has no H.264: pass VP9 `.webm` copies.

## Look

Parsec v2 FINAL look: satin black, one warm 3500 K source, frosted-glass UI, clean type with no effects on text.
No decorative dots or little lines, no AI-sounding copy, restrained numbers. Client-facing copy is English.
