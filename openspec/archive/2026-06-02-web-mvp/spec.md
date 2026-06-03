# Spec: web-mvp

> SDD phase: spec
> Project: smart-wallet
> Change: web-mvp
> Date: 2026-05-12
> Engram topic_key: `sdd/web-mvp/spec`

---

## 1. Glossary

| Term                           | Definition                                                                                                                                                                                                                                                          |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **AppLayout**                  | The layout wrapper rendered for all protected routes. Contains the navigation surface (BottomNav on mobile, Sidebar on desktop) and a content Outlet. Only visible to authenticated users.                                                                          |
| **AuthGuard / ProtectedRoute** | A route-level component that reads auth state and redirects unauthenticated users to `/login?next={pathname}` before rendering any protected content.                                                                                                               |
| **AuthProvider**               | A React context provider that owns auth state in memory and exposes `login`, `logout`, `signup`, `confirmSignup`, `forgotPassword`, `refreshSession`, and current user data.                                                                                        |
| **BottomNav**                  | A fixed bottom navigation bar rendered on viewports narrower than `md` (768 px). Contains four items: Wallets, FAB (Add Transaction), Categories, Settings. Respects iOS safe-area-inset-bottom.                                                                    |
| **Currency**                   | A string literal union `"USD" \| "PEN"`. Fixed for MVP. No other currency is accepted.                                                                                                                                                                              |
| **FAB**                        | A floating action button centered in the BottomNav that opens the Add Transaction page or modal. Fixed to the viewport on mobile.                                                                                                                                   |
| **IdToken**                    | A Cognito-issued JWT obtained after successful login. Sent as `Authorization: Bearer <IdToken>` on every API request. Short-lived; refreshed automatically on 401.                                                                                                  |
| **Idempotency-Key**            | A UUID v4 string generated client-side immediately before a transaction creation request is submitted. Sent in the `Idempotency-Key` HTTP request header. Stored in form state for the duration of the submit lifecycle so that network retries reuse the same key. |
| **PublicLayout**               | The layout wrapper rendered for auth routes (`/login`, `/signup`, `/signup/confirm`, `/forgot-password`, `/forgot-password/confirm`). Has no navigation surface.                                                                                                    |
| **RefreshToken**               | A long-lived Cognito token stored in sessionStorage alongside the IdToken. Used to obtain a new IdToken when the current one expires (via Cognito `refreshSession()`).                                                                                              |
| **SessionStorage hydration**   | On `AuthProvider` mount, previously persisted auth state (IdToken + RefreshToken + username) is read from `sessionStorage` and loaded into memory. No API call is made to validate the token upfront.                                                               |
| **Sidebar**                    | A collapsible left navigation panel rendered on viewports `md` (768 px) and wider. Shows the same nav links as BottomNav.                                                                                                                                           |
| **Skeleton**                   | A placeholder UI component rendered while data is loading. Matches the shape of the real content it will replace. Replaces spinners entirely.                                                                                                                       |
| **Single-flight refresh**      | A mechanism ensuring that when multiple concurrent API requests all receive a 401, exactly one `refreshSession()` call is made. All waiting requests share a single in-flight promise and retry once that promise resolves.                                         |
| **Toast**                      | A non-blocking notification message displayed at the edge of the screen to confirm actions or communicate errors. Uses Sonner internally.                                                                                                                           |
| **Wallet**                     | A named financial account owned by a user, locked to one currency at creation, with a running balance updated on every transaction. Defined fully in the `wallet-mvp` backend spec; the web layer consumes it as read-only data returned by the API.                |
| **ApiError**                   | A typed error object thrown by the API client for any non-2xx response. Contains `status` (HTTP status code), `code` (machine-readable error string), and optional `details`.                                                                                       |

---

## 2. Requirements

### Auth (AUTH)

- **REQ-AUTH-01**: A user can sign up by providing an email address and a password that satisfies the Cognito password policy (minimum 10 characters including uppercase, lowercase, digit). On success, Cognito sends a 6-digit verification code to the provided email.
- **REQ-AUTH-02**: After sign-up, the user must confirm their account by entering the 6-digit code received by email. Until confirmed, login is not possible.
- **REQ-AUTH-03**: On the confirmation page, the user can request a new verification code. The UI displays a "Resend code" action that submits the resend request to Cognito and shows a confirmation message.
- **REQ-AUTH-04**: A confirmed user can log in with their email and password. On success, the auth state (IdToken, RefreshToken, username) is held in memory and persisted to sessionStorage for reload hydration.
- **REQ-AUTH-05**: A user can initiate a password reset by providing their email on the forgot-password page. Cognito sends a reset code to that email. The user enters the code plus a new password on the confirmation page to complete the reset.
- **REQ-AUTH-06**: On app mount (page reload), the AuthProvider reads `sessionStorage` and restores the previous auth state without making any API call. The user remains considered authenticated until the first API request succeeds or fails.
- **REQ-AUTH-07**: When any protected API request receives a 401 response, the API client immediately attempts to refresh the IdToken using the stored RefreshToken. On successful refresh, the original request is retried exactly once with the new IdToken. If the refresh itself fails, the session is cleared and the user is redirected to `/login`.
- **REQ-AUTH-08**: When a user signs out, the following must occur in order: (1) local Cognito SDK session is cleared; (2) a best-effort server-side global sign-out is called (invalidates all refresh tokens); (3) in-memory auth state is cleared; (4) `sessionStorage` auth entry is removed; (5) TanStack Query cache is cleared; (6) user is navigated to `/login`.
- **REQ-AUTH-09**: When multiple concurrent API requests all return 401 simultaneously, exactly one `refreshSession()` call is made. All concurrent requests wait for that single promise to settle, then each retries once. No thundering herd of refresh calls occurs.

### Routing and Navigation (NAV)

- **REQ-NAV-01**: Any route inside the AppLayout renders its ProtectedRoute guard first. If the user has no auth state, the guard redirects to `/login?next={original pathname}` before rendering any protected content or firing any protected API call.
- **REQ-NAV-02**: After a successful login, the user is redirected to the path recorded in the `next` query parameter. If no `next` parameter is present, the user is redirected to `/wallets`.
- **REQ-NAV-03**: On viewports narrower than `md` (768 px), a BottomNav is displayed with four items: Wallets, FAB (Add Transaction), Categories, Settings. The FAB is visually centered and elevated above the others.
- **REQ-NAV-04**: On viewports `md` (768 px) and wider, a collapsible left Sidebar is displayed in place of the BottomNav. The Sidebar shows the same nav links.
- **REQ-NAV-05**: A user who types a protected URL directly (e.g., `/wallets/abc123`) or refreshes the page on that URL sees the correct page — CloudFront routes all 403 and 404 responses to `/index.html` with HTTP 200, allowing the SPA router to take over.
- **REQ-NAV-06**: Any URL that does not match a defined route displays a NotFound page. The NotFound page includes a link back to `/wallets`.

