# CLAUDE.md — Portfolio Comparison

A standalone React 19 + Vite **PWA** that tracks portfolio export prices over time
(supports TCGplayer and Collectr Pro exports). **It is also embedded into the
ShinyCardboard site.**

## How it fits the ShinyCardboard ecosystem

- Deploys as its **own Vercel project**, and is **proxied** by the website at
  **`shinycardboard.win/portfolio`** (a `vercel.json` rewrite in the website repo
  points there). Pushing here goes live on the site with **no website push**.
- Because it's served same-origin under the main domain, it **shares the site's
  Google login** and serves the **same Adsterra ads** on the approved domain.
- Full architecture: see `CLAUDE.md` in the **ShinyCardboard-Website** repo (the
  hub) + its `docs/PROJECT_INTEGRATION.md`.

## Integration-specific things to know before editing

- `vite.config.ts` builds under `base: '/portfolio/'` in production (dev stays
  `/`). Don't hardcode absolute `/asset` or `/api` paths — use
  `import.meta.env.BASE_URL` (see `src/priceLookup.ts` for the API-call pattern).
- **PWA:** `vite-plugin-pwa` is scoped to `/portfolio/` (`base`, `scope`,
  `start_url`, and `navigateFallback` all under `/portfolio/`) so the service
  worker works behind the proxy. Test SW behavior in a real browser after deploy.
- Shared kit (keep in sync with Grading-Calculator): `src/config/firebase.ts`,
  `src/services/entitlements.ts`, `src/hooks/useAdFree.ts`, `src/config/ads.ts`,
  `src/components/Adsterra*.tsx`, `src/components/AdSlots.tsx`. Ads are hidden only
  for gold/platinum/pro tiers (Silver still sees ads).
- `<AdSlots/>` renders the bottom-of-page ads (see `src/App.tsx`).
- The Vercel project needs the same `VITE_FIREBASE_*` env vars as the website.

Branch for integration work: `claude/shinycardboard-project-integration-tg1db7`.
