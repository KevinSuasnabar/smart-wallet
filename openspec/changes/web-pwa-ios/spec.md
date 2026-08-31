# web-pwa Specification

## Purpose

Make `packages/web` an installable iOS PWA whose authenticated session survives a
cold app launch, with shell-only offline support, a safe service-worker update
path, and correct safe-area handling. No backend, domain, shared-types, or CDK
change.

## Requirements

### Requirement: Web App Manifest and Installability

The app MUST serve a valid Web App Manifest, linked from `index.html`, with
`name` "Smart Wallet", `short_name` "SWallet", `start_url` and `scope` `/`,
`display: standalone`, `orientation: portrait`, `lang: es`, `theme_color` and
`background_color` `#FAF6EB`, and icons at 192×192, 512×512, and 512×512
maskable; the app MUST satisfy the browser's installability bar.

#### Scenario: Passes installability audit

- GIVEN a production build served over HTTPS
- WHEN a DevTools / Lighthouse PWA installability check runs
- THEN the linked manifest exposes every required field with no errors
- AND the browser offers an Add to Home Screen affordance

### Requirement: iOS Home-Screen Identity

The app MUST provide an opaque 180×180 PNG `apple-touch-icon`,
`apple-mobile-web-app-capable` and `mobile-web-app-capable` set to `yes`,
`apple-mobile-web-app-title` "SWallet", and
`apple-mobile-web-app-status-bar-style` `default`, and MUST launch from the iOS
Home Screen with no Safari chrome.

#### Scenario: Home Screen launch is standalone

- GIVEN the app was added to the iOS Home Screen
- WHEN the user opens it from the Home Screen icon
- THEN it runs full-screen with no URL bar or toolbar and `navigator.standalone` is `true`
- AND the icon renders opaque with no transparency

### Requirement: Session Survives Cold Launch

Auth state MUST persist in `localStorage` under key `smart-wallet:auth:v1`
(fields `username`, `idToken`, `refreshToken`) so that killing and relaunching
the standalone app keeps the user authenticated for the Cognito refresh-token
lifetime (~30 days) and lands on `/dashboard` with no login screen.

#### Scenario: Relaunch after app-switcher kill stays signed in

- GIVEN a user authenticated in the standalone app
- WHEN the app is killed from the app switcher and relaunched inside the refresh-token window
- THEN the session is restored from `localStorage` with no boot network call
- AND the user lands on `/dashboard`, never `/login`

#### Scenario: Storage key and shape unchanged

- GIVEN auth state is written or read
- WHEN persistence runs
- THEN it uses `localStorage` key `smart-wallet:auth:v1` with the same three fields
- AND read/write failures are swallowed as before (try/catch)

### Requirement: Refresh-Token Expiry Is Explained

When the stored refresh token is rejected or expired, the app MUST show a
"Tu sesión expiró" notice before redirecting to `/login`, never a silent bounce.

#### Scenario: Expired token shows notice first

- GIVEN a stored refresh token that Cognito rejects
- WHEN the app attempts to refresh the session
- THEN a "Tu sesión expiró" toast is shown
- AND the redirect to `/login` occurs after that notice is displayed

### Requirement: Service-Worker Update Notification

After a new version is deployed, an installed client MUST detect the waiting
service worker and show a "Hay una versión nueva → Recargar" toast; acting on it
MUST activate the new worker and load the new build.

#### Scenario: Update toast and reload

- GIVEN an installed client running build N
- WHEN build N+1 is deployed and the client revisits
- THEN the "Hay una versión nueva → Recargar" toast appears
- AND tapping it activates the waiting worker and reloads on build N+1

### Requirement: Offline Behavior

On offline launch the app MUST render its app shell or an offline fallback and
MUST NOT show a browser error page; a global "sin conexión" banner MUST be
visible whenever the device is offline; data views MUST keep their normal
network-error / retry state; and financial data MUST never be served stale (the
API is network-only).

#### Scenario: Offline launch renders the shell

- GIVEN the app was loaded online before and the device is now offline
- WHEN the user launches the app
- THEN the precached shell or an offline fallback renders
- AND no browser "no internet" error page is shown

#### Scenario: Offline banner and fresh-only data

- GIVEN the device is offline
- WHEN any data view is shown
- THEN a global "sin conexión" banner is visible and clears when connectivity returns
- AND balance / transaction requests are not served from cache; the view shows its retry state

### Requirement: iOS Install Hint

On iOS Safari, when the app is not installed (`!navigator.standalone`), the app
MUST show a dismissible Share → Add to Home Screen hint; once dismissed it MUST
stay dismissed via a persisted flag; it MUST NOT show in standalone mode or on
non-iOS platforms.

#### Scenario: Hint shows once, then stays dismissed

- GIVEN iOS Safari with `navigator.standalone` false and no persisted dismissal
- WHEN the app loads the hint is shown, and the user then dismisses it
- THEN a persisted flag is set and the hint never reappears on later visits
- AND in standalone mode or on a non-iOS browser the hint is never rendered

### Requirement: Safe-Area Correctness

With `viewport-fit=cover` set in the viewport meta, content MUST respect
`env(safe-area-inset-*)`: the bottom tab bar MUST NOT be clipped by the home
indicator and MUST NOT double-pad against `AppLayout`'s existing `pb-28`.

#### Scenario: Tab bar clears the home indicator

- GIVEN a notched iOS device running the app in standalone mode
- WHEN a screen with the bottom tab bar renders
- THEN every tab target is fully tappable above the home indicator
- AND there is no visible double gap between content and the tab bar

### Requirement: Deploy Cache Correctness

The deploy pipeline MUST serve `sw.js` (and `registerSW.js` if emitted) with
`Cache-Control: no-cache, must-revalidate, max-age=0`, MUST serve
`manifest.webmanifest` as `application/manifest+json`, and MUST keep hashed build
assets long-lived immutable.

#### Scenario: Service worker uncached, hashed assets immutable

- GIVEN a completed deploy
- WHEN `sw.js` and a hashed file under `assets/` are requested
- THEN `sw.js` responds with `Cache-Control: no-cache, must-revalidate, max-age=0`
- AND the hashed asset keeps `public, max-age=31536000, immutable`

#### Scenario: Manifest served with correct type

- GIVEN a completed deploy
- WHEN `manifest.webmanifest` is requested
- THEN the response `Content-Type` is `application/manifest+json`

### Requirement: No Backend or Domain Change

The change MUST NOT modify `packages/domain`, `packages/api`,
`packages/shared-types`, or `packages/infra-cdk`.

#### Scenario: Diff is web and workflow only

- GIVEN the full change diff
- WHEN file paths are inspected
- THEN only `packages/web/**` and `.github/workflows/deploy-frontend.yml` are modified
- AND `packages/domain`, `packages/api`, `packages/shared-types`, `packages/infra-cdk` are untouched

## Non-Goals

Push notifications · `apple-touch-startup-image` splash screens · self-hosting
fonts · offline caching of financial data · deep-route back-affordance audit ·
Android `beforeinstallprompt`.
