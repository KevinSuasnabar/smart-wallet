# Apply Progress: web-pwa-ios

**Mode**: Standard (no test runner — `"test": "echo 'no tests yet'"`). No TDD.
**Branch**: `feat/web-pwa-ios`
**Delivery**: single PR (forecast ~300-380 lines, under the 800 budget).
**Fresh apply** — no prior apply-progress existed.

## Task-by-task status

### Phase 1 — PWA build plumbing

- [x] 1.1 `package.json`: added `vite-plugin-pwa` (dep); `@vite-pwa/assets-generator`, `vite-plugin-mkcert`, `workbox-window` (devDeps); script `generate-pwa-assets`. `pnpm install` resolves; script runs clean.
- [x] 1.2 `vite.config.ts`: refactored to `defineConfig(({ command }) => ({ … }))`; `define` / `optimizeDeps` / `build` / `resolve` / `server` / `preview` / `envPrefix` untouched.
- [x] 1.3 `vite.config.ts`: `VitePWA({ … })` after `react()` with the full D1 `manifest`, `registerType:'prompt'`, `injectRegister:null`, `includeAssets:['favicon.svg','apple-touch-icon-180x180.png']`, `devOptions:{ enabled:false }`. `dist/manifest.webmanifest` emitted with every required field.
- [x] 1.4 `vite.config.ts`: `workbox` `globPatterns` / `globIgnores:['**/*.map']` / `navigateFallback` / `navigateFallbackDenylist:[/^\/api\//]` / `cleanupOutdatedCaches:true` / `clientsClaim:true`. `dist/sw.js` precache has hashed asset names and **zero `.map` entries**.
- [x] 1.5 `vite.config.ts`: the two D2 `runtimeCaching` rules — `fonts.googleapis.com` → `StaleWhileRevalidate` `google-fonts-css` maxAge 1 week; `fonts.gstatic.com` → `CacheFirst` `google-fonts-webfonts` `maxEntries:20` `maxAgeSeconds:31536000` `cacheableResponse:{ statuses:[0,200] }`. Both present in `dist/sw.js`.
- [x] 1.6 `vite.config.ts`: `...(command === 'serve' ? [mkcert()] : [])` appended to `plugins`. `vite build` (`command === 'build'`) never loads mkcert — production build succeeds.
- [x] 1.7 `src/vite-env.d.ts`: added `/// <reference types="vite-plugin-pwa/react" />`. `virtual:pwa-register/react` typechecks (`tsc --noEmit` clean).

### Phase 2 — Monogram icons

- [x] 2.1 `public/favicon.svg`: hand-authored 512×512 monogram — full-bleed navy `#201E3E`, cream `#FAF6EB` stroke "SW", lime `#DCEEB1` accent bar. Uses stroke paths (no font dependency) so `sharp` renders it deterministically.
- [x] 2.2 `pwa-assets.config.ts`: `minimal2023Preset` spread with an `apple` override — `padding:0`, `resizeOptions:{ background:'#201E3E' }` (opaque). `images:['public/favicon.svg']`, output to `public/` (preset default alongside the source).
- [x] 2.3 Ran `generate-pwa-assets`; committed `public/{apple-touch-icon-180x180,pwa-192x192,pwa-512x512,maskable-icon-512x512}.png` + `favicon.ico`. **Also emitted `public/pwa-64x64.png`** (standard `minimal-2023` output) — committed too; harmless, precached.
- [x] 2.4 Inspected `apple-touch-icon-180x180.png` at 1×: opaque navy field, no transparency, cream "SW" legible against navy (~12:1 contrast), lime accent bar visible. **FLAGGED FOR HUMAN VISUAL REVIEW** — the hand-authored "S" glyph is slightly heavy/blobby; a designer may want to refine the source SVG before release. Icon is functional and legible as-is.

### Phase 3 — `index.html` head (D7)

- [x] 3.1 `index.html`: `<meta name="viewport">` → `width=device-width, initial-scale=1.0, viewport-fit=cover`; `<meta name="theme-color">` `#000000` → `#FAF6EB`.
- [x] 3.2 `index.html`: added `apple-mobile-web-app-capable=yes`, `mobile-web-app-capable=yes`, `apple-mobile-web-app-status-bar-style=default`, `apple-mobile-web-app-title=SWallet`, `<link rel="apple-touch-icon" href="/apple-touch-icon-180x180.png">`. Kept svg `<link rel="icon">` and Google Fonts preconnect/stylesheet. Did **not** add `<link rel="manifest">`. Built `dist/index.html` has exactly one (plugin-injected) `<link rel="manifest" href="/manifest.webmanifest">`.

### Phase 4 — Auth persistence + expiry notice (CRITICAL PAIR)

