# Design: Installable PWA for `packages/web` (iOS Safari)

## Technical Approach

Pure frontend + CI slice. `vite-plugin-pwa` (Workbox `generateSW`) derives manifest, service
worker, and precache list from the real Vite build graph; everything else is thin glue: head tags,
one storage-backend swap, one toast, one hook + banner, one generated icon set, one S3 header pass.
No new layer, no new architecture. `packages/domain`, `packages/api`, `packages/shared-types`, and
`packages/infra-cdk` are **untouched**; the dependency rule holds — `web` still imports only
`@smart-wallet/shared-types`. New UI lives in `src/features/pwa/` per the feature-based structure.

## Architecture Decisions

### D1 — Workbox mode: `generateSW`

| Option           | Tradeoff                                                                                | Decision                                                                                  |
| ---------------- | --------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `generateSW`     | Zero SW source to maintain; Workbox owns precache/versioning/`skipWaiting`; config-only | **Chosen**                                                                                |
| `injectManifest` | Full control, needed for push/background sync                                           | Rejected — push is out of scope; a hand-written SW is review surface for a solved problem |

Plugin order `[react(), VitePWA(...)]`. `define: { global: 'globalThis' }` and
`optimizeDeps.esbuildOptions.define` are **untouched** — they exist only for the Cognito SDK in app
code; the generated SW never imports Cognito.

```ts
VitePWA({
  registerType: 'prompt', // user-driven update, pairs with the sonner toast
  injectRegister: null, // we register via virtual:pwa-register/react -> no registerSW.js emitted
  includeAssets: ['favicon.svg', 'apple-touch-icon-180x180.png'],
  manifest: {
    name: 'Smart Wallet',
    short_name: 'SWallet',
    lang: 'es',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#FAF6EB',
    theme_color: '#FAF6EB',
    icons: [
      { src: '/pwa-192x192.png', sizes: '192x192', type: 'image/png' },
      { src: '/pwa-512x512.png', sizes: '512x512', type: 'image/png' },
      {
        src: '/maskable-icon-512x512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  },
  workbox: {
    globPatterns: ['**/*.{js,css,html,svg,png,ico,webmanifest}'],
    globIgnores: ['**/*.map'], // build.sourcemap === true; do not precache maps
    navigateFallback: 'index.html',
    navigateFallbackDenylist: [/^\/api\//],
    cleanupOutdatedCaches: true,
    clientsClaim: true,
    runtimeCaching: [
      /* Google Fonts, see D2 */
    ],
  },
  devOptions: { enabled: false }, // no SW in `vite dev`; test via `vite preview`
});
```

**Manifest source of truth** = the `manifest` object (not `manifest: false` + a static file). One
place to edit, and the plugin injects `<link rel="manifest">` into `index.html` at build — so
`index.html` must **not** hand-add a manifest link (duplicate).

### D2 — Runtime caching: precache shell, network-only API

| Traffic                                              | Strategy                                                                                                                              | Rationale                                                                                                                                                                                                       |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Built shell (`index.html`, hashed `assets/*`, icons) | Workbox precache                                                                                                                      | Instant, offline-capable shell                                                                                                                                                                                  |
| API (`env.apiBaseUrl`, API Gateway origin)           | **No handler → network-only**                                                                                                         | Financial data must never be served stale. The API is a _different origin_, so it is neither precached nor matched by any rule; `navigateFallbackDenylist` is defense-in-depth for same-origin navigations only |
| `fonts.googleapis.com` (CSS)                         | `StaleWhileRevalidate`, cache `google-fonts-css`, 1 week                                                                              | Bounded                                                                                                                                                                                                         |
| `fonts.gstatic.com` (woff2)                          | `CacheFirst`, cache `google-fonts-webfonts`, `maxEntries: 20`, `maxAgeSeconds: 31536000`, `cacheableResponse: { statuses: [0, 200] }` | **Chosen** over leaving fonts uncached: 2 rules turn the offline shell from fallback-font into correct typography, at a hard-bounded cache size                                                                 |

**Offline fallback**: no dedicated offline route or page. `navigateFallback: 'index.html'` + the
precached `index.html` means any cold navigation offline boots React; `AuthProvider` hydrates
synchronously from `localStorage` (no network on boot) so `ProtectedRoute` passes and the user lands
on `/dashboard`. React Query fetches then fail and each view renders its existing `ErrorState` /
`GenericErrorScreen`, while the global banner (D5) explains _why_. Existing components suffice.