### Wallets (WAL)

- **REQ-WAL-01**: An authenticated user can view a list of all their wallets on `/wallets`. Each wallet shows its name, currency, and current balance.
- **REQ-WAL-02**: An authenticated user can create a new wallet by providing a name (1–64 characters) and selecting a currency (USD or PEN). On success, the wallet appears in the list with a balance of `$0.00` (or `S/0.00` for PEN).
- **REQ-WAL-03**: An authenticated user can view a wallet detail page at `/wallets/:walletId` showing the wallet name, currency, and current balance.
- **REQ-WAL-04**: The wallet detail page shows the most recent transactions inline (limited preview). A link or tab directs the user to the full transaction list at `/wallets/:walletId/transactions`.
- **REQ-WAL-05**: All monetary amounts are formatted using `Intl.NumberFormat`: USD uses locale `en-US` with currency style, PEN uses locale `es-PE` with currency style.
- **REQ-WAL-06**: The wallet creation form validates the name field (required, 1–64 chars) and currency field (required, must be USD or PEN) before submission. The submit button is disabled when the form is invalid or while a submission is in progress.
- **REQ-WAL-07**: When a user has no wallets, the `/wallets` page shows an empty state with a call-to-action that navigates to `/wallets/new`.
- **REQ-WAL-08**: Wallet currency is displayed as read-only information everywhere in the UI. No control allows the user to change a wallet's currency after creation.

### Transactions (TXN)

- **REQ-TXN-01**: An authenticated user can add a transaction to a wallet via the Add Transaction form. The form requires: transaction type (income or expense), amount (decimal, > 0), category (filtered by type), and date (`occurredAt`). Description is optional.
- **REQ-TXN-02**: The currency field on the Add Transaction form is auto-populated from the selected wallet and is read-only. The user cannot change the transaction currency independently.
- **REQ-TXN-03**: The amount field accepts decimal input (e.g., `12.34`). The UI enforces that the value is a positive decimal with at most 2 decimal places. The API client sends the value as a decimal string; the backend handles cents conversion.
- **REQ-TXN-04**: The category picker shows predefined categories and custom categories, filtered to match the selected transaction type. Income categories are only shown when `type = income`; expense categories only when `type = expense`.
- **REQ-TXN-05**: The `occurredAt` field defaults to the current date and time. The user can backdate it by selecting any date up to 5 years in the past. The user cannot set a date more than 1 day in the future.
- **REQ-TXN-06**: Immediately before each form submission, a UUID v4 is generated and attached as the `Idempotency-Key` header on the API request. This key remains constant for the duration of that submission attempt (including any framework-level retries for the same user action).
- **REQ-TXN-07**: On successful transaction creation, the user sees a success toast message and the form resets (or the user is navigated back to the wallet detail page). The wallet detail and transaction list queries are invalidated so the updated balance is visible immediately.
- **REQ-TXN-08**: When the form has per-field validation errors (e.g., empty amount, invalid date), each error message is displayed inline beneath the relevant field. The user can correct fields individually.
- **REQ-TXN-09**: When the API returns a server error (5xx or unexpected 4xx), the user sees a toast error message. The form remains open so the user can retry.
- **REQ-TXN-10**: The full transaction list at `/wallets/:walletId/transactions` supports filtering by date range (from / to) and by transaction type (income / expense). Filters are displayed in a collapsible panel.
- **REQ-TXN-11**: The transaction list uses cursor-based pagination. A "Load more" button appears at the bottom of the list when more results are available. Clicking it appends the next page without replacing the current results.
- **REQ-TXN-12**: In transaction lists, income transactions display with a `+` prefix and green color; expense transactions display with a `-` prefix and red color. The amount value itself is always positive.
- **REQ-TXN-13**: When a wallet has no transactions (or the active filters produce no results), the list shows an empty state message. For filtered results, the empty state indicates that no transactions match the current filters.

### Categories (CAT)

- **REQ-CAT-01**: An authenticated user can view all categories on `/categories`: predefined categories grouped by type and custom categories grouped by type. Both groups are visible together.
- **REQ-CAT-02**: An authenticated user can create a custom category by providing a name (1–32 characters) and a type (income or expense). The new category appears immediately in the list.
- **REQ-CAT-03**: An authenticated user can delete a custom category. The delete action is available only on custom categories; predefined categories show no delete control.
- **REQ-CAT-04**: Attempting to delete a category shows a confirmation dialog before the delete request is sent. The user must confirm before the action proceeds.
- **REQ-CAT-05**: The custom category creation form validates: name is required (1–32 characters) and type must be selected. The submit button is disabled when invalid or while submitting.

### UI and Mobile-first (UI)

- **REQ-UI-01**: Every interactive element (button, link, input, select, toggle) has a minimum touch target size of 44×44 px.
- **REQ-UI-02**: The BottomNav includes bottom padding equal to the device's `safe-area-inset-bottom` so content is not obscured by the iOS home indicator or Android gesture bar.
- **REQ-UI-03**: All data-loading states show Skeleton placeholders that match the shape of the real content. No spinner components are used anywhere in the application.
- **REQ-UI-04**: A manual Lighthouse mobile audit run on the production build must score ≥ 90 on Performance, Accessibility, Best Practices, and SEO before each deploy.
- **REQ-UI-05**: The initial JavaScript bundle (gzip-compressed) must be less than 300 KB.
- **REQ-UI-06**: All forms are keyboard-navigable: the user can tab through fields, select from dropdowns, and submit without using a pointer device.
- **REQ-UI-07**: Every interactive element has a visible focus indicator when focused via keyboard navigation.
- **REQ-UI-08**: Text and background color combinations meet WCAG AA contrast ratio (4.5:1 minimum for normal text, 3:1 for large text).

### Error Handling (ERR)

