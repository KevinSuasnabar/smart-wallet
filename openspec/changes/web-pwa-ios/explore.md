# Exploration: Installable PWA for `packages/web` (iOS Safari, no App Store)

**Change**: `web-pwa-ios` · **Date**: 2026-08-31 · **Phase**: explore (no proposal/spec/code)

## Executive summary

Making `packages/web` an installable PWA for ~2 personal iOS devices is a small, coherent
slice. The app is already a mobile-first SPA (`BottomTabBar`, `min-h-dvh`, `pb-safe`/`pt-safe`
utilities, CloudFront SPA fallback). Two real gaps:

1. **No PWA plumbing** — no `public/` dir, manifest, service worker, icons, or Apple meta tags.
2. **The session does not survive a cold app launch** — tokens live in `sessionStorage`, which
   iOS wipes when the installed standalone app is killed from the app switcher.

Auth is in-app Cognito SDK username/password. The "standalone OAuth redirect loses session"
trap does **not** apply (confirmed: no `/auth/callback` route; `LoginPage` uses client-side
`navigate(from, { replace: true })` only).

Recommended tooling: `vite-plugin-pwa@1.3.0` (Workbox). Its `peerDependencies` are
vite `^3 || 4 || 5 || 6 || 7 || 8`, so Vite 6 is supported.

## 1. Current web app shape

- Entry `src/main.tsx` → `<Providers>` (`ErrorBoundary` > `QueryClientProvider` > `BrowserRouter`
  > `AuthProvider` > `ApiClientBridge` + `<Toaster position="top-center" richColors />`) → `<AppRouter>`.
- `src/app/AppRouter.tsx`: `BrowserRouter` (history API). Public `/login`, `/forgot-password[/confirm]`;
  everything else behind `ProtectedRoute` > `AppLayout`; `*` → `NotFoundPage`.
- `src/app/layouts/ProtectedRoute.tsx`: while `isLoading` renders "Cargando…"; if `!user` →
  `<Navigate to={/login}>`. This is exactly what fires on every cold PWA launch today.
- `src/app/layouts/AppLayout.tsx`: `min-h-dvh`, desktop `Sidebar`, mobile `BottomTabBar`
  (`md:hidden`), `<main class="… pb-28 …">`.
- Env `src/lib/env.ts`: `import.meta.env.VITE_*` dot-notation only, `requireValue` throws on
  missing; baked at build time by `deploy-frontend.yml` from SSM. No runtime env access — fine for PWA.
- API client `src/lib/api/client.ts`: module singleton, `configure({ getToken, refresh })` called
  by `ApiClientBridge` on every `idToken` change; token attached as `Authorization: Bearer <idToken>`;
  single-flight refresh on 401 → one retry. No offline handling — a dropped network throws and
  surfaces only via React Query error states.
- Fonts: Inter + JetBrains Mono loaded from Google Fonts CDN in `index.html` — a runtime
  cross-origin dependency that won't work offline unless self-hosted or runtime-cached.
- Icons: `index.html` references `/favicon.svg` but there is **no `public/` dir**, so it currently 404s.
- `index.html`: `lang="es"`, viewport **without** `viewport-fit=cover`, `theme-color #000000`
  (app canvas is cream/navy — mismatch), no Apple meta tags, no manifest link.

## 2. Auth / session lifecycle (load-bearing finding)

Bootstrap (`AuthProvider.tsx` mount effect): `readPersisted()` reads key `smart-wallet:auth:v1`
from **`sessionStorage`** → `{ username, idToken, refreshToken }`. Absent → `user: null` →
redirect `/login`. Present → decode `idToken` JWT payload (no verification), rebuild
`cognitoUserRef` via `new CognitoUser({ Username, Pool })`, set state. **No network call on boot.**

Refresh path (`refreshSession`, and `client.ts` on 401): uses `persisted.refreshToken` →
`new CognitoRefreshToken()` → `cognitoUser.refreshSession(...)` → writes new `idToken` via
`writePersisted({ ...persisted, idToken })`. Single-flight guarded. Works across reloads **as long
as `sessionStorage` still holds the refresh token**.

Cognito token validity (`packages/infra-cdk/src/constructs/UserPool.ts`): `addClient('AppClient')`
sets `authFlows.userPassword + userSrp`, `generateSecret: false`, and does **not** set
`accessTokenValidity` / `idTokenValidity` / `refreshTokenValidity` → defaults apply:
**ID/access token = 1 hour, refresh token = 30 days**, no refresh-token rotation.
`amazon-cognito-identity-js` v6 keeps the same refresh token for its whole window.

