# Tasks: Installable PWA for `packages/web` (iOS Safari)

## Review Workload Forecast

| Field                   | Value                                                             |
| ----------------------- | ----------------------------------------------------------------- |
| Estimated changed lines | ~300–380 authored (config + small components); generated icons ~0 |
| 400-line budget risk    | Medium                                                            |
| 800-line budget risk    | Low                                                               |
| Chained PRs recommended | No                                                                |
| Suggested split         | Single PR (fits 800 budget; CRITICAL pair must co-ship)           |
| Delivery strategy       | ask-on-risk                                                       |
| Chain strategy          | pending                                                           |

Per-group estimate: Phase 1 ~60 · Phase 2 ~40 authored (+ binary icons ~0) · Phase 3 ~12 · Phase 4 ~45 · Phase 5 ~150 · Phase 6 ~10 · Phase 7 ~0 (manual + static gates).

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: pending
400-line budget risk: Medium
800-line budget risk: Low

Note: session review budget is 800. If the team enforces the 400 default instead, split as
PR 1 = Phase 1 + Phase 2 + Phase 3 + Phase 6, PR 2 = Phase 4 + Phase 5. Phase 4 tasks 4.1–4.4
are the CRITICAL pair and MUST land in one PR. Phase 2 + Phase 3 are coupled (the
`apple-touch-icon` link needs the generated PNG) and MUST land together.

### Suggested Work Units

| Unit | Goal                                                        | Likely PR | Focused test command                                         | Runtime harness                                                                                                    | Rollback boundary                                                                                    |
| ---- | ----------------------------------------------------------- | --------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| 1    | PWA build plumbing (Phase 1)                                | PR 1      | `pnpm --filter @smart-wallet/web build && typecheck && lint` | `pnpm --filter @smart-wallet/web build` then inspect `dist/sw.js` + `dist/manifest.webmanifest`                    | Remove `VitePWA()` + deps from `vite.config.ts` / `package.json`                                     |
| 2    | Monogram icons + `index.html` head (Phase 2 + 3)            | PR 1      | `pnpm --filter @smart-wallet/web build`                      | `vite preview --host` → Add to Home Screen on iPhone; icon opaque at 1×                                            | Delete `public/*.png`/`.ico`/`favicon.svg`, revert `index.html` head                                 |
| 3    | Auth `localStorage` swap + "sesión expiró" notice (Phase 4) | PR 1      | `pnpm --filter @smart-wallet/web typecheck && lint`          | On device: sign in, kill from app switcher, relaunch → `/dashboard`; corrupt `refreshToken` → one toast → `/login` | Revert `sessionStorage.ts` to `sessionStorage`, revert `AuthProvider.refreshSession` guard           |
| 4    | PWA UI module (Phase 5)                                     | PR 1      | `pnpm --filter @smart-wallet/web build && typecheck && lint` | `vite preview --host` → Airplane Mode: banner visible, data views show retry state; redeploy → update toast        | Remove `<PwaUpdater />` from `Providers.tsx`, `<OfflineBanner />`/`<InstallHint />` from `AppLayout` |
| 5    | Deploy header pass (Phase 6)                                | PR 1      | n/a (CI YAML)                                                | Post-deploy: `curl -I` `sw.js` (no-cache) and a hashed `assets/*` file (immutable)                                 | Revert the added workflow step; `/*` invalidation still covers correctness                           |

## Phase 1: PWA Build Plumbing

Files are disjoint from Phases 2 and 6 — **parallel-safe** with them.