- **REQ-ERR-01**: API errors must not expose stack traces, internal error codes, or technical details to the user. The UI maps error codes to friendly user-facing messages.
- **REQ-ERR-02**: Form field validation errors are displayed inline, beneath each affected field, using the form library's field-level error binding. Errors appear after a field is touched or after a failed submit attempt.
- **REQ-ERR-03**: A global ErrorBoundary at the application root catches unrecoverable React render errors (component crashes) and displays a "Something went wrong" screen with a reload button. It does not catch async errors or query/mutation failures.
- **REQ-ERR-04**: A 401 response from any API call triggers the silent refresh flow (REQ-AUTH-07). The user is never shown a 401 error message during a successful refresh-and-retry cycle.

### Money and Currency (MNY)

- **REQ-MNY-01**: All monetary amounts displayed in the UI are formatted with `Intl.NumberFormat`. USD amounts use `en-US` locale and PEN amounts use `es-PE` locale, both with `style: "currency"`.
- **REQ-MNY-02**: Income transactions are displayed with a `+` sign prefix and green color styling. Expense transactions are displayed with a `-` sign prefix and red color styling. The underlying amount value from the API is always positive; the sign is derived from `type`.
- **REQ-MNY-03**: Wallet currency is immutable after creation. No UI control allows changing a wallet's currency. The currency is displayed as read-only text on all wallet-related screens.

### Validation (VAL)

- **REQ-VAL-01**: All form schemas are sourced from `@smart-wallet/shared-types`. No duplicate schema definitions exist in the web package.
- **REQ-VAL-02**: Form submit buttons are disabled when the form state is invalid (per schema) or when a submission is already in progress.
- **REQ-VAL-03**: All user-facing validation error messages are written in Spanish.

### Accessibility (A11Y)

- **REQ-A11Y-01**: Every button and icon-only action has an accessible label (either visible text or `aria-label`).
- **REQ-A11Y-02**: Every form input has an associated `<label>` element that is programmatically linked (via `htmlFor` / `id` or wrapping label).
- **REQ-A11Y-03**: Modal dialogs and sheet overlays trap focus within their bounds while open. When closed, focus returns to the element that triggered the opening.
- **REQ-A11Y-04**: Toast notifications are announced to screen reader users via an `aria-live` region.

### Hosting and Infrastructure (INFRA)

- **REQ-INFRA-01**: The application is deployed to an S3 bucket with all public access blocked. CloudFront accesses the bucket via OAC (Origin Access Control).
- **REQ-INFRA-02**: The CloudFront distribution maps both 403 and 404 S3 responses to `/index.html` with HTTP status 200, enabling SPA deep-link routing without server-side rendering.
- **REQ-INFRA-03**: `index.html` is served with `Cache-Control: no-cache, no-store, must-revalidate` so users always receive the latest SPA entry point. Static assets (with Vite-generated content hashes in filenames) are served with `Cache-Control: public, max-age=31536000, immutable`.
- **REQ-INFRA-04**: After the first CDK deploy, the operator manually reads the CloudFront distribution domain from the CDK output (or SSM parameter `/smart-wallet/prod/web/distribution-domain`) and adds it to the Cognito User Pool Client's `callbackUrls` and `logoutUrls` before the second CDK deploy.
- **REQ-INFRA-05**: Three SSM parameters are created under `/smart-wallet/prod/web/`: `bucket-name`, `distribution-id`, and `distribution-domain`. These are consumed by the deploy script.
- **REQ-INFRA-06**: The deploy script builds the application, syncs assets to S3 (with correct Cache-Control metadata per file type), and invalidates only `/index.html` in CloudFront. The script reads SSM parameter values; no bucket name or distribution ID is hardcoded.

### Code Quality (CODE)

- **REQ-CODE-01**: `pnpm typecheck` (`tsc --noEmit`) passes across all packages at the end of every PR. No type errors are tolerated.
- **REQ-CODE-02**: `pnpm lint` (ESLint) passes across all packages at the end of every PR. No lint errors are tolerated.
- **REQ-CODE-03**: All imports use explicit `import type` for type-only imports, honoring `verbatimModuleSyntax`. Build fails if this is violated.
- **REQ-CODE-04**: The `packages/web` package must not import from `packages/api` or `packages/domain`. It speaks to the backend exclusively over HTTP. Only `@smart-wallet/shared-types` may be imported from the workspace.
- **REQ-CODE-05**: No backend source files (`infra-sls/`, `api/`, `domain/`, `shared-types/`) are modified by this change.

---

## 3. Scenarios (Given/When/Then)

### Scenario SCN-AUTH-01: Sign up new user

- **Covers**: REQ-AUTH-01, REQ-NAV-02
- Given: the user is on `/signup` and no Cognito account exists for `"test@example.com"`
- When: the user fills in email `"test@example.com"` and a valid password (≥10 chars, uppercase, lowercase, digit) and submits
- Then: Cognito creates the account in unconfirmed state; the UI navigates to `/signup/confirm` with the email pre-filled (via router state or query param); a message instructs the user to check their email for a code

### Scenario SCN-AUTH-02: Sign up with weak password shows inline error

- **Covers**: REQ-AUTH-01, REQ-VAL-02, REQ-VAL-03, REQ-ERR-02
- Given: the user is on `/signup`
- When: the user enters a password shorter than 10 characters or missing a required character class and submits
- Then: the submit is blocked; an inline validation error appears beneath the password field in Spanish; no Cognito call is made

### Scenario SCN-AUTH-03: Confirm signup with valid code

- **Covers**: REQ-AUTH-02
- Given: the user is on `/signup/confirm` with `"test@example.com"` pre-filled
- When: the user enters the correct 6-digit code and submits
- Then: Cognito confirms the account; the UI redirects to `/login`; a success toast is shown

### Scenario SCN-AUTH-04: Confirm signup with wrong code

- **Covers**: REQ-AUTH-02, REQ-ERR-01
- Given: the user is on `/signup/confirm`
- When: the user enters an incorrect code and submits
- Then: a toast error appears explaining the code is invalid; the form remains open; no redirect occurs

### Scenario SCN-AUTH-05: Resend verification code

- **Covers**: REQ-AUTH-03
- Given: the user is on `/signup/confirm` and has already received one code
- When: the user clicks "Resend code"
- Then: Cognito sends a new code to the user's email; the UI shows a confirmation message indicating the code was resent

### Scenario SCN-AUTH-06: Login with valid credentials

- **Covers**: REQ-AUTH-04, REQ-NAV-02
- Given: the user is on `/login` with a confirmed Cognito account
- When: the user enters valid email and password and submits
- Then: Cognito returns tokens; auth state (IdToken, RefreshToken, username) is stored in memory and in sessionStorage; the user is redirected to `/wallets`

### Scenario SCN-AUTH-07: Login and redirect to intended destination