**What breaks when `sessionStorage` is wiped between launches**: `readPersisted()` returns `null`,
so the installed PWA forces a full username/password login on every cold start (iOS clears
`sessionStorage` when the standalone app is terminated from the app switcher; a background/foreground
switch keeps it). This is the single biggest UX blocker.

**Concrete fix direction (do NOT implement here)**: move the persisted-auth blob off
`sessionStorage`. Minimal: change `src/features/auth/sessionStorage.ts` `readPersisted` /
`writePersisted` / `clearPersisted` to `localStorage` (keep the `smart-wallet:auth:v1` key and the
try/catch). That alone yields ~30 days of silent re-auth via the stored refresh token; boot flow,
`ProtectedRoute`, and `ApiClientBridge` need no changes. IndexedDB is over-engineering for a
3-field blob. Security tradeoff: `localStorage` persists an XSS-exfiltratable refresh token longer —
acceptable for a closed-signup, 2-device personal app; note it, don't block. Optional later cleanup:
rename `sessionStorage.ts` → `authStorage.ts`.

## 3. PWA gaps

- No `public/` dir (needed for manifest, icons, `apple-touch-icon`, splash images, `favicon.svg`,
  `robots.txt`).
- No Web App Manifest: need `name`, `short_name`, `start_url` (`/` or `/dashboard`), `scope` `/`,
  `display: standalone`, `background_color`, `theme_color` (align with the real palette, not
  `#000000`), `icons` (192, 512, 512-maskable), `lang: es`, `orientation: portrait`.
- No service worker: Workbox precache of the Vite build + SPA `navigateFallback` to `index.html` +
  runtime cache for Google Fonts (or self-host). API calls stay **network-only** — financial data
  must not be served stale.
- Icons/splash: no `apple-touch-icon` (PNG 180×180, opaque — iOS ignores SVG and transparency);
  no `apple-touch-startup-image` (optional). **No source logo/icon asset exists in the repo** —
  blocks icon generation.
- Apple meta tags missing: `apple-mobile-web-app-capable` (+ modern `mobile-web-app-capable`),
  `apple-mobile-web-app-status-bar-style`, `apple-mobile-web-app-title`.
- `viewport-fit=cover` missing → `env(safe-area-inset-*)` resolves to `0` on iOS; the existing
  `.pb-safe` / `.pt-safe` utilities in `globals.css` are effectively dead until this is added.
  `BottomTabBar` already applies `pb-safe`; `AppLayout` `<main>` uses `pb-28`.
- No offline fallback page (reuse existing `ErrorState` / `GenericErrorScreen` common components).
- No update UX. `sonner` **is wired** (`<Toaster>` in `src/app/Providers.tsx`,
  `components/ui/sonner.tsx`, `toast` used in 20+ files) → an "update available → reload" toast via
  `vite-plugin-pwa`'s `virtual:pwa-register` `onNeedRefresh` is a natural fit.

## 4. Tooling options

| Approach                                            | Pros                                                                                                                                                                                                                                                                   | Cons                                                                                                                                                                                       | Effort   |
| --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------- |
| **`vite-plugin-pwa@1.3.0` (Workbox)** — recommended | Official Vite plugin, Vite 6 supported; auto-generates manifest + `sw.js` + precache from the real build graph (hashed `assets/[name]-[hash].js` handled); `virtual:pwa-register` hooks pair with existing `sonner`; `injectManifest` escape hatch; dev-mode SW option | New dependency + Workbox transitive deps; SW build is a second bundling pass; cache-strategy decisions to make                                                                             | Low–Med  |
| Hand-rolled SW + static manifest                    | Zero deps; full control                                                                                                                                                                                                                                                | Must hand-maintain precache list against hashed filenames (brittle every deploy); reimplement `navigateFallback` / versioning / update messaging; more review surface for a solved problem | Med–High |
| Manifest + Apple tags only, no SW                   | Smallest change; makes Add-to-Home-Screen work with icon + standalone chrome                                                                                                                                                                                           | Not a true PWA; no offline; no update control. Good as phase 0 only                                                                                                                        | Very Low |

