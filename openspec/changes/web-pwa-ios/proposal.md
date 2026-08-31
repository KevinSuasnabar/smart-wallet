# Proposal: Installable PWA for `packages/web` (iOS Safari, no App Store)

## Intent

Two personal iOS devices need a home-screen app. There is no App Store path and none is wanted.
Today `packages/web` is not installable (no manifest, no service worker, no `public/`, no icons,
no Apple meta tags) and, worse, auth tokens live in `sessionStorage` — iOS wipes it when a
standalone app is killed from the app switcher, so an installed app would force a full
username/password login on **every cold launch**. Installability without session persistence is
worthless; both ship together.

## Scope

### In Scope

1. `vite-plugin-pwa@1.3.0` (Workbox `generateSW`) in `vite.config.ts`, after `react()`.
2. Manifest: `name` "Smart Wallet", `short_name` "SWallet", `start_url`/`scope` `/`,
   `display: standalone`, `orientation: portrait`, `lang: es`, `background_color`/`theme_color`
   cream `#FAF6EB`, icons 192/512/512-maskable.
3. Monogram icon (navy `#201E3E` field, cream "SW", lime `#DCEEB1` accent) — one hand-authored
   source SVG + `@vite-pwa/assets-generator` → `apple-touch-icon` 180×180 opaque PNG, manifest
   icons, `favicon.svg` (currently 404s).
4. `index.html` head: `viewport-fit=cover`, `apple-mobile-web-app-capable` +
   `mobile-web-app-capable`, status-bar-style `default`, app title `SWallet`, `apple-touch-icon`
   link, manifest link, corrected `theme-color`.
5. Safe-area wiring: `viewport-fit=cover` activates existing `.pb-safe`/`.pt-safe`; verify no
   double-padding against `AppLayout` `<main class="pb-28">` + `BottomTabBar`.
6. **Mandatory**: `sessionStorage` → `localStorage` in `src/features/auth/sessionStorage.ts`
   (`readPersisted`/`writePersisted`/`clearPersisted`), same key `smart-wallet:auth:v1`, same
   try/catch. Yields ~30 days of silent refresh.
7. Dismissible iOS install hint (`!navigator.standalone && iOS Safari`): "Compartí → Agregar a
   inicio"; new `src/lib/i18n.ts` keys.
8. Update UX: `virtual:pwa-register` `onNeedRefresh` → existing `sonner` toast "Hay una versión
   nueva → Recargar".
9. `deploy-frontend.yml`: extra sync pass so `sw.js` (+ `registerSW.js`) get
   `no-cache, must-revalidate, max-age=0`; `manifest.webmanifest` served as
   `application/manifest+json`. Hashed chunks stay `immutable`.
10. Dev-only local HTTPS helper (`vite-plugin-mkcert`) for on-device `vite preview --host`.
11. Global offline banner: a `useOnlineStatus` hook (`navigator.onLine` + `online`/`offline`
    events) plus an app-level banner rendered in `AppLayout`, visible whenever the device is
    offline, so a data view never merely looks like it is "loading". New `src/lib/i18n.ts` key.

**Offline policy**: app shell precache + offline fallback only. All API traffic is **network-only** —
never serve stale balances or transactions. Offline state is surfaced by the global banner (item 11),
not per-view; individual data views keep their normal network-error states as the retry affordance.

### Out of Scope

Push notifications · `apple-touch-startup-image` splash screens · self-hosting Google Fonts ·
offline caching of financial data · back-affordance audit for deep sub-routes ·
renaming `sessionStorage.ts` · `infra-cdk/WebDistribution.ts` (the existing `/*` invalidation
already covers correctness) · Android `beforeinstallprompt` (deferred, see Open Questions).

## Capabilities

### New Capabilities

- `web-pwa`: installability (manifest, icons, Apple meta), service-worker shell caching + update
  notification, iOS install hint, and durable auth-session persistence across cold launches.

### Modified Capabilities

- None. `openspec/specs/` does not exist in this repo; prior specs live inside archived change
  folders, so there is no existing spec to delta.

## Approach

Lean on the official plugin instead of a hand-rolled service worker: Workbox derives the precache
manifest from the real Vite build graph, so hashed asset names stay correct on every deploy.
Everything else is thin glue — head tags, one storage-backend swap, one toast, one workflow pass.
No new architecture: `packages/web` keeps importing only `@smart-wallet/shared-types`; no `domain`,
`api`, or `shared-types` change.

## Affected Areas