- **Covers**: REQ-AUTH-04, REQ-NAV-01, REQ-NAV-02
- Given: an unauthenticated user attempts to navigate directly to `/wallets/abc123`
- When: the ProtectedRoute redirects them to `/login?next=%2Fwallets%2Fabc123` and the user logs in
- Then: after successful login, the user is redirected to `/wallets/abc123` (not to `/wallets`)

### Scenario SCN-AUTH-08: Login with wrong password

- **Covers**: REQ-AUTH-04, REQ-ERR-01
- Given: the user is on `/login`
- When: the user submits incorrect credentials
- Then: a toast error message is shown (in Spanish, without exposing Cognito error internals); no redirect occurs; the form remains open

### Scenario SCN-AUTH-09: Password reset — request code

- **Covers**: REQ-AUTH-05
- Given: the user is on `/forgot-password`
- When: the user enters their registered email and submits
- Then: Cognito sends a reset code to that email; the UI navigates to `/forgot-password/confirm` with the email pre-filled

### Scenario SCN-AUTH-10: Password reset — confirm new password

- **Covers**: REQ-AUTH-05
- Given: the user is on `/forgot-password/confirm` with a valid reset code
- When: the user enters the code and a new valid password, then submits
- Then: Cognito updates the password; the UI redirects to `/login` with a success toast; the user can now log in with the new password

### Scenario SCN-AUTH-11: Session hydration on page reload

- **Covers**: REQ-AUTH-06, REQ-NAV-01
- Given: the user is logged in and their auth tokens are in sessionStorage; they reload the page on `/wallets`
- When: the AuthProvider mounts
- Then: it reads sessionStorage and restores auth state in memory without making any API call; the user remains on `/wallets` and sees their wallet list normally; no redirect to `/login` occurs

### Scenario SCN-AUTH-12: Silent token refresh on 401

- **Covers**: REQ-AUTH-07, REQ-ERR-04
- Given: the user is logged in and the IdToken has just expired
- When: any protected API request is made and receives a 401 response
- Then: the API client calls `refreshSession()` with the stored RefreshToken; on success, the original request is retried once with the new IdToken; the user sees no error flash and no redirect

### Scenario SCN-AUTH-13: Refresh fails — redirect to login

- **Covers**: REQ-AUTH-07, REQ-AUTH-08
- Given: the user is logged in but both the IdToken and RefreshToken are expired or revoked
- When: any protected API request returns 401 and the subsequent `refreshSession()` also fails
- Then: sessionStorage is cleared; in-memory auth state is cleared; TanStack Query cache is cleared; the user is redirected to `/login`

### Scenario SCN-AUTH-14: Concurrent 401s share one refresh call

- **Covers**: REQ-AUTH-09
- Given: three separate queries fire simultaneously and all receive 401 responses
- When: the API client receives the three 401s
- Then: exactly one `refreshSession()` call is initiated; all three requests await the same promise; after the promise resolves, each request retries once; no duplicate refresh calls are made

### Scenario SCN-AUTH-15: Sign out clears all state

- **Covers**: REQ-AUTH-08
- Given: the user is logged in and has cached wallet data in the TanStack Query cache
- When: the user clicks "Sign out" on the Settings page
- Then: local Cognito session is cleared; a best-effort global sign-out request is fired; in-memory auth state is cleared; sessionStorage auth entry is removed; TanStack Query cache is cleared; the user is navigated to `/login`; visiting a protected route afterward redirects back to `/login`

### Scenario SCN-NAV-01: Unauthenticated access to protected route

- **Covers**: REQ-NAV-01
- Given: no auth state exists (sessionStorage is empty, no in-memory token)
- When: the user navigates to `/wallets`
- Then: the ProtectedRoute intercepts and redirects to `/login?next=%2Fwallets` before any wallet API call is made

### Scenario SCN-NAV-02: Mobile viewport shows BottomNav

- **Covers**: REQ-NAV-03, REQ-UI-01, REQ-UI-02
- Given: an authenticated user opens the app on a device with viewport width less than 768 px
- When: any protected page is displayed
- Then: the BottomNav is visible and fixed at the bottom of the viewport; it contains four items (Wallets, FAB, Categories, Settings); bottom padding accounts for `safe-area-inset-bottom`; the Sidebar is not visible

### Scenario SCN-NAV-03: Desktop viewport shows Sidebar

- **Covers**: REQ-NAV-04
- Given: an authenticated user opens the app on a device with viewport width ≥ 768 px
- When: any protected page is displayed
- Then: the Sidebar is visible on the left; the BottomNav is not visible

### Scenario SCN-NAV-04: Direct URL navigation works after deploy

- **Covers**: REQ-NAV-05, REQ-INFRA-02
- Given: the app is deployed to CloudFront
- When: the user types `https://<cf-domain>/wallets/abc123` directly in the browser address bar (authenticated via sessionStorage)
- Then: CloudFront maps the 403/404 to `/index.html` with HTTP 200; the React Router loads `/wallets/:walletId` and the wallet detail page renders normally

### Scenario SCN-NAV-05: Unmatched route shows 404 page

- **Covers**: REQ-NAV-06
- Given: the user navigates to a URL that does not match any defined route (e.g., `/foo/bar`)
- When: the React Router resolves the path
- Then: the NotFound page is displayed; it includes a link back to `/wallets`

### Scenario SCN-WAL-01: List wallets with balance

- **Covers**: REQ-WAL-01, REQ-WAL-05, REQ-MNY-01
- Given: an authenticated user has two wallets — "Efectivo" (USD, balance `"50.00"`) and "Ahorros" (PEN, balance `"200.00"`)
- When: the user navigates to `/wallets`
- Then: both wallets are displayed; "Efectivo" shows `$50.00` (formatted with `en-US` locale); "Ahorros" shows `S/ 200.00` (formatted with `es-PE` locale)

### Scenario SCN-WAL-02: Empty wallets state

- **Covers**: REQ-WAL-07
- Given: an authenticated user has no wallets
- When: the user navigates to `/wallets`
- Then: an empty state is displayed with a call-to-action button; clicking it navigates to `/wallets/new`

### Scenario SCN-WAL-03: Create wallet — success

- **Covers**: REQ-WAL-02, REQ-WAL-05, REQ-MNY-01
- Given: an authenticated user is on `/wallets/new`
- When: the user enters name `"Efectivo"`, selects currency `"USD"`, and submits
- Then: `POST /wallets` is called with `{ name: "Efectivo", currency: "USD" }`; on 201 response, the TanStack Query wallet list is invalidated; the user is navigated to `/wallets`; the new wallet appears in the list with balance `$0.00`