`vite.config.ts` interplay: `define: { global: 'globalThis' }` and `optimizeDeps.esbuildOptions.define`
exist only for the Cognito SDK in app code; the SW doesn't import Cognito, so no conflict. Custom
`rollupOptions.output` naming is compatible with Workbox precache. Plugin order: `VitePWA()` after
`react()`. `optimizeDeps` untouched.

Local HTTPS for on-device SW testing: SW requires a secure context; `localhost` is exempt on the dev
machine, but a physical iPhone over LAN is not. Use `vite-plugin-mkcert` / `@vitejs/plugin-basic-ssl`
for `vite --host` + `vite preview`, or a tunnel (`cloudflared` / ngrok) for a real cert + public URL.
Most faithful test: `pnpm --filter web build && vite preview` behind a tunnel, then Add to Home
Screen; final validation against the deployed CloudFront URL.

## 5. iOS-specific constraints

- Manual install only — no `beforeinstallprompt`. Show an in-app "Share → Add to Home Screen" hint
  only when `!navigator.standalone && iOS Safari`. No install button.
- `display: standalone` on iOS: no URL bar and **no swipe-back gesture** → deep sub-pages (e.g.
  `/wallets/:id/edit`) need an explicit in-app back affordance; audit `PageHeader` usage (flag for propose).
- Push: requires the site installed to the Home Screen first, iOS 16.4+, and a user-gesture
  permission prompt. Deferred — correct.
- Storage eviction: installed PWAs are exempt from the 7-day script-writable-storage cap but **not**
  from storage-pressure eviction. `localStorage` tokens are durable in practice; the 401 → refresh →
  (fail) → `/login` path is the correct backstop and already exists.
- Icon: iOS uses `apple-touch-icon` (PNG 180×180, no transparency, no SVG). Manifest `icons` alone
  are not honored for the Home Screen icon on older iOS.
- Splash: `apple-touch-startup-image` per-device media queries; optional/cosmetic (white flash
  without). `@vite-pwa/assets-generator` can emit these.
- Safe-area: needs `viewport-fit=cover`, then `env(safe-area-inset-*)` feed the existing `.pb-safe`
  / `.pt-safe`.
- `start_url`: same-origin `/` (redirects to `/dashboard`).
- `apple-mobile-web-app-status-bar-style`: `default` (readable) vs `black-translucent` (content
  under the bar, needs safe-area). Pick `default` unless design wants edge-to-edge.

## 6. Hosting / deploy impact (flag only, do not design)

`infra-cdk/src/constructs/WebDistribution.ts`: private S3 + CloudFront + OAC;
`defaultRootObject: index.html`; `/index.html` behavior = `CACHING_DISABLED`; SPA fallback via
`errorResponses` 403/404 → `/index.html` 200 (5 min TTL); default behavior `CACHING_OPTIMIZED`.

`.github/workflows/deploy-frontend.yml`: `aws s3 sync --delete` ×2 — (1) everything except `*.html`
→ `Cache-Control: public, max-age=31536000, immutable`; (2) `*.html` →
`no-cache, must-revalidate, max-age=0`; then CloudFront invalidation `/*`.

Flags:

- **`sw.js` would be caught by the year-long `immutable` rule** (it is not `*.html`) → a stale
  service worker that never updates. Needs a carve-out: sync `sw.js` (and `registerSW.js` if used)
  with `no-cache, must-revalidate, max-age=0`. Workbox-hashed `workbox-*.js` chunks are fine as
  `immutable`.
- `manifest.webmanifest`: better `max-age=3600`; ensure it is served as
  `Content-Type: application/manifest+json` (S3 may default `.webmanifest` to
  `binary/octet-stream` — may need `--content-type` on the sync).
- The existing `/*` CloudFront invalidation each deploy mostly masks the header problem, but
  SW-lifecycle correctness between deploys still needs the right headers.
- No custom domain today (`*.cloudfront.net`). Works on the CloudFront domain; a future custom
  domain changes only `scope` / `start_url` trivially (same-origin relative paths).
- `packages/web/public/**` is already covered by the deploy path filter (`packages/web/**`).

## 7. Scope-boundary assessment

Proposed first slice = **installable + usable**: manifest + SW + icons + Apple meta tags +
`viewport-fit=cover`/safe-area wiring + session persistence fix (`sessionStorage` → `localStorage`) +
iOS install hint + update toast. Push notifications deferred.