### D3 — SW registration and update flow

`virtual:pwa-register/react` `useRegisterSW`, wrapped in a null-rendering side-effect component
`src/features/pwa/PwaUpdater.tsx`, mounted in `Providers.tsx` immediately after `<ApiClientBridge />`
(inside `BrowserRouter` + `AuthProvider`, same tree as `<Toaster>`).

| Option                            | Tradeoff                                                                | Decision                    |
| --------------------------------- | ----------------------------------------------------------------------- | --------------------------- |
| `main.tsx`                        | Outside React tree; `useRegisterSW` is a hook and needs `toast` + i18n  | Rejected                    |
| New `PwaProvider` with context    | Nothing consumes the state                                              | Rejected — over-engineering |
| Null component in `Providers.tsx` | Mirrors the existing `ApiClientBridge` side-effect-component convention | **Chosen**                  |

- `onNeedRefresh` → `toast(t.pwa.updateAvailable, { duration: Infinity, action: { label: t.pwa.updateAction, onClick: () => void updateServiceWorker(true) } })`. `updateServiceWorker(true)` reloads the page.
- `onOfflineReady` → **silent** no-op. Single-user app; a one-time "ready offline" toast is noise the user cannot act on.
- Add `/// <reference types="vite-plugin-pwa/react" />` to `src/vite-env.d.ts` for the virtual module types.

### D4 — Auth storage swap (CRITICAL risk closer)

`src/features/auth/sessionStorage.ts`: replace the three `sessionStorage.*` calls with
`localStorage.*`. **Unchanged**: filename (rename is out of scope), `KEY = 'smart-wallet:auth:v1'`,
`PersistedAuth` shape, the `try/catch` in `readPersisted`. Update the stale "sessionStorage" wording
in the file header and in the `AuthProvider` mount-effect comment.

No change needed in `AuthProvider` bootstrap (same synchronous `readPersisted()`), `ProtectedRoute`,
`ApiClientBridge`, or `client.ts` 401→refresh (it calls the injected `refresh`, storage-agnostic).

**"Tu sesión expiró"** — one choke point: `refreshSession` in `AuthProvider`. `ApiClientBridge`
wires `refresh: refreshSession`, so both the 401 retry path in `client.ts` and any direct caller pass
through it; `client.ts` stays untouched. On rejection (and on the `!cognitoUser || !persisted`
throw), guarded by a `sessionExpiredRef` so it fires **exactly once**:
`toast.error(t.auth.sessionExpired)` → `clearPersisted()` → `queryClient.clear()` →
`setState({ user: null, idToken: null, isLoading: false, requiresNewPassword: false })` →
`navigate(routes.login)` → **rethrow** so the awaiting request still fails. Reset the ref on
successful `signIn`.

### D5 — `useOnlineStatus` + global offline banner

`src/features/pwa/hooks/useOnlineStatus.ts`: `useState(() => navigator.onLine)` +
`useEffect` registering `window` `online`/`offline` listeners with cleanup; returns `boolean`. No
SSR guard — the app is a pure CSR SPA.