### Scenario SCN-WAL-04: Create wallet — validation errors

- **Covers**: REQ-WAL-06, REQ-VAL-02, REQ-VAL-03, REQ-ERR-02
- Given: an authenticated user is on `/wallets/new`
- When: the user submits the form without entering a name or selecting a currency
- Then: inline validation errors appear beneath the name and currency fields in Spanish; no API call is made; the submit button is disabled

### Scenario SCN-WAL-05: Create wallet — name too long

- **Covers**: REQ-WAL-06, REQ-VAL-01
- Given: an authenticated user is on `/wallets/new`
- When: the user enters a name exceeding 64 characters
- Then: the form schema (from `shared-types`) rejects the value; an inline error appears; the submit button is disabled; no API call is made

### Scenario SCN-WAL-06: Wallet detail page

- **Covers**: REQ-WAL-03, REQ-WAL-04, REQ-WAL-05, REQ-MNY-01, REQ-MNY-02
- Given: an authenticated user has wallet "W1" (USD, balance `"8.84"`) with a recent expense transaction of `-$3.50` and an income transaction of `+$12.34`
- When: the user navigates to `/wallets/W1`
- Then: the wallet name, `USD` currency, and balance `$8.84` are displayed; the two most recent transactions are shown inline with signed formatting (`+$12.34` in green, `−$3.50` in red); a link to the full transaction list is visible

### Scenario SCN-WAL-07: Wallet loading skeleton

- **Covers**: REQ-UI-03
- Given: an authenticated user navigates to `/wallets` while the GET /wallets request is in flight
- When: the page renders before data is available
- Then: skeleton placeholders shaped like wallet cards are displayed; no spinner or empty content is shown

### Scenario SCN-TXN-01: Add income transaction — success

- **Covers**: REQ-TXN-01, REQ-TXN-02, REQ-TXN-06, REQ-TXN-07, REQ-MNY-01
- Given: an authenticated user is on `/transactions/new` with wallet "W1" (USD) selected
- When: the user selects type `income`, enters amount `100.00`, selects category `income:salary`, leaves `occurredAt` as now, and submits
- Then: a UUID v4 Idempotency-Key is generated; `POST /wallets/W1/transactions` is sent with the key in the `Idempotency-Key` header; on success, a toast says the transaction was added; the user is navigated back; the wallet detail balance query is invalidated

### Scenario SCN-TXN-02: Add expense transaction — success

- **Covers**: REQ-TXN-01, REQ-TXN-12
- Given: an authenticated user is on `/transactions/new` with wallet "W1" (USD, balance `$100.00`) selected
- When: the user selects type `expense`, enters amount `30.00`, selects category `expense:food`, and submits
- Then: the transaction is created; after invalidation, the wallet balance updates to `$70.00`; the transaction list shows `−$30.00` in red

### Scenario SCN-TXN-03: Currency is read-only on transaction form

- **Covers**: REQ-TXN-02, REQ-MNY-03
- Given: an authenticated user is on `/transactions/new` with wallet "W1" (PEN) selected
- When: the transaction form renders
- Then: the currency field displays `PEN` and is read-only; the user cannot modify it; the value is programmatically set from the selected wallet's currency

### Scenario SCN-TXN-04: Amount validation — non-positive value

- **Covers**: REQ-TXN-03, REQ-VAL-01, REQ-VAL-02, REQ-ERR-02
- Given: an authenticated user is on `/transactions/new`
- When: the user enters `0` or a negative amount in the amount field and attempts to submit
- Then: an inline validation error appears beneath the amount field in Spanish; the submit button is disabled; no API call is made

### Scenario SCN-TXN-05: Amount validation — more than 2 decimal places

- **Covers**: REQ-TXN-03, REQ-VAL-01, REQ-ERR-02
- Given: an authenticated user enters `10.123` in the amount field
- When: the form validates
- Then: an inline error appears; the submit is blocked; no API call is made

### Scenario SCN-TXN-06: Category picker filtered by transaction type

- **Covers**: REQ-TXN-04
- Given: an authenticated user is on `/transactions/new` and has selected type `income`
- When: the category picker opens
- Then: only income categories (predefined income + custom income) are displayed; expense categories are not shown

### Scenario SCN-TXN-07: Category picker updates when type changes

- **Covers**: REQ-TXN-04
- Given: an authenticated user has selected type `income` and category `income:salary` on the transaction form
- When: the user changes type to `expense`
- Then: the category field resets (no selection); the category picker now shows only expense categories; `income:salary` is not available

### Scenario SCN-TXN-08: occurredAt defaults to now and can be backdated

- **Covers**: REQ-TXN-05
- Given: an authenticated user opens the Add Transaction form
- When: the form renders
- Then: the `occurredAt` field is pre-populated with the current date and time; the user can change it to any date within the past 5 years; a date more than 1 day in the future cannot be selected

### Scenario SCN-TXN-09: Idempotency-Key prevents duplicate on retry

- **Covers**: REQ-TXN-06
- Given: an authenticated user submits a transaction; the network request is sent but the response is lost (network flake); the user's browser or the query library retries
- When: the same form submission is retried with the same form state
- Then: the same Idempotency-Key (generated before the first attempt) is reused in the retry; the backend returns 200 (replay); the user sees no duplicate transaction in the list and no duplicate error

### Scenario SCN-TXN-10: Success toast and form reset after add

- **Covers**: REQ-TXN-07
- Given: an authenticated user successfully adds a transaction
- When: the API returns 201
- Then: a toast message appears confirming the transaction was added; the form is reset or the user is navigated back to the wallet detail page; the wallet balance and transaction list reflect the new transaction

### Scenario SCN-TXN-11: Server error shows toast without closing form

- **Covers**: REQ-TXN-09, REQ-ERR-01
- Given: an authenticated user submits the Add Transaction form
- When: the API returns a 5xx error
- Then: a toast message appears with a user-friendly error message in Spanish; the form remains open with the user's data intact; the user can retry submission

### Scenario SCN-TXN-12: Transaction list with Load More pagination

- **Covers**: REQ-TXN-11
- Given: an authenticated user is on `/wallets/W1/transactions` and the wallet has 25 transactions (API page size = 10)
- When: the page loads
- Then: the first 10 transactions are displayed; a "Load more" button is visible at the bottom; clicking it appends the next 10 transactions without replacing the current results; when all 25 are shown, the "Load more" button disappears

### Scenario SCN-TXN-13: Filter transactions by date range