**This is a coherent slice** — one deployable unit with a clear finish (install on an iPhone, kill
from the app switcher, relaunch, land on dashboard still logged in, receive an update toast after the
next deploy) and a trivial rollback (remove the plugin, revert one storage file, revert `index.html`
head).

Must ship **together** with the slice: the session persistence fix; `viewport-fit=cover` +
safe-area check; `apple-touch-icon` PNG; the deploy-workflow cache carve-out for `sw.js`; and a real
source logo/icon asset (currently absent — an external input dependency).

Can safely **wait**: push notifications; iOS splash images (cosmetic); self-hosting fonts; full
offline mode for financial data (deliberately keep the API network-only); the back-affordance audit
for deep sub-pages; renaming `sessionStorage.ts`.

## Anticipated affected files (for the proposal — not changed here)

New: `packages/web/public/manifest.webmanifest` (or plugin-generated); `packages/web/public/icons/*`
(192, 512, 512-maskable, `apple-touch-icon-180.png`, `favicon.svg`); `packages/web/src/lib/pwa/` SW
registration + update hook (or `virtual:pwa-register` wiring); optional
`packages/web/src/features/pwa/InstallHint.tsx` + i18n keys.

Modified: `packages/web/vite.config.ts` (add `VitePWA`); `packages/web/package.json` (add
`vite-plugin-pwa` + dev HTTPS helper); `packages/web/index.html` (`viewport-fit=cover`, Apple meta
tags, manifest link, corrected `theme-color`); `packages/web/src/features/auth/sessionStorage.ts`
(`localStorage`); `packages/web/src/styles/globals.css` and/or `AppLayout.tsx` / `BottomTabBar.tsx`
(safe-area compose check); `packages/web/src/app/Providers.tsx` or `main.tsx` (SW update → `sonner`
toast); `packages/web/src/lib/i18n.ts` (strings); `.github/workflows/deploy-frontend.yml` (cache
carve-out for `sw.js` + `.webmanifest` content-type).

No changes to `packages/domain`, `packages/api`, `packages/shared-types`.
`infra-cdk/WebDistribution.ts` change is optional (invalidation covers correctness) — flag.

## Risks (ranked)

1. **CRITICAL — session persistence**: unless `sessionStorage` → `localStorage` ships in this slice,
   the installed iOS PWA forces a full login on every cold launch, defeating the purpose. Low effort,
   high impact; must be in the slice.
2. **HIGH — stale service worker via deploy cache headers**: `deploy-frontend.yml` would cache
   `sw.js` as `immutable` for a year → the update toast never fires between deploys. Partly mitigated
   by the existing `/*` invalidation.
3. **MED — missing source icon asset**: no logo in the repo; icon + splash generation is blocked
   until a source SVG/large PNG is provided.
4. **MED — safe-area regressions**: adding `viewport-fit=cover` changes layout on notched devices;
   verify `pb-28` on `<main>` + `pb-safe` on `BottomTabBar` don't clip or double-pad.
5. **MED — no swipe-back in standalone**: deep sub-routes become hard to leave without an explicit
   back button; quick audit of `PageHeader` / sub-pages.
6. **LOW — Google Fonts CDN dependency**: not truly offline-capable until fonts are self-hosted or
   runtime-cached; first offline launch may render with fallback fonts.
7. **LOW — `localStorage` XSS exposure window**: refresh token persists ~30 days on disk; acceptable
   for a closed-signup 2-device app; note in the proposal.
8. **LOW — `.webmanifest` MIME type** from S3 may be wrong; cosmetic devtools warning, iOS install
   still works.
9. **LOW — Vite 6 + `vite-plugin-pwa` build interplay**: `1.3.0` declares Vite 6 support; verify
   `sourcemap` + custom `rollupOptions.output` naming produce a valid precache manifest.

## Ready for Proposal: YES

Coherent, low-risk, mostly additive. Proceed to `sdd-propose` with the seven-item slice; treat
`sessionStorage` → `localStorage` as mandatory in the same PR; require a source icon asset as input;
include the `deploy-frontend.yml` cache carve-out. Push notifications out of scope.

## Result envelope

- **status**: completed (investigation); artifact now persisted by the orchestrator
- **next_recommended**: `sdd-propose`
- **skill_resolution**: `paths-injected` (sw-web, sw-hexagonal)