| Area                                                    | Impact   | Description                                                    |
| ------------------------------------------------------- | -------- | -------------------------------------------------------------- |
| `packages/web/vite.config.ts`                           | Modified | Add `VitePWA()` after `react()`                                |
| `packages/web/package.json`                             | Modified | `vite-plugin-pwa`, assets generator, mkcert (dev)              |
| `packages/web/index.html`                               | Modified | Viewport, Apple meta, manifest + icon links, theme-color       |
| `packages/web/public/`                                  | New      | Source SVG + generated icons, `favicon.svg`                    |
| `src/features/auth/sessionStorage.ts`                   | Modified | `sessionStorage` → `localStorage`                              |
| `src/features/pwa/`                                     | New      | Install hint component, offline banner, `useOnlineStatus` hook |
| `src/lib/i18n.ts`                                       | Modified | Install-hint + update-toast + offline-banner strings           |
| `src/app/Providers.tsx` or `main.tsx`                   | Modified | `virtual:pwa-register` wiring                                  |
| `src/app/layouts/AppLayout.tsx`                         | Modified | Render the global offline banner                               |
| `src/styles/globals.css` / `AppLayout` / `BottomTabBar` | Verify   | Safe-area compose check                                        |
| `.github/workflows/deploy-frontend.yml`                 | Modified | SW cache carve-out + manifest MIME                             |

## Risks

| Risk                                                                    | Likelihood      | Mitigation                                                                                                                    |
| ----------------------------------------------------------------------- | --------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| CRITICAL — cold launch logs user out                                    | High if omitted | Item 6 is mandatory in this slice                                                                                             |
| HIGH — `sw.js` cached `immutable` for a year → update toast never fires | Med             | Item 9 carve-out; existing `/*` invalidation is a partial backstop                                                            |
| MED — safe-area regression on notched devices                           | Med             | Verify `pb-28` + `pb-safe` on a real iPhone before merge                                                                      |
| MED — no swipe-back in standalone                                       | Med             | Accepted; back-affordance audit deferred                                                                                      |
| MED — monogram illegible at 180px                                       | Med             | Two-letter mark, high navy/cream contrast, review at 1×                                                                       |
| LOW — Google Fonts CDN                                                  | Low             | Two bounded Workbox runtime-cache rules (CSS SWR 1wk, woff2 CacheFirst ≤20 entries) — ratified in design D2; not self-hosting |
| LOW — `localStorage` XSS exposure of refresh token                      | Low             | Accepted: closed signup, 2 personal devices                                                                                   |
| LOW — `.webmanifest` MIME from S3                                       | Low             | Explicit `--content-type`; install works regardless                                                                           |
| LOW — Vite 6 + plugin interplay (sourcemaps, custom output naming)      | Low             | Verify precache manifest after `pnpm --filter web build`                                                                      |

## Rollback Plan

Four independent reverts: remove `VitePWA()` + deps from `vite.config.ts`/`package.json`; revert
`sessionStorage.ts` to `sessionStorage`; revert the `index.html` head; revert the workflow sync
pass. A previously-registered SW is cleared by shipping a build without one (Workbox self-destruct)
or by removing the app from the home screen. No data migration, no backend change.

## Dependencies

- None external. The icon source SVG is authored in-repo (decision already made), removing the
  blocking "no logo asset" dependency flagged during exploration.

## Success Criteria

- [ ] Install on an iPhone via Share → Add to Home Screen; monogram icon and `SWallet` label correct.
- [ ] Launches standalone (no Safari chrome).
- [ ] Kill from the app switcher, relaunch → still authenticated, lands on dashboard, no login screen.
- [ ] Safe areas correct on a notched device: no clipped bottom tab bar, no double padding.
- [ ] After a redeploy, the update toast appears and reload serves the new build.
- [ ] Offline launch renders the shell/offline fallback; the global offline banner is visible and
      data views show their normal network-error state — never stale balances.
- [ ] `pnpm --filter web build`, `typecheck`, and `lint` all pass.

## Resolved Decisions

1. `theme_color` / `background_color` = cream `#FAF6EB` (blends with the canvas; no navy strip).
2. Offline UX = a single app-level "sin conexión" banner (item 11), not per-view messaging.
3. `start_url` = `/` (redirects to `/dashboard`); the landing route is not hardcoded into the icon.
4. iOS install hint is dismissed permanently via a persisted flag once the user closes it.
5. When the 30-day refresh token expires, show a `sonner` toast "Tu sesión expiró" before
   redirecting to `/login`.
6. Android `beforeinstallprompt` stays deferred — the target is two iOS devices.
7. Monogram is authored in-repo as a source SVG, then expanded by `@vite-pwa/assets-generator`.