- [x] 1.1 `packages/web/package.json`: add `vite-plugin-pwa` (deps); `@vite-pwa/assets-generator` + `vite-plugin-mkcert` (devDeps); script `"generate-pwa-assets": "pwa-assets-generator"`. Done when `pnpm install` resolves and the script is callable.
- [x] 1.2 `packages/web/vite.config.ts`: refactor to `defineConfig(({ command }) => ({ … }))`; leave `define`, `optimizeDeps`, `build` untouched. Done when a `vite build` diff shows no change beyond the new PWA emit.
- [x] 1.3 `packages/web/vite.config.ts`: add `VitePWA({ … })` immediately after `react()` with the D1 `manifest` object (name/short_name/lang/start_url/scope/display/orientation/background_color/theme_color/icons), `registerType:'prompt'`, `injectRegister:null`, `includeAssets:['favicon.svg','apple-touch-icon-180x180.png']`, `devOptions:{ enabled:false }`. Done when `dist/manifest.webmanifest` is emitted with every field from the "Web App Manifest" requirement.
- [x] 1.4 `packages/web/vite.config.ts`: in `VitePWA.workbox` set `globPatterns:['**/*.{js,css,html,svg,png,ico,webmanifest}']`, `globIgnores:['**/*.map']`, `navigateFallback:'index.html'`, `navigateFallbackDenylist:[/^\/api\//]`, `cleanupOutdatedCaches:true`, `clientsClaim:true`. Done when `dist/sw.js` precache list has hashed asset names and zero `.map` entries.
- [x] 1.5 `packages/web/vite.config.ts`: add the two D2 `runtimeCaching` rules — `fonts.googleapis.com` → `StaleWhileRevalidate` cache `google-fonts-css` maxAge 1 week; `fonts.gstatic.com` → `CacheFirst` cache `google-fonts-webfonts` `maxEntries:20` `maxAgeSeconds:31536000` `cacheableResponse:{ statuses:[0,200] }`. Done when both rules appear in `dist/sw.js`.
- [x] 1.6 `packages/web/vite.config.ts`: append `...(command === 'serve' ? [mkcert()] : [])` to `plugins`. Done when `vite build` never loads mkcert and `vite preview --host` serves trusted HTTPS on the LAN.
- [x] 1.7 `packages/web/src/vite-env.d.ts`: add `/// <reference types="vite-plugin-pwa/react" />`. Done when `virtual:pwa-register/react` typechecks.

## Phase 2: Monogram Icon Pipeline