- [x] 4.1 `src/features/auth/sessionStorage.ts`: the three `sessionStorage.*` calls in `readPersisted` / `writePersisted` / `clearPersisted` → `localStorage.*`. Filename, `KEY = 'smart-wallet:auth:v1'`, `PersistedAuth` shape, and the `readPersisted` try/catch all unchanged.
- [x] 4.2 Fixed stale "sessionStorage" wording: new file header on `sessionStorage.ts` explains the `localStorage` backend + why the filename is kept; `AuthProvider` mount-effect comment "Hydrate from sessionStorage on mount" → "Hydrate from localStorage on mount".
- [x] 4.3 `src/lib/i18n.ts`: added `t.auth.sessionExpired = 'Tu sesión expiró'` (single-locale file — one key added).
- [x] 4.4 `src/features/auth/AuthProvider.tsx`: added `sessionExpiredRef` one-shot guard. `refreshSession` now routes both the `!cognitoUser || !persisted` case and a rejected `refreshSession` callback through `handleSessionExpired(error)`, which on first call only fires `toast.error(t.auth.sessionExpired)` → `clearPersisted()` → `queryClient.clear()` → `setState({ user:null, idToken:null, isLoading:false, requiresNewPassword:false })` → `navigate(routes.login)`, then **always rethrows** so the awaiting request still rejects. `refreshSession` deps updated to `[navigate, queryClient]`. Ref reset to `false` on a successful `signIn`.

### Phase 5 — PWA UI module

- [x] 5.1 `src/lib/i18n.ts`: added `t.pwa.{ offline, updateAvailable, updateAction, installHint, installDismiss }`. `updateAvailable`="Hay una versión nueva", `updateAction`="Recargar", `offline`="Sin conexión" — matches the spec toast wording "Hay una versión nueva → Recargar" and banner "sin conexión".
- [x] 5.2 `src/features/pwa/PwaUpdater.tsx`: null-rendering component using `useRegisterSW`; `onNeedRefresh` → `toast(t.pwa.updateAvailable, { duration: Infinity, action: { label: t.pwa.updateAction, onClick: () => void updateServiceWorker(true) } })`; `onOfflineReady` → silent no-op.
- [x] 5.3 `src/app/Providers.tsx`: `<PwaUpdater />` mounted immediately after `<ApiClientBridge />`, inside `BrowserRouter` + `AuthProvider`, same subtree as `<Toaster>`.
- [x] 5.4 `src/features/pwa/hooks/useOnlineStatus.ts`: `useState(() => navigator.onLine)` + `useEffect` add/removing `window` `online`/`offline` listeners with cleanup; returns `boolean`.
- [x] 5.5 `src/features/pwa/components/OfflineBanner.tsx`: returns `null` when online; otherwise a chrome strip `bg-foreground text-background … pt-safe font-mono text-xs uppercase tracking-caption` with a `WifiOff` lucide icon, `role="status" aria-live="polite"`, text `t.pwa.offline`.
- [x] 5.6 `src/app/layouts/AppLayout.tsx`: `<main>` wrapped in a `flex min-w-0 flex-1 flex-col` column div with `<OfflineBanner />` above it, per the D5 snippet. `pb-safe` NOT added to `<main>` (kept `pb-28` / `md:pb-10`). Desktop sidebar row intact (`md:flex-row`).
- [x] 5.7 `src/features/pwa/components/InstallHint.tsx`: renders only when `!isStandalone()` AND `isIosSafari()` (UA `iPad|iPhone|iPod` or iPadOS `MacIntel`+touch, WebKit, excluding `CriOS|FxiOS|EdgiOS|OPiOS`). Dismissible Share → "Agregar a la pantalla de inicio" hint (`t.pwa.installHint` / `t.pwa.installDismiss`); dismissal persisted in `localStorage` key `smart-wallet:pwa:install-hint-dismissed:v1` so it never reappears. Never renders in standalone or on non-iOS / non-Safari.
- [x] 5.8 `<InstallHint />` mounted in `AppLayout` next to `<BottomTabBar />` / `<OfflineBanner />`.

### Phase 6 — Deploy workflow (D8)

- [x] 6.1 `.github/workflows/deploy-frontend.yml`: added step `Sync service worker + manifest to S3 (correct headers)` with the two `aws s3 cp` commands (`dist/sw.js` → `no-cache, must-revalidate, max-age=0` + `text/javascript`; `dist/manifest.webmanifest` → `public, max-age=3600` + `application/manifest+json`). Placed AFTER `Sync assets to S3 (long-cached, hashed files)` and `Sync HTML to S3 (no-cache)`, BEFORE `Invalidate CloudFront`.

### Phase 7 — Verification (standard mode)