`src/features/pwa/components/OfflineBanner.tsx`: returns `null` when online; otherwise a chrome strip
`bg-foreground text-background pt-safe font-mono text-xs uppercase tracking-caption`, `WifiOff`
lucide icon, `role="status" aria-live="polite"`, text `t.pwa.offline`. Uses Tailwind design tokens
directly (matching `BottomTabBar`'s navy chrome treatment) rather than `ColorBlock`, which is a
content-surface component, not a chrome strip.

Placement — minimal `AppLayout` restructure so the banner sits **above `<main>`** without breaking
the desktop sidebar row (there is no app header):

```tsx
<div className="flex min-h-dvh flex-col bg-background md:flex-row">
  <Sidebar className="hidden md:flex …" />
  <div className="flex min-w-0 flex-1 flex-col">
    <OfflineBanner />
    <main className="flex-1 px-5 pb-28 md:px-10 md:pb-10">…</main>
  </div>
  <BottomTabBar className="md:hidden" />
</div>
```

In normal flow, so it pushes content down instead of overlapping. `pt-safe` is a no-op today and
stays a no-op with status-bar-style `default` (top inset ≈ 0), but is correct if the style ever
changes to `black-translucent`.

**Safe-area arithmetic (MED risk)**: bottom inset on a notched iPhone ≈ 34px; `BottomTabBar` is
`h-16` (64px) + `pb-safe` → ≈ 98px tall. `<main class="pb-28">` = 112px > 98px. No clipping, no
double padding — `pb-28` and `pb-safe` are on different elements. Verify on device; do not stack
`pb-safe` onto `<main>`.

### D6 — Monogram icon pipeline

One hand-authored source SVG at `packages/web/public/favicon.svg` (512×512, full-bleed navy
`#201E3E` field, cream `#FAF6EB` "SW", lime `#DCEEB1` accent). Placing the source _at_ the favicon
path fixes today's `/favicon.svg` 404 in the same stroke and gives the generator its input.

`@vite-pwa/assets-generator` (devDependency) + `pwa-assets.config.ts` with the `minimal-2023` preset,
`images: ['public/favicon.svg']`, output into `public/`. Run manually via a
`"generate-pwa-assets"` package script; **outputs are committed** so CI needs no `sharp` step and
builds stay deterministic. Adopt the preset's canonical filenames rather than hand-renaming:

| Preset output                        | Used by                                      |
| ------------------------------------ | -------------------------------------------- |
| `apple-touch-icon-180x180.png`       | `index.html` `<link rel="apple-touch-icon">` |
| `pwa-192x192.png`, `pwa-512x512.png` | manifest `icons`                             |
| `maskable-icon-512x512.png`          | manifest `icons` `purpose: 'maskable'`       |
| `favicon.ico`                        | legacy browsers                              |
| `favicon.svg` (source, passthrough)  | `index.html` `<link rel="icon">`             |

Override the apple entry to `padding: 0`, `resizeOptions: { background: '#201E3E' }` so the
Apple icon is **opaque** (iOS ignores transparency and SVG). Legibility (MED risk): two glyphs, navy
vs. cream contrast ≈ 12:1; review the 180px PNG at 1× before merge.

### D7 — `index.html` head

| Tag                                                                     | Action                                                               |
| ----------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `<meta name="viewport">`                                                | Modify → `width=device-width, initial-scale=1.0, viewport-fit=cover` |
| `<meta name="theme-color">`                                             | Modify `#000000` → `#FAF6EB`                                         |
| `<meta name="apple-mobile-web-app-capable" content="yes">`              | Add                                                                  |
| `<meta name="mobile-web-app-capable" content="yes">`                    | Add (modern equivalent)                                              |
| `<meta name="apple-mobile-web-app-status-bar-style" content="default">` | Add                                                                  |
| `<meta name="apple-mobile-web-app-title" content="SWallet">`            | Add                                                                  |
| `<link rel="apple-touch-icon" href="/apple-touch-icon-180x180.png">`    | Add                                                                  |
| `<link rel="icon" type="image/svg+xml" href="/favicon.svg">`            | Keep (now resolves)                                                  |
| `<link rel="manifest">`                                                 | **Do not add** — injected by `VitePWA` at build                      |
| Google Fonts `preconnect` + stylesheet                                  | Keep unchanged                                                       |

### D8 — Deploy workflow

One new step in `.github/workflows/deploy-frontend.yml`, placed **after** "Sync assets to S3"
(which carries `--delete` and would otherwise stamp these two files `immutable`) and before the
CloudFront invalidation:

```yaml
- name: Sync service worker + manifest to S3 (correct headers)
  run: |
    aws s3 cp packages/web/dist/sw.js "s3://${{ steps.ssm.outputs.bucket }}/sw.js" \
      --cache-control "no-cache, must-revalidate, max-age=0" \
      --content-type "text/javascript"
    aws s3 cp packages/web/dist/manifest.webmanifest "s3://${{ steps.ssm.outputs.bucket }}/manifest.webmanifest" \
      --cache-control "public, max-age=3600" \
      --content-type "application/manifest+json"
```

No `registerSW.js` handling: `injectRegister: null` means the plugin emits none. Hashed
`workbox-*.js` chunks correctly stay `immutable`. The existing `/*` invalidation is unchanged and
remains the backstop.

### D9 — Local on-device HTTPS

| Option                     | Tradeoff                                                                                        | Decision            |
| -------------------------- | ----------------------------------------------------------------------------------------------- | ------------------- |
| `vite-plugin-mkcert`       | Local CA installable + trustable on the iPhone → genuinely trusted secure context, SW registers | **Chosen**          |
| `@vitejs/plugin-basic-ssl` | Self-signed, no installable CA; iOS treats it as untrusted → SW registration blocked            | Rejected            |
| `cloudflared`/ngrok tunnel | Real public cert, zero device config, but an extra moving part and a public URL                 | Documented fallback |

Dev-only devDependency, gated so the production build is byte-identical:

```ts
export default defineConfig(({ command }) => ({
  plugins: [
    react(),
    VitePWA({
      /* … */
    }),
    ...(command === 'serve' ? [mkcert()] : []),
  ],
  /* rest unchanged */
}));
```

`vite build` runs with `command === 'build'` → mkcert never loads. `vite preview --host` runs as
`serve` → HTTPS on the LAN for on-device install testing.

## Data Flow

```
cold launch (standalone, offline or online)
  SW precache ──> index.html (navigateFallback) ──> main.tsx ──> Providers
                                                                   │
                     localStorage 'smart-wallet:auth:v1' ──> AuthProvider (sync, no network)
                                                                   │
                                        user != null ──> ProtectedRoute ──> AppLayout
                                                                   │
                                  OfflineBanner <── useOnlineStatus (navigator.onLine)
                                                                   │
   React Query ──> apiClient ──(network-only, cross-origin)──> API Gateway
                       │ 401
                       └──> refreshSession ──ok──> writePersisted(idToken)
                                            └─fail──> toast "sesión expiró" (once) ──> /login

new deploy ──> sw.js (no-cache) ──> waiting SW ──> onNeedRefresh ──> sonner toast
                                                          "Recargar" ──> updateServiceWorker(true)
```

## File Changes

| File                                                                                                              | Action | Description                                                                                                                            |
| ----------------------------------------------------------------------------------------------------------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/web/vite.config.ts`                                                                                     | Modify | `defineConfig(({ command }) => …)`; add `VitePWA()` after `react()`, conditional `mkcert()`; `define`/`optimizeDeps`/`build` untouched |
| `packages/web/package.json`                                                                                       | Modify | deps: `vite-plugin-pwa`; devDeps: `@vite-pwa/assets-generator`, `vite-plugin-mkcert`; script `generate-pwa-assets`                     |
| `packages/web/pwa-assets.config.ts`                                                                               | Create | `minimal-2023` preset, opaque apple-icon override                                                                                      |
| `packages/web/public/favicon.svg`                                                                                 | Create | Hand-authored monogram source (also fixes the 404)                                                                                     |
| `packages/web/public/{apple-touch-icon-180x180,pwa-192x192,pwa-512x512,maskable-icon-512x512}.png`, `favicon.ico` | Create | Generated, committed                                                                                                                   |
| `packages/web/index.html`                                                                                         | Modify | Head tags per D7                                                                                                                       |
| `packages/web/src/vite-env.d.ts`                                                                                  | Modify | `/// <reference types="vite-plugin-pwa/react" />`                                                                                      |
| `packages/web/src/features/auth/sessionStorage.ts`                                                                | Modify | `sessionStorage` → `localStorage`                                                                                                      |
| `packages/web/src/features/auth/AuthProvider.tsx`                                                                 | Modify | Session-expired toast + cleanup in `refreshSession`; comment fix                                                                       |
| `packages/web/src/features/pwa/PwaUpdater.tsx`                                                                    | Create | `useRegisterSW` → update toast                                                                                                         |
| `packages/web/src/features/pwa/hooks/useOnlineStatus.ts`                                                          | Create | `navigator.onLine` + `online`/`offline` listeners                                                                                      |
| `packages/web/src/features/pwa/components/OfflineBanner.tsx`                                                      | Create | Global offline strip                                                                                                                   |
| `packages/web/src/features/pwa/components/InstallHint.tsx`                                                        | Create | iOS-only, dismissed permanently via a `localStorage` flag                                                                              |
| `packages/web/src/app/Providers.tsx`                                                                              | Modify | Mount `<PwaUpdater />`                                                                                                                 |
| `packages/web/src/app/layouts/AppLayout.tsx`                                                                      | Modify | Wrap `<main>` in a column div; render `<OfflineBanner />`                                                                              |
| `packages/web/src/lib/i18n.ts`                                                                                    | Modify | `t.pwa.*` (offline, updateAvailable, updateAction, installHint, installDismiss) + `t.auth.sessionExpired`                              |
| `.github/workflows/deploy-frontend.yml`                                                                           | Modify | SW/manifest header step per D8                                                                                                         |

**Untouched**: `packages/domain`, `packages/api`, `packages/shared-types`, `packages/infra-cdk`,
`packages/infra-sls`, `src/lib/api/client.ts`, `ProtectedRoute.tsx`, `ApiClientBridge.tsx`,
`globals.css` (`.pb-safe`/`.pt-safe` already exist and simply become live under `viewport-fit=cover`).

## Interfaces / Contracts

```ts
// src/features/pwa/hooks/useOnlineStatus.ts
export const useOnlineStatus = (): boolean;

// src/features/auth/sessionStorage.ts — shape and key unchanged, backend swapped
interface PersistedAuth { username: string; idToken: string; refreshToken: string }
```

No API contract, no `shared-types` change, no persisted-data migration: the storage key and JSON
shape are identical, only the `Storage` object differs.

## Testing Strategy

Standard Mode — no test runner is configured (`"test": "echo 'no tests yet'"`). Verification is a
manual on-device checklist plus the existing static gates.

| Layer                | What                                                               | Approach                                                                                                                                            |
| -------------------- | ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Static               | build / typecheck / lint                                           | `pnpm --filter @smart-wallet/web build && typecheck && lint`; inspect `dist/sw.js` precache manifest for correct hashed names and no `.map` entries |
| Manual (device)      | See checklist below                                                | iPhone via `vite preview --host` over mkcert HTTPS, then the deployed CloudFront URL                                                                |
| Unit (future change) | `useOnlineStatus`, `sessionStorage.ts`, iOS install-hint detection | Pure, DOM-only, no network — the three natural first targets once Vitest lands                                                                      |

Manual checklist ↔ spec scenarios:

1. **Install** — Share → Add to Home Screen; monogram icon crisp at 1×, label reads `SWallet`; launches with no Safari chrome.
2. **Cold-launch auth** — sign in, kill from the app switcher, relaunch → lands on `/dashboard`, no login screen.
3. **Update toast** — redeploy, reopen the installed app → "Recargar" toast appears; tapping it serves the new build.
4. **Offline banner** — enable Airplane Mode → banner visible; data views show their normal network-error state; **no stale balances**; cold launch offline still renders the shell.
5. **Safe area** — notched device: bottom tab bar not clipped by the home indicator, no double bottom padding, banner clears the status bar.
6. **Session expiry** — corrupt the stored `refreshToken` → exactly one "Tu sesión expiró" toast, then `/login`.

## Threat Matrix

| Boundary                 | Applicability | Reason                                                                     |
| ------------------------ | ------------- | -------------------------------------------------------------------------- |
| Documentation-like paths | N/A           | No file-classification or execution boundary; only static assets are added |
| Git repository selection | N/A           | No `git` invocation is designed                                            |
| Commit state             | N/A           | No VCS automation                                                          |
| Push state               | N/A           | No VCS automation                                                          |
| PR commands              | N/A           | No PR automation                                                           |

The only shell added is two literal `aws s3 cp` commands in a GitHub Actions step with no
user-controlled input (bucket comes from an SSM-sourced step output, paths are build-fixed
constants). Service-worker `navigateFallback` is client-side SPA routing, same-origin and already
mirrored by the existing CloudFront 403/404 → `/index.html` behavior.

## Migration / Rollout

No data migration. The `localStorage` swap is a cold read of a key that was never in `localStorage`,
so an in-flight `sessionStorage` session is simply not carried over — the user signs in once, then
persists for ~30 days. Single-PR rollout.

Rollback, per component and independent:

| Component                     | Rollback                                                                                                                          |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| SW / manifest / icons         | Remove `VitePWA()` + deps. A previously-registered SW self-destructs on the next build without one; or delete the home-screen app |
| Auth storage                  | Revert `sessionStorage.ts` to `sessionStorage` (users re-login once)                                                              |
| `index.html` head             | Revert the head block                                                                                                             |
| Offline banner / update toast | Remove `<OfflineBanner />` from `AppLayout` and `<PwaUpdater />` from `Providers.tsx`                                             |
| Deploy workflow               | Revert the added step; the `/*` invalidation still covers correctness                                                             |

## Open Questions

- [ ] None blocking. Deferred by the proposal: Android `beforeinstallprompt`, splash screens,
      self-hosted fonts, back-affordance audit for deep sub-routes (no swipe-back in standalone —
      accepted MED risk), renaming `sessionStorage.ts` → `authStorage.ts`.