- **Covers**: REQ-TXN-10
- Given: an authenticated user is on `/wallets/W1/transactions` and the wallet has transactions in April, May, and June 2026
- When: the user opens the filter panel, sets the date range to May 1–31, and applies the filter
- Then: only transactions with `occurredAt` in May 2026 are displayed; April and June transactions are not shown

### Scenario SCN-TXN-14: Filter transactions by type

- **Covers**: REQ-TXN-10
- Given: an authenticated user is on `/wallets/W1/transactions` and the wallet has both income and expense transactions
- When: the user selects type filter `expense`
- Then: only expense transactions are displayed; income transactions are hidden

### Scenario SCN-TXN-15: Empty state for transactions

- **Covers**: REQ-TXN-13
- Given: an authenticated user is on `/wallets/W1/transactions` and the wallet has no transactions
- When: the page loads
- Then: an empty state message is displayed indicating there are no transactions yet; no "Load more" button is shown

### Scenario SCN-TXN-16: Empty state for filtered results

- **Covers**: REQ-TXN-13
- Given: an authenticated user is on `/wallets/W1/transactions` and has applied a date range filter that matches no transactions
- When: the filtered query returns zero results
- Then: an empty state message is displayed indicating no transactions match the current filters

### Scenario SCN-CAT-01: List categories

- **Covers**: REQ-CAT-01
- Given: an authenticated user with one custom category "Gym" (expense) navigates to `/categories`
- When: the page loads
- Then: predefined categories are displayed grouped by type (income and expense); the custom category "Gym" appears under the expense group; no delete control is shown on predefined categories

### Scenario SCN-CAT-02: Create custom category — success

- **Covers**: REQ-CAT-02, REQ-CAT-05
- Given: an authenticated user is on `/categories` and opens the create category form/dialog
- When: the user enters name `"Gimnasio"`, selects type `expense`, and submits
- Then: `POST /categories` is called; on 201 response, the categories query is invalidated; "Gimnasio" appears in the expense custom category group; a success toast is shown

### Scenario SCN-CAT-03: Create category — validation errors

- **Covers**: REQ-CAT-05, REQ-VAL-02, REQ-VAL-03, REQ-ERR-02
- Given: an authenticated user opens the create category form
- When: the user submits without entering a name or selecting a type
- Then: inline validation errors appear in Spanish; the submit button is disabled; no API call is made

### Scenario SCN-CAT-04: Create category — name exceeds 32 characters

- **Covers**: REQ-CAT-05, REQ-VAL-01
- Given: an authenticated user opens the create category form
- When: the user enters a name longer than 32 characters
- Then: an inline error appears; the submit is blocked; no API call is made

### Scenario SCN-CAT-05: Delete custom category — with confirmation

- **Covers**: REQ-CAT-03, REQ-CAT-04
- Given: an authenticated user is on `/categories` and "Gym" (custom, expense) is listed
- When: the user clicks the delete button on "Gym"
- Then: a confirmation dialog appears asking the user to confirm the deletion; the actual DELETE request is NOT sent yet

### Scenario SCN-CAT-06: Delete custom category — confirmed

- **Covers**: REQ-CAT-03, REQ-CAT-04
- Given: the confirmation dialog for deleting "Gym" is open
- When: the user confirms
- Then: `DELETE /categories/{gymId}` is sent; on 204 response, the categories query is invalidated; "Gym" is removed from the list; a toast confirms the deletion

### Scenario SCN-CAT-07: Delete custom category — cancelled

- **Covers**: REQ-CAT-04
- Given: the confirmation dialog for deleting "Gym" is open
- When: the user cancels (clicks Cancel or presses Escape)
- Then: the dialog closes; no DELETE request is sent; "Gym" remains in the list

### Scenario SCN-CAT-08: No delete control on predefined categories

- **Covers**: REQ-CAT-03
- Given: an authenticated user is on `/categories`
- When: the predefined category list renders
- Then: no delete button or delete action is visible on any predefined category entry; the user has no UI path to attempt deletion of a predefined category

### Scenario SCN-ERR-01: Network error shows toast

- **Covers**: REQ-ERR-01, REQ-ERR-02
- Given: the user is on any page and their network connection is down
- When: any API mutation (e.g., create wallet) is submitted
- Then: a toast message appears in Spanish indicating a connection error; the form remains open; no partial state change occurs in the UI

### Scenario SCN-ERR-02: ErrorBoundary catches render crash

- **Covers**: REQ-ERR-03
- Given: a React component throws an error during render (e.g., accessing a property of `undefined`)
- When: the error propagates up the component tree
- Then: the global ErrorBoundary catches it and renders a "Something went wrong" screen with a reload button; the rest of the app does not crash

### Scenario SCN-INFRA-01: CloudFront serves SPA correctly

- **Covers**: REQ-INFRA-01, REQ-INFRA-02
- Given: the app is deployed and a user requests a deep URL (e.g., `/categories`) directly
- When: CloudFront receives the request for a path that has no matching S3 object
- Then: S3 returns 403 or 404; CloudFront's error response configuration maps this to `/index.html` with HTTP 200; the browser receives the SPA shell and the React Router renders the correct page

### Scenario SCN-INFRA-02: index.html is always fresh

- **Covers**: REQ-INFRA-03
- Given: a new version of the app is deployed
- When: a user with a previously cached browser visits the app
- Then: the browser re-fetches `index.html` because its `Cache-Control: no-cache, no-store, must-revalidate` header prevents caching; the user receives the latest app version; hashed asset files remain cached

### Scenario SCN-INFRA-03: Two-step deploy adds Cognito callbacks

- **Covers**: REQ-INFRA-04
- Given: the first CDK deploy has completed and the CloudFront distribution domain is available in the SSM parameter `/smart-wallet/prod/web/distribution-domain`
- When: the operator reads the domain, adds it to the Cognito User Pool Client's `callbackUrls` and `logoutUrls`, and runs the second CDK deploy
- Then: Cognito accepts authentication callbacks from the CloudFront domain; users can complete sign-in from the deployed URL

### Scenario SCN-A11Y-01: Keyboard navigation through transaction form

- **Covers**: REQ-UI-06, REQ-UI-07, REQ-A11Y-01, REQ-A11Y-02
- Given: an authenticated user opens the Add Transaction form using only keyboard navigation
- When: the user tabs through all form fields and presses Enter to submit
- Then: each field receives focus in logical order; visible focus indicators appear on each focused element; all fields have associated labels; the form submits correctly