- [x] 7.1 `pnpm --filter @smart-wallet/web build` → success (PWA v1.3.0, `generateSW`, precache 18 entries / 780.89 KiB). `typecheck` (`tsc --noEmit`) → clean. `lint` (`eslint src`) → 0 errors, 1 pre-existing warning in `src/features/dashboard/hooks/useMonthlyDashboard.ts` (not touched by this change).
- [x] 7.2 Inspected `dist/sw.js` precache: hashed `assets/index-*.js`, `assets/index-*.css`, `assets/workbox-window.prod.es5-*.js` present; `index.html` present; **zero `.map` files** in `precacheAndRoute`. Note: `includeAssets` overlaps `globPatterns` so `favicon.svg` / `apple-touch-icon` / the pwa/maskable PNGs / `manifest.webmanifest` appear twice in the list **with identical revisions** — Workbox dedupes these silently (a conflict only throws on same-URL / different-revision). Cosmetic only; kept because D1 / task 1.3 explicitly require `includeAssets`.
- [x] 7.3 `dist/manifest.webmanifest` exposes name "Smart Wallet", short_name "SWallet", start_url "/", scope "/", display "standalone", orientation "portrait", lang "es", background_color / theme_color "#FAF6EB", icons 192 / 512 / 512-maskable. Built `dist/index.html` carries all D7 Apple metas + exactly one injected `<link rel="manifest">`.
- [ ] 7.4 **DEFERRED — human/on-device only.** 6-item manual checklist (install + icon + standalone; cold-launch auth → `/dashboard`; update toast; Airplane Mode offline banner + retry state; notched safe-area; corrupt `refreshToken` → one "Tu sesión expiró" toast → `/login`). Requires an iPhone via `vite preview --host` over mkcert HTTPS + the deployed CloudFront URL. Cannot be executed in this environment.
- [x] 7.5 `git diff --name-only` (staged): `.github/workflows/deploy-frontend.yml`, `packages/web/**`, `pnpm-lock.yaml`. `packages/domain`, `packages/api`, `packages/shared-types`, `packages/infra-cdk`, `packages/infra-sls` untouched. `src/lib/api/client.ts`, `ProtectedRoute.tsx`, `ApiClientBridge.tsx`, `globals.css` untouched. See deviation note on `pnpm-lock.yaml`.

## Deviations from design

1. **`pnpm-lock.yaml` (repo root) is modified.** Unavoidable — task 1.1 requires new dependencies and "pnpm install resolves". Not `packages/web/**` but a direct mechanical consequence of the web `package.json` change. No other workspace `package.json` changed.
2. **`vite-plugin-mkcert` pinned to `^1.17.12`, not v2.** v2.1.0 pulls `undici@8` which crashes on config load in this Node 20.19 environment (`webidl.util.markAsUncloneable is not a function`). v1.17.x has no undici dependency and satisfies D9 identically (dev-only, gated to `command === 'serve'`). CI runs Node 22 (`.nvmrc`) but the pin is safe there too.
3. **`workbox-window` added as an explicit devDependency.** pnpm's non-hoisted layout cannot resolve `workbox-window` (a transitive dep of `vite-plugin-pwa`) from the `virtual:pwa-register/react` module during the Rollup build. This is the documented pnpm workaround for `vite-plugin-pwa`. Not in the design's dependency list but required for the build to succeed.
4. **`public/pwa-64x64.png` committed.** The `minimal-2023` preset emits a 64×64 icon in addition to the four icons named in D6. Committed for completeness; it is precached but not referenced by the manifest. Harmless.
5. **`includeAssets` / `globPatterns` overlap** produces duplicate (identical-revision) precache entries — see task 7.2 note. Kept per D1.

## Commits made (branch `feat/web-pwa-ios`, Conventional Commits, no AI attribution)

- `chore(web): add vite-plugin-pwa build plumbing` — Phase 1
- `feat(web): add PWA monogram icons and iOS head tags` — Phases 2 + 3
- `fix(web): persist auth in localStorage and explain refresh-token expiry` — Phase 4 (CRITICAL PAIR, atomic)
- `feat(web): add offline banner, update toast, and iOS install hint` — Phase 5
- `ci(web): serve sw.js uncached and manifest with correct type` — Phase 6
- `chore(sdd): add web-pwa-ios change artifacts and apply progress` — openspec artifacts + this file

## Monogram review flag

⚠️ **The `public/favicon.svg` monogram and its generated PNGs need a human visual review** before this ships. The mark is legible and correctly coloured (navy field, cream "SW", lime accent) and the Apple icon is opaque, but the hand-authored "S" stroke path is a bit heavy. A designer should refine the source SVG and re-run `pnpm --filter @smart-wallet/web generate-pwa-assets` if a cleaner letterform is wanted.

## Not done / blocked

- Task 7.4 (on-device manual checklist) — deferred to the user; not executable here.
- Nothing blocked.
