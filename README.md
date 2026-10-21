# parsecstudio-website

The Parsec Studio website. Vite + React + TypeScript; no runtime dependencies beyond React.

```sh
npm install
npm run dev      # local, http://127.0.0.1:5173
npm run live     # the same, following the `review` branch (local review before deploy)
npm run build    # typecheck + static build into dist/
```

Deploy: Vercel imports this repo as a Vite project (`vercel.json`). Every push to `main` deploys to production;
work is reviewed on the `review` branch first (see CLAUDE.md).

```
src/site/         the site: Site.tsx, hero/ (the live light), svc/ (service scenes), cases.tsx (cases, player)
src/ui/           shared pieces from the brand book: LightField, Cut, AiFlux, Icons
src/lib/          assets, facts, i18n, types
src/styles/       tokens, base, ui (the Parsec design system)
public/           video/site (films, loops, showreel), img, logo, fonts
```

Colours, type and motion come from the Parsec brand book; change tokens there first.