### Scenario SCN-A11Y-02: Modal traps and restores focus

- **Covers**: REQ-A11Y-03
- Given: an authenticated user opens the Create Category dialog by activating a button
- When: the dialog opens
- Then: focus moves into the dialog and is trapped within it (Tab and Shift+Tab cycle only within the dialog); when the dialog is closed, focus returns to the button that opened it

### Scenario SCN-A11Y-03: Toast announced to screen reader

- **Covers**: REQ-A11Y-04
- Given: an authenticated user successfully creates a wallet
- When: the success toast appears
- Then: the toast text is announced by screen readers via an `aria-live` region without requiring the user to focus on the toast

---

## 4. Non-functional Requirements

- **NFR-PERF-01**: Lighthouse mobile Performance score ≥ 90, measured manually via Chrome DevTools on the production build before each deploy.
- **NFR-A11Y-01**: Lighthouse mobile Accessibility score ≥ 90.
- **NFR-BP-01**: Lighthouse Best Practices score ≥ 90.
- **NFR-SEO-01**: Lighthouse SEO score ≥ 90.
- **NFR-BUNDLE-01**: Initial JavaScript bundle (gzip-compressed) < 300 KB.
- **NFR-CODE-01**: `pnpm typecheck` and `pnpm lint` pass across all packages at the end of every PR. Zero type errors and zero lint errors are tolerated.
- **NFR-DEPS-01**: `packages/web` imports only `@smart-wallet/shared-types` from the workspace. It does not import from `packages/api`, `packages/domain`, or `packages/infra-cdk`.
- **NFR-LANG-01**: All user-facing strings (labels, placeholders, error messages, toasts, empty states, confirmation dialogs) are written in Spanish.
- **NFR-BROWSER-01**: The application functions correctly in the latest two released versions of Chrome, Safari, Firefox, and Edge.
- **NFR-BACKEND-01**: Zero changes are made to any backend source file (`infra-sls/`, `api/`, `domain/`, `shared-types/`) during this change.
- **NFR-COST-01**: The S3 bucket and CloudFront distribution operate within the AWS free tier for MVP traffic levels. No new $5/month budget concerns are introduced.
- **NFR-TESTABLE-01**: Although no tests are written in this change (`strict_tdd: false`), the architecture must remain testable: library functions are pure, the API client is a single seam, and presentational components accept props without internal side effects. A future change must be able to add Vitest without requiring structural refactors.

---

## 5. Error Matrix

| Condition                       | Page / Context                                          | UI feedback                                                                           |
| ------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Network disconnected            | Any mutation                                            | Toast: "Sin conexión. Verificá tu red e intentá de nuevo."                            |
| 401 — refresh succeeds          | Any API call                                            | Silent retry; user sees nothing                                                       |
| 401 — refresh fails             | Any API call                                            | Redirect to `/login`; no error toast                                                  |
| 400 — field validation from API | Forms (create wallet, add transaction, create category) | Inline per-field error beneath the affected field                                     |
| 404 — wallet not found          | Wallet detail, wallet transaction list                  | Inline error state: "Wallet no encontrada" with a back link                           |
| 409 — currency_mismatch         | Add transaction                                         | Inline error on currency field: "La moneda no coincide con la wallet"                 |
| 409 — invalid_category          | Add transaction                                         | Inline error on category field: "Categoría no válida para este tipo de transacción"   |
| 409 — category_type_mismatch    | Add transaction                                         | Inline error on category field: "La categoría no coincide con el tipo de transacción" |
| 5xx — server error              | Any mutation                                            | Toast: "Error del servidor. Intentá más tarde."                                       |
| React render crash              | Any page                                                | ErrorBoundary: "Algo salió mal" screen with reload button                             |
| Unmatched route                 | Any URL                                                 | NotFound page with link back to `/wallets`                                            |

---

## 6. Out of Scope (reaffirmed)

The following items have no scenario in this spec. Any attempt to verify them against this spec is explicitly out of scope.

- **Charts and analytics**: No spending charts, breakdowns, or aggregation views. Deferred to `web-charts`.
- **PWA and offline mode**: No service worker, no offline cache, no install banner. Deferred to `web-pwa`.
- **Dark mode**: Tailwind `dark:` class structure is permitted in markup, but no toggle UI ships in this change.
- **i18n / language switching**: UI text is Spanish-only. No externalized string catalog, no language selector.
- **Multiple environments**: Single `prod` environment only.
- **CI/CD Lighthouse automation**: Manual Lighthouse run only. Automation deferred to `ci-cd-quality`.
- **Custom domain (Route 53 + ACM)**: CloudFront default `*.cloudfront.net` URL only.
- **Update or delete wallets and transactions**: Backend does not expose PATCH or DELETE for these resources. No UI controls for them.
- **SRP auth flow**: `USER_PASSWORD_AUTH` only. SRP migration is a future hardening step.
- **Transfers, recurring transactions, attachments, tags, splits**: None in backend, none in UI.
- **Real-time updates and WebSockets**: TanStack Query's `refetch-on-mutation-success` is sufficient.
- **Currencies other than USD and PEN**: EUR, GBP, and all others are rejected.
- **`GET /transactions?categoryId=`**: The by-category cross-wallet query endpoint is not consumed in MVP UI.
- **Tests**: `strict_tdd: false`. No unit, integration, or e2e tests in this change.
- **Multi-wallet bulk operations**.

---

## 7. Backend REQ Cross-reference

The following `wallet-mvp` backend requirements are the API contracts this web client depends on. The web spec does NOT re-specify them — it only references them as dependencies.

| Backend REQ                                    | Dependency from web                               |
| ---------------------------------------------- | ------------------------------------------------- |
| REQ-WAL-01, REQ-WAL-04, REQ-WAL-05, REQ-WAL-06 | SCN-WAL-01 through SCN-WAL-07                     |
| REQ-TXN-01 through REQ-TXN-06                  | SCN-TXN-01 through SCN-TXN-16                     |
| REQ-CAT-01 through REQ-CAT-07                  | SCN-CAT-01 through SCN-CAT-08                     |
| REQ-AUTH-01 through REQ-AUTH-04                | SCN-AUTH-06, SCN-AUTH-12, SCN-AUTH-13, SCN-NAV-01 |
| REQ-IDEM-01 through REQ-IDEM-05                | SCN-TXN-09                                        |
| REQ-MNY-04, REQ-MNY-06                         | SCN-WAL-01, SCN-WAL-06                            |

---

## 8. Coverage Map