Coupled with Phase 3 (the `apple-touch-icon` link needs 2.3's PNG) — **ship together**.

- [x] 2.1 `packages/web/public/favicon.svg`: hand-author a 512×512 monogram — full-bleed navy `#201E3E` field, cream `#FAF6EB` "SW", lime `#DCEEB1` accent. Done when `/favicon.svg` resolves (fixes today's 404) and renders the mark.
- [x] 2.2 `packages/web/pwa-assets.config.ts`: create with the `minimal-2023` preset, `images:['public/favicon.svg']`, output to `public/`, apple-icon override `padding:0` + `resizeOptions:{ background:'#201E3E' }` (opaque). Done when `pnpm --filter @smart-wallet/web generate-pwa-assets` runs clean.
- [x] 2.3 Run `generate-pwa-assets`; commit `public/{apple-touch-icon-180x180,pwa-192x192,pwa-512x512,maskable-icon-512x512}.png` and `public/favicon.ico`. Done when all six files exist and are committed (binaries ≈ 0 review lines). (Also emitted + committed `public/pwa-64x64.png` — standard `minimal-2023` output.)
- [x] 2.4 Inspect `apple-touch-icon-180x180.png` at 1× (MED risk). Done when the icon is opaque with no transparency and "SW" is legible at navy/cream contrast. **Flagged for human visual review — the hand-authored "S" glyph is slightly heavy.**

## Phase 3: `index.html` Head

- [x] 3.1 `packages/web/index.html`: set `<meta name="viewport">` to `width=device-width, initial-scale=1.0, viewport-fit=cover`; change `<meta name="theme-color">` `#000000` → `#FAF6EB`. Done when both metas match D7.
- [x] 3.2 `packages/web/index.html`: add `apple-mobile-web-app-capable=yes`, `mobile-web-app-capable=yes`, `apple-mobile-web-app-status-bar-style=default`, `apple-mobile-web-app-title=SWallet`, and `<link rel="apple-touch-icon" href="/apple-touch-icon-180x180.png">`; keep the existing svg `<link rel="icon">` and the Google Fonts preconnect/stylesheet; do NOT add `<link rel="manifest">`. Done when built `index.html` has exactly one (plugin-injected) manifest link.

## Phase 4: Auth Persistence + Expiry Notice (CRITICAL PAIR — one PR)

4.3 touches `i18n.ts`; sequence it before Phase 5.1 to avoid a merge conflict.

- [x] 4.1 `packages/web/src/features/auth/sessionStorage.ts`: replace the three `sessionStorage.*` calls in `readPersisted`/`writePersisted`/`clearPersisted` with `localStorage.*`. Keep the filename, `KEY = 'smart-wallet:auth:v1'`, the `PersistedAuth` shape, and the `readPersisted` try/catch. Done when persistence uses `localStorage` with a byte-identical key and JSON shape.
- [x] 4.2 `packages/web/src/features/auth/sessionStorage.ts` + `AuthProvider.tsx`: fix the stale "sessionStorage" wording in the file header and in the `AuthProvider` mount-effect comment. Done when no misleading comment remains.
- [x] 4.3 `packages/web/src/lib/i18n.ts`: add `t.auth.sessionExpired` = "Tu sesión expiró" for every locale in the file. Done when the key resolves.
- [x] 4.4 `packages/web/src/features/auth/AuthProvider.tsx`: in `refreshSession`, add a `sessionExpiredRef` guard so that on a rejected refresh (and on the `!cognitoUser || !persisted` throw) it fires exactly once: `toast.error(t.auth.sessionExpired)` → `clearPersisted()` → `queryClient.clear()` → `setState({ user:null, idToken:null, isLoading:false, requiresNewPassword:false })` → `navigate(routes.login)` → rethrow. Reset the ref on successful `signIn`. Done when a rejected refresh shows exactly one toast, routes to `/login` after it, and the awaiting request still rejects.

## Phase 5: PWA UI Module

Depends on Phase 1 (virtual-module types). Touches `i18n.ts`, `Providers.tsx`, `AppLayout.tsx`.

- [x] 5.1 `packages/web/src/lib/i18n.ts`: add `t.pwa.{ offline, updateAvailable, updateAction, installHint, installDismiss }` for every locale. Done when all five keys resolve.
- [x] 5.2 `packages/web/src/features/pwa/PwaUpdater.tsx`: create a null-rendering side-effect component using `virtual:pwa-register/react` `useRegisterSW`; `onNeedRefresh` → `toast(t.pwa.updateAvailable, { duration: Infinity, action: { label: t.pwa.updateAction, onClick: () => void updateServiceWorker(true) } })`; `onOfflineReady` → silent no-op. Done when it typechecks and renders nothing.
- [x] 5.3 `packages/web/src/app/Providers.tsx`: mount `<PwaUpdater />` immediately after `<ApiClientBridge />` (inside `BrowserRouter` + `AuthProvider`, same subtree as `<Toaster>`). Done when it is wired and builds.
- [x] 5.4 `packages/web/src/features/pwa/hooks/useOnlineStatus.ts`: `useState(() => navigator.onLine)` + `useEffect` adding/removing `window` `online`/`offline` listeners with cleanup; returns `boolean`. Done when toggling connectivity flips the value.
- [x] 5.5 `packages/web/src/features/pwa/components/OfflineBanner.tsx`: returns `null` when online; otherwise a chrome strip `bg-foreground text-background pt-safe font-mono text-xs uppercase tracking-caption` with a `WifiOff` lucide icon, `role="status" aria-live="polite"`, text `t.pwa.offline`. Done when it renders only while offline and clears on reconnect.
- [x] 5.6 `packages/web/src/app/layouts/AppLayout.tsx`: wrap `<main>` in a `flex min-w-0 flex-1 flex-col` column div and render `<OfflineBanner />` above `<main>` per the D5 snippet; do NOT add `pb-safe` to `<main>`. Done when the banner pushes content down in normal flow and the desktop sidebar row is intact.
- [x] 5.7 `packages/web/src/features/pwa/components/InstallHint.tsx`: render only when `!navigator.standalone` AND the platform is iOS Safari; show a dismissible Share → Add to Home Screen hint (`t.pwa.installHint` / `t.pwa.installDismiss`); persist dismissal in a `localStorage` flag so it never reappears; never render in standalone or on non-iOS. Done when it shows once on iOS Safari and stays gone after dismissal.
- [x] 5.8 Mount `<InstallHint />` in `AppLayout` near `<OfflineBanner />` (or `Providers.tsx` per existing convention). Done when the hint appears only on non-installed iOS Safari.

## Phase 6: Deploy Workflow

File is disjoint — **parallel-safe** with Phases 1–5.

- [x] 6.1 `.github/workflows/deploy-frontend.yml`: add a `Sync service worker + manifest to S3 (correct headers)` step with the two D8 `aws s3 cp` commands — `dist/sw.js` → `--cache-control "no-cache, must-revalidate, max-age=0" --content-type "text/javascript"`; `dist/manifest.webmanifest` → `--cache-control "public, max-age=3600" --content-type "application/manifest+json"` — placed **after** `Sync HTML to S3 (no-cache)` and **before** `Invalidate CloudFront`. Done when the step runs after both S3 syncs so the `--delete` sync cannot stamp the two files `immutable`, and hashed `workbox-*.js` chunks keep `immutable`.

## Phase 7: Verification (Standard Mode — no test runner)

- [x] 7.1 Run `pnpm --filter @smart-wallet/web build && pnpm --filter @smart-wallet/web typecheck && pnpm --filter @smart-wallet/web lint`. Done when all three pass. (build ✓, typecheck ✓, lint ✓ — 0 errors, 1 pre-existing unrelated warning.)
- [x] 7.2 Inspect `packages/web/dist/sw.js` precache manifest: hashed asset names present, `index.html` present, zero `.map` entries. Done when the list matches the Vite build graph. (18 entries, hashed `assets/*`, `index.html` present, zero `.map`; `includeAssets`/`globPatterns` overlap yields identical-revision duplicates that Workbox dedupes.)
- [x] 7.3 Confirm `dist/manifest.webmanifest` exposes every field in the "Web App Manifest and Installability" requirement and built `index.html` carries the D7 Apple metas plus exactly one injected manifest link. Done when a DevTools/Lighthouse installability check reports no errors. (Static inspection ✓; Lighthouse run deferred to device.)
- [ ] 7.4 On device (iPhone via `vite preview --host` over mkcert HTTPS, then the deployed CloudFront URL) run the 6-item manual checklist ↔ spec scenarios: (1) install + crisp icon + standalone launch (no Safari chrome); (2) sign in → kill from app switcher → relaunch lands on `/dashboard`, never `/login`; (3) redeploy → "Recargar" toast → tap serves new build; (4) Airplane Mode → offline banner visible, data views show network-error/retry state, no stale balances, cold offline launch renders the shell; (5) notched device → bottom tab bar clears the home indicator, no double bottom padding, banner clears the status bar; (6) corrupt stored `refreshToken` → exactly one "Tu sesión expiró" toast, then `/login`. **DEFERRED — human/on-device only, not executable in this environment.**
- [x] 7.5 Confirm the diff touches only `packages/web/**` and `.github/workflows/deploy-frontend.yml`; `packages/domain`, `packages/api`, `packages/shared-types`, `packages/infra-cdk` untouched. Done when `git diff --name-only` matches. (Plus `pnpm-lock.yaml` — unavoidable lockfile update for the new deps.)

## Requirement Traceability

| Spec requirement                    | Tasks                                |
| ----------------------------------- | ------------------------------------ |
| Web App Manifest and Installability | 1.3, 1.4, 3.2, 7.3                   |
| iOS Home-Screen Identity            | 2.1–2.4, 3.1, 3.2, 7.4(1)            |
| Session Survives Cold Launch        | 4.1, 4.2, 7.4(2)                     |
| Refresh-Token Expiry Is Explained   | 4.3, 4.4, 7.4(6)                     |
| Service-Worker Update Notification  | 1.3, 5.1, 5.2, 5.3, 6.1, 7.4(3)      |
| Offline Behavior                    | 1.4, 1.5, 5.1, 5.4, 5.5, 5.6, 7.4(4) |
| iOS Install Hint                    | 5.1, 5.7, 5.8, 7.4(1)                |
| Safe-Area Correctness               | 3.1, 5.6, 7.4(5)                     |
| Deploy Cache Correctness            | 6.1, 7.4(3)                          |
| No Backend or Domain Change         | 7.5                                  |

## Parallelization

| Can run in parallel                            | Must be sequential / coupled                                |
| ---------------------------------------------- | ----------------------------------------------------------- |
| Phase 1, Phase 2, Phase 6 (disjoint files)     | Phase 3 after Phase 2 (needs generated PNG) — ship together |
| Within Phase 5: 5.2, 5.4, 5.5, 5.7 (new files) | Phase 4 tasks 4.1–4.4 = CRITICAL pair, one PR               |
|                                                | Phase 5 after Phase 1 (virtual-module types)                |
|                                                | 4.3 before 5.1 (both edit `i18n.ts`)                        |
|                                                | 5.3 after 5.2; 5.6 after 5.5; 5.8 after 5.7                 |
|                                                | Phase 7 last                                                |

## Threat Matrix

All rows N/A per design (no file-classification, git, commit, push, or PR automation). The only
added shell is two literal `aws s3 cp` commands with no user-controlled input. No RED-test tasks
required.