| REQ          | Scenarios                                                             |
| ------------ | --------------------------------------------------------------------- |
| REQ-AUTH-01  | SCN-AUTH-01, SCN-AUTH-02                                              |
| REQ-AUTH-02  | SCN-AUTH-03, SCN-AUTH-04                                              |
| REQ-AUTH-03  | SCN-AUTH-05                                                           |
| REQ-AUTH-04  | SCN-AUTH-06, SCN-AUTH-07, SCN-AUTH-08                                 |
| REQ-AUTH-05  | SCN-AUTH-09, SCN-AUTH-10                                              |
| REQ-AUTH-06  | SCN-AUTH-11                                                           |
| REQ-AUTH-07  | SCN-AUTH-12, SCN-AUTH-13                                              |
| REQ-AUTH-08  | SCN-AUTH-13, SCN-AUTH-15                                              |
| REQ-AUTH-09  | SCN-AUTH-14                                                           |
| REQ-NAV-01   | SCN-NAV-01, SCN-AUTH-07, SCN-AUTH-11                                  |
| REQ-NAV-02   | SCN-AUTH-06, SCN-AUTH-07                                              |
| REQ-NAV-03   | SCN-NAV-02                                                            |
| REQ-NAV-04   | SCN-NAV-03                                                            |
| REQ-NAV-05   | SCN-NAV-04                                                            |
| REQ-NAV-06   | SCN-NAV-05                                                            |
| REQ-WAL-01   | SCN-WAL-01                                                            |
| REQ-WAL-02   | SCN-WAL-03                                                            |
| REQ-WAL-03   | SCN-WAL-06 (wallet detail shows currency as read-only)                |
| REQ-WAL-04   | SCN-WAL-06                                                            |
| REQ-WAL-05   | SCN-WAL-01, SCN-WAL-03, SCN-WAL-06                                    |
| REQ-WAL-06   | SCN-WAL-04, SCN-WAL-05                                                |
| REQ-WAL-07   | SCN-WAL-02                                                            |
| REQ-WAL-08   | SCN-WAL-06 (read-only currency display)                               |
| REQ-TXN-01   | SCN-TXN-01, SCN-TXN-02                                                |
| REQ-TXN-02   | SCN-TXN-03                                                            |
| REQ-TXN-03   | SCN-TXN-04, SCN-TXN-05                                                |
| REQ-TXN-04   | SCN-TXN-06, SCN-TXN-07                                                |
| REQ-TXN-05   | SCN-TXN-08                                                            |
| REQ-TXN-06   | SCN-TXN-09                                                            |
| REQ-TXN-07   | SCN-TXN-10                                                            |
| REQ-TXN-08   | SCN-TXN-11                                                            |
| REQ-TXN-09   | SCN-TXN-11                                                            |
| REQ-TXN-10   | SCN-TXN-13, SCN-TXN-14                                                |
| REQ-TXN-11   | SCN-TXN-12                                                            |
| REQ-TXN-12   | SCN-TXN-02, SCN-WAL-06                                                |
| REQ-TXN-13   | SCN-TXN-15, SCN-TXN-16                                                |
| REQ-CAT-01   | SCN-CAT-01                                                            |
| REQ-CAT-02   | SCN-CAT-02                                                            |
| REQ-CAT-03   | SCN-CAT-05, SCN-CAT-06, SCN-CAT-07, SCN-CAT-08                        |
| REQ-CAT-04   | SCN-CAT-05, SCN-CAT-06, SCN-CAT-07                                    |
| REQ-CAT-05   | SCN-CAT-03, SCN-CAT-04                                                |
| REQ-UI-01    | SCN-NAV-02, SCN-A11Y-01                                               |
| REQ-UI-02    | SCN-NAV-02                                                            |
| REQ-UI-03    | SCN-WAL-07                                                            |
| REQ-UI-04    | NFR-PERF-01, NFR-A11Y-01, NFR-BP-01, NFR-SEO-01 (manual verification) |
| REQ-UI-05    | NFR-BUNDLE-01 (manual verification)                                   |
| REQ-UI-06    | SCN-A11Y-01                                                           |
| REQ-UI-07    | SCN-A11Y-01                                                           |
| REQ-UI-08    | NFR-A11Y-01 (Lighthouse accessibility score)                          |
| REQ-ERR-01   | SCN-AUTH-08, SCN-ERR-01, SCN-TXN-11                                   |
| REQ-ERR-02   | SCN-WAL-04, SCN-TXN-04, SCN-TXN-05, SCN-CAT-03                        |
| REQ-ERR-03   | SCN-ERR-02                                                            |
| REQ-ERR-04   | SCN-AUTH-12                                                           |
| REQ-MNY-01   | SCN-WAL-01, SCN-WAL-03, SCN-WAL-06                                    |
| REQ-MNY-02   | SCN-TXN-02, SCN-WAL-06                                                |
| REQ-MNY-03   | SCN-WAL-06 (read-only currency)                                       |
| REQ-VAL-01   | SCN-WAL-05, SCN-TXN-04, SCN-TXN-05, SCN-CAT-04                        |
| REQ-VAL-02   | SCN-WAL-04, SCN-TXN-04, SCN-CAT-03                                    |
| REQ-VAL-03   | SCN-WAL-04, SCN-AUTH-02, SCN-TXN-04, SCN-CAT-03                       |
| REQ-A11Y-01  | SCN-A11Y-01                                                           |
| REQ-A11Y-02  | SCN-A11Y-01                                                           |
| REQ-A11Y-03  | SCN-A11Y-02                                                           |
| REQ-A11Y-04  | SCN-A11Y-03                                                           |
| REQ-INFRA-01 | SCN-INFRA-01                                                          |
| REQ-INFRA-02 | SCN-NAV-04, SCN-INFRA-01                                              |
| REQ-INFRA-03 | SCN-INFRA-02                                                          |
| REQ-INFRA-04 | SCN-INFRA-03                                                          |
| REQ-INFRA-05 | SCN-INFRA-03 (implied by deploy script consuming SSM)                 |
| REQ-INFRA-06 | SCN-INFRA-02, SCN-INFRA-03                                            |
| REQ-CODE-01  | NFR-CODE-01 (CI gate)                                                 |
| REQ-CODE-02  | NFR-CODE-01 (CI gate)                                                 |
| REQ-CODE-03  | NFR-CODE-01 (tsc verbatimModuleSyntax enforcement)                    |
| REQ-CODE-04  | NFR-DEPS-01                                                           |
| REQ-CODE-05  | NFR-BACKEND-01                                                        |
