# Proposal: web-mvp

> SDD phase: propose
> Project: smart-wallet
> Change: web-mvp
> Date: 2026-05-12
> Engram topic_key: `sdd/web-mvp/proposal`

## 1. Intent

The `wallet-mvp` backend is LIVE in AWS production (`https://f4vv2f72ua.execute-api.us-east-1.amazonaws.com`) with 8 HTTP endpoints, a Cognito User Pool, idempotency, and ownership-scoped queries — but it has **no client**. Today, the only way to exercise it is Postman. This change exists to ship the first real consumer of that API: a mobile-first, single-page React application hosted on S3 + CloudFront, authenticated against the existing Cognito pool, talking to the existing API Gateway.

The package `packages/web/` is an empty placeholder (`src/index.ts = export {}`, scripts echo "not configured yet"). We need to bootstrap it from zero with Vite + React + TypeScript, build four feature surfaces (auth, wallets, transactions, categories), wire it to the locked backend contract, and add a new CDK construct (`WebHosting.ts`) so the site has a real URL.

Success means a personal user can sign up, log in, create a wallet, add income and expense transactions, see an accurate balance, browse transaction history with cursor pagination, and create custom categories — all from a phone or desktop browser, deployed at a CloudFront URL, with Lighthouse mobile score ≥ 90 and zero changes to the backend contract.

This is the change that turns the project from "a backend that exists" into "a product I can use".

## 2. In Scope

- **Vite + React 18 + TypeScript** bootstrap of `packages/web/` from zero (vite.config.ts, index.html, main.tsx, env typing).
- **TailwindCSS + shadcn/ui** copy-in design system (~16 components: button, input, label, form, card, select, separator, sonner-toast, skeleton, dialog, sheet, badge, tabs, avatar, calendar, popover, table).
- **React Router v6** with nested Outlet layouts: AuthLayout (public) and AppLayout (protected) with mobile bottom tab bar / desktop sidebar.
- **Auth feature** using `amazon-cognito-identity-js` (USER_PASSWORD_AUTH flow): Login, Signup with email-code confirmation, Forgot Password, Sign-out. Token storage in memory + sessionStorage. Auto-refresh on 401.
- **Wallets feature**: list, detail, create.
- **Transactions feature**: list (cursor `useInfiniteQuery`), add via form/modal.
- **Categories feature**: list (predefined + custom merged), create custom, delete custom.
- **TanStack Query v5** as the only server-state layer, with typed query-key factories and refetch-on-success invalidations (no optimistic updates).
- **React Hook Form + Zod resolver** for every form; Zod schemas reused directly from `@smart-wallet/shared-types`.
- **Currency formatting** via `Intl.NumberFormat` in `lib/currency.ts` (no extra dependency).
- **API client wrapper** in `lib/api/`: thin `fetch`-based core + per-feature typed function modules; auto-attaches `Authorization`, catches 401 → `refreshSession()` → retry once, throws typed errors.
- **CDK `WebHosting` construct**: private S3 bucket (BPA on, versioning on) + CloudFront distribution (OAC, PriceClass_100, HTTP→HTTPS, custom error responses 403+404 → `/index.html` with 200) + 3 new SSM parameters.
- **Cognito `UserPool` construct update**: add CloudFront distribution domain to `callbackUrls` and `logoutUrls` (two-step deploy documented).
- **Environment configuration**: `.env.example` + `.env.production` committed (no secrets — all public Cognito + API config); `vite-env.d.ts` for typing.
- **Deploy scripts** in `packages/web/package.json`: `build`, `deploy` (`aws s3 sync` + CloudFront invalidation of `/index.html`), pulling bucket name + distribution id from SSM.
- **Global ErrorBoundary** at the app root for unrecoverable React render errors.
- **Auth hydration on reload**: read sessionStorage on app mount, trust until next request fails.

## 3. Out of Scope

- **Tests** — no unit/integration/e2e tests. `sdd-init` recorded `strict_tdd: false`. Architecture MUST remain testable (presentational/container split, lib functions are pure, API client is a single seam) so a future change can add Vitest + Testing Library without refactor.
- **Charts / analytics / spending breakdowns** — deferred to a future `web-charts` change. Backend has no aggregation endpoints; charts would add bundle weight (Recharts ~130 KB gz) for marginal MVP value.
- **PWA / offline support / service worker / install banner** — deferred to a future `web-pwa` change. Offline support for an authenticated mutable API is non-trivial and unnecessary for personal use.
- **Dark mode toggle** — Tailwind class structure must permit `dark:` variants in the future, but no toggle UI in this change.
- **Internationalization (i18n)** — UI strings are **Spanish only (rioplatense / voseo)**, centralized in `src/lib/i18n.ts` as plain constants (no i18n library). `Intl.NumberFormat` uses the appropriate locale for currency rendering (USD → `en-US`, PEN → `es-PE`). English translation is out of scope for MVP.
- **Multiple environments** — single `prod` environment only, matching `wallet-mvp`. No dev/staging.
- **CI/CD via GitHub Actions** — deploys are manual via `pnpm` scripts. Future `ci-cd-quality` change will automate.
- **Lighthouse automation** — manual Lighthouse run before each deploy (documented in deploy script). Automation is a future concern.
- **Custom domain (Route 53 + ACM certificate)** — the site is served from the default `*.cloudfront.net` URL. Custom domain is a future additive change.
- **Update / delete endpoints for wallets and transactions** — backend doesn't expose them; UI won't either.
- **SRP auth flow** — MVP uses `USER_PASSWORD_AUTH` (simpler, already enabled). SRP migration is a future hardening step.
- **Multi-wallet bulk operations, transfers between wallets, recurring transactions, attachments, tags, splits** — none in the backend, none in the UI.
- **Real-time updates / WebSockets / subscriptions** — TanStack Query's refetch-on-success is sufficient.

## 4. Architectural Decisions

### 4.1 Auth strategy — locked

`amazon-cognito-identity-js` with custom shadcn UI screens, `USER_PASSWORD_AUTH` flow. Token storage: in-memory React state (primary) + sessionStorage (hydration fallback). Refresh on 401 via `CognitoUser.refreshSession()`. Sign-out also calls Cognito `globalSignOut()` to invalidate refresh tokens server-side (see §4.19).

Rationale: Tailwind + shadcn design system is locked → Hosted UI is excluded (no CSS control); Amplify UI is excluded (700 KB+ bundle disqualifies Lighthouse ≥ 90). `amazon-cognito-identity-js` adds ~50 KB gz — acceptable; auth pages can be lazy-loaded via `React.lazy` if Lighthouse pressure emerges. Avoid `localStorage` for tokens (XSS exposure surface) — sessionStorage is read on app mount only and cleared on sign-out.

### 4.2 Routing structure

```
PublicLayout (Outlet, no nav)
  /login                      → LoginPage
  /signup                     → SignupPage
  /signup/confirm             → ConfirmSignupPage (email-code entry)
  /forgot-password            → ForgotPasswordPage
  /forgot-password/confirm    → ConfirmForgotPasswordPage (code + new password)

ProtectedRoute → AppLayout (Outlet, with nav)
  /                           → redirect to /wallets
  /wallets                    → WalletsListPage
  /wallets/new                → CreateWalletPage
  /wallets/:walletId          → WalletDetailPage (balance + recent transactions inline)
  /wallets/:walletId/transactions → TransactionListPage (full paginated list)
  /transactions/new           → AddTransactionPage (also reachable as modal from FAB)
  /categories                 → CategoriesPage (list + create + delete custom)
  /settings                   → SettingsPage (sign-out, account info)

*                             → NotFoundPage
```

`ProtectedRoute` is a wrapper component: reads `useAuth()`, redirects to `/login?next={pathname}` if unauthenticated (preserves intended destination across login). `AppLayout` renders a fixed bottom tab bar (`md:hidden`) on mobile and a left sidebar (`hidden md:flex`) on desktop, both backed by the same `routes` constants in `lib/routes.ts`.

### 4.3 Folder structure (Q1) — feature-sliced, locked

```
packages/web/src/
  app/
    App.tsx                   # Router root + providers (Query, Auth, ErrorBoundary)
    router.tsx                # createBrowserRouter with route definitions
    providers/
      AuthProvider.tsx
      QueryProvider.tsx
      ErrorBoundary.tsx
  features/
    auth/
      pages/                  # LoginPage, SignupPage, ConfirmSignupPage, ForgotPasswordPage, ConfirmForgotPasswordPage
      components/             # auth-specific UI (e.g., PasswordRequirementsHint)
      hooks/                  # useAuth (re-export), useLoginForm
      api/                    # cognito-backed functions: login, signup, confirmSignup, forgotPassword
    wallets/
      pages/                  # WalletsListPage, WalletDetailPage, CreateWalletPage
      components/             # WalletCard, WalletBalanceHeader, WalletForm
      hooks/                  # useWallets, useWallet, useCreateWallet
      api/                    # walletsApi.list, walletsApi.get, walletsApi.create
      queryKeys.ts            # walletKeys factory
    transactions/
      pages/                  # TransactionListPage, AddTransactionPage
      components/             # TransactionListItem, TransactionForm, TransactionFilters
      hooks/                  # useWalletTransactions (infinite), useAddTransaction
      api/                    # transactionsApi.byWallet, transactionsApi.byCategory, transactionsApi.add
      queryKeys.ts            # transactionKeys factory
    categories/
      pages/                  # CategoriesPage
      components/             # CategoryList, CreateCategoryDialog, CategoryItem
      hooks/                  # useCategories, useCreateCustomCategory, useDeleteCustomCategory
      api/                    # categoriesApi.list, categoriesApi.create, categoriesApi.delete
      queryKeys.ts            # categoryKeys factory
  components/
    ui/                       # shadcn copy-in (button.tsx, input.tsx, form.tsx, …)
    layout/                   # AppLayout, PublicLayout, BottomTabBar, Sidebar, ProtectedRoute
    forms/                    # FormField, MoneyInput, DatePickerField, CurrencySelect, CategorySelect
  lib/
    api/
      client.ts               # fetch wrapper: attaches Authorization, refreshes on 401, throws ApiError
      errors.ts               # ApiError class, isApiError, mapStatus
    cognito/
      pool.ts                 # CognitoUserPool singleton
      session.ts              # getCurrentSession, refreshSession helpers
    queryClient.ts            # QueryClient with defaults (staleTime, retry, refetchOnWindowFocus: false)
    currency.ts               # formatCurrency, parseCurrencyInput
    routes.ts                 # route path constants (RoutePaths.LOGIN, etc.)
    auth.ts                   # AuthState type, sessionStorage helpers (saveSession, loadSession, clearSession)
  hooks/                      # generic reusable hooks (useDebounce, useMediaQuery)
  types/                      # local-only types (rare — most come from shared-types)
  main.tsx                    # Vite entry → ReactDOM.createRoot(...).render(<App />)
  index.css                   # @tailwind directives + globals (.pb-safe, font stack)
  vite-env.d.ts               # ImportMetaEnv typing
```

**Rationale**: feature-sliced beats layered and atomic-design for this codebase. The backend is already organized by domain (`domain/src/wallet/`, `domain/src/transaction/`, `domain/src/category/`) — mirroring that in the frontend makes the mental model symmetric. Each feature folder is self-contained (pages + components + hooks + api + queryKeys), which means PRs are small and reviewable, and "delete this feature" is `rm -rf features/X`. The `components/` directory is reserved for **cross-feature** UI (layout, shadcn primitives, generic form helpers) — not feature-specific components.

Trade-off rejected: a flat `pages/` + `components/` layered structure ("Atomic Design"-ish) would force cross-feature imports between siblings as features grow. Feature-sliced front-loads the structural decision and pays off as more features land.

### 4.4 API client wrapper (Q2) — thin core + per-feature typed functions

`lib/api/client.ts` exports a single low-level `request<T>(method, path, init?)` function. It:

1. Reads the current `idToken` from the AuthProvider (via a token getter passed at init).
2. Attaches `Authorization: Bearer ${idToken}` and `Content-Type: application/json`.
3. Resolves the URL against `import.meta.env.VITE_API_BASE_URL`.
4. On a `401` response: calls a refresh hook (provided by AuthProvider via `client.setRefreshHandler(...)`). If refresh succeeds, retries the request **once**. If refresh fails, clears the session and rejects with `ApiError(401, 'unauthorized')`.
5. On any non-2xx: parses the JSON body and throws `ApiError(status, code, details)`.
6. On 204: returns `undefined as T`.

Each feature owns a thin typed API module (e.g., `features/wallets/api/walletsApi.ts`):

```ts
export const walletsApi = {
  list: (params?: ListWalletsQueryDTO) =>
    request<ListWalletsResponseDTO>('GET', '/wallets', { query: params }),
  get: (walletId: string) =>
    request<WalletResponseDTO>('GET', `/wallets/${walletId}`),
  create: (dto: CreateWalletDTO) =>
    request<WalletResponseDTO>('POST', '/wallets', { body: dto }),
};
```

These typed wrappers are what TanStack Query hooks call. The DTOs come directly from `@smart-wallet/shared-types`.

**Rationale**: a fully generic `apiClient.get(path)` with caller-supplied types pushes type safety to the call site and invites drift. A heavy class-based per-endpoint client (axios-style) is over-engineered for ~10 endpoints. The thin core + per-feature functions strikes the balance: one centralized place for auth/refresh/error handling, but the call sites are typed without `as unknown as ResponseDTO` casts. Idempotency-Key support is added by accepting an optional `idempotencyKey` param on `transactionsApi.add()` which is forwarded as a header.

### 4.5 Data fetching — TanStack Query

- One `QueryClient` instance constructed in `lib/queryClient.ts` with defaults:
  - `staleTime: 30_000` (30s)
  - `retry: 1` (the API client already retries 401; we keep one additional retry for transient 5xx)
  - `refetchOnWindowFocus: false` (avoids surprise refetches on tab focus)
  - `refetchOnReconnect: true`
- Query keys via factories in each feature's `queryKeys.ts` (exact shapes locked in explore §Topic 3).
- Mutations use the API client's typed functions and invalidate per the rules in explore §Topic 3.
- Pagination: `useInfiniteQuery` for transactions with `getNextPageParam: (last) => last.nextCursor`. Plain `useQuery` for wallets and categories (small sets).
- No optimistic updates in MVP — financial data must reflect server confirmation.

### 4.6 Forms — RHF + Zod + shadcn `<Form>`

- One `useForm({ resolver: zodResolver(SomeRequestSchema) })` per form.
- Zod schemas come from `@smart-wallet/shared-types` (single source of truth).
- `AddTransactionRequestSchema.currency` is **not** rendered as a user input — it's set programmatically from the selected wallet's currency (form initializer).
- shadcn `<Form>`, `<FormField>`, `<FormItem>`, `<FormLabel>`, `<FormControl>`, `<FormMessage>` for every form (consistent error messaging, accessible labels).
- Submit handler calls the matching mutation hook; errors are surfaced via Sonner toast for global failures and via `<FormMessage>` for field-level Zod errors.

### 4.7 shadcn components list

Sixteen copy-in components (zero runtime shadcn dependency). Installed via `npx shadcn@latest add <name>`:

- **Critical path** (auth, wallets, transactions): `button`, `input`, `label`, `form`, `card`, `select`, `separator`, `sonner` (toast), `skeleton`, `dialog`, `sheet`.
- **Secondary**: `badge`, `tabs`, `avatar`.
- **Date input**: `calendar`, `popover` (date picker composition).
- **Data display**: `table` (desktop transaction list).

### 4.8 Mobile-first design system

- Tailwind defaults: `sm: 640`, `md: 768` (desktop switch), `lg: 1024`.
- Mobile (`< md`): fixed bottom tab bar (Wallets / + FAB for Add Transaction / Categories / Settings) with `safe-area-inset-bottom` via custom `.pb-safe` utility.
- Desktop (`≥ md`): collapsible left sidebar.
- Touch targets: every interactive element gets `min-h-[44px] min-w-[44px]`.
- Loading: Skeleton components (no spinners). Each list/card has a matching `*Skeleton` variant.
- Typography: Inter via system font stack (`font-family: ui-sans-serif, system-ui, ...`). No web font fetch (avoids extra request, helps Lighthouse).
- Z-index discipline: FAB at `z-40`, bottom tab bar at `z-30`, modals/sheets at `z-50` (shadcn defaults). Document in `tailwind.config.ts` if extended.

### 4.9 State management

- **Server state**: TanStack Query (100% of API data).
- **Auth state**: React Context (`AuthProvider`) exposing `{ user, idToken, isLoading, login, logout, signup, confirmSignup, forgotPassword, refreshSession }`.
- **UI state**: local component state via `useState` / `useReducer`. No global UI store.

**Decision**: NO Redux, NO Zustand. The single auth context + TanStack Query covers every state need in MVP. Adding a global store would be over-engineering and inflate bundle.

### 4.10 Money display

`lib/currency.ts` (display-only, lives in web — not promoted to `shared-types` because it's a UI concern):

```ts
import type { Currency } from '@smart-wallet/shared-types';

export function formatCurrency(amount: string, currency: Currency): string {
  const num = parseFloat(amount); // safe: backend returns canonical "12.34" form
  const locale = currency === 'PEN' ? 'es-PE' : 'en-US';
  return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(num);
}

export function signedFormat(amount: string, type: 'income' | 'expense', currency: Currency): string {
  const sign = type === 'expense' ? '-' : '+';
  return `${sign}${formatCurrency(amount, currency)}`;
}
```

Sign convention in transaction list: `+` green for income, `-` red for expense (backend returns positive `amount` regardless of `type`; sign is implicit). Wallet balance can be negative and is passed directly to `formatCurrency` — `Intl.NumberFormat` handles the sign naturally.

### 4.11 Hosting — CDK `WebHosting` construct

New construct in `packages/infra-cdk/src/constructs/WebHosting.ts`:

- **S3 bucket**: `BlockPublicAccess.BLOCK_ALL`, `versioned: true`, `encryption: S3_MANAGED`, `removalPolicy: RETAIN`.
- **OAC (Origin Access Control)**: CloudFront → S3 (modern; not legacy OAI).
- **CloudFront distribution**:
  - `defaultRootObject: 'index.html'`
  - `errorResponses`: **both** `httpStatus: 403` AND `httpStatus: 404` → `responsePagePath: '/index.html'`, `responseHttpStatus: 200`, `ttl: Duration.seconds(0)` (so deploys aren't cached as 404s).
  - `priceClass: PriceClass.PRICE_CLASS_100` (US, Canada, Europe — cheapest).
  - `viewerProtocolPolicy: REDIRECT_TO_HTTPS`.
  - Default cache behavior with the standard `CACHING_OPTIMIZED` cache policy.
- **Cache-Control via S3 metadata** set by the deploy script (not the construct itself):
  - `index.html`: `no-cache, no-store, must-revalidate`.
  - `assets/*` (Vite hashes filenames): `public, max-age=31536000, immutable`.
- **CfnOutputs**: distribution domain, bucket name, distribution id.

Wired into `SmartWalletStack`: instantiate `WebHosting` and pass its outputs to three new SSM parameters (§4.15).

### 4.12 Environment configuration

- `packages/web/.env.example` (committed, documents all vars).
- `packages/web/.env.production` (committed — all values are public Cognito + API config, no secrets):
  ```
  VITE_API_BASE_URL=https://f4vv2f72ua.execute-api.us-east-1.amazonaws.com
  VITE_COGNITO_USER_POOL_ID=us-east-1_MDknurVIE
  VITE_COGNITO_CLIENT_ID=40e2iqcdhaqgq22rg32bm02lsv
  VITE_COGNITO_REGION=us-east-1
  ```
- `packages/web/.env.development` (optional, gitignored if it differs — default uses same prod values for MVP).
- `packages/web/src/vite-env.d.ts` declares `ImportMetaEnv` with all four vars typed as `string` (required, not optional — build fails fast if missing).

Trade-off: build-time injection means a config change requires a rebuild + redeploy. For a single-env MVP this is correct — runtime `/config.json` would add a fetch on page load and complicate CloudFront caching with no benefit.

### 4.13 Two-step CDK deploy for Cognito callback URLs (Q3) — Option A locked

The CloudFront distribution domain is unknown before the first CDK deploy. Strategy:

1. **First deploy**: `WebHosting` construct creates the CloudFront distribution. The domain (e.g., `d1234abcd.cloudfront.net`) becomes a `CfnOutput` and is written to SSM parameter `/smart-wallet/prod/web/distribution-domain`.
2. **Manual capture**: the operator (me) reads the CfnOutput / SSM parameter after deploy completes.
3. **Update CDK source**: edit `UserPool` construct to add the CloudFront domain to `callbackUrls` and `logoutUrls` (alongside existing `http://localhost:5173/...`). The literal URL is committed.
4. **Second deploy**: `cdk deploy` again. Only the UserPool client is updated.

`sdd-apply` will document the exact post-step-1 commands in a `DEPLOY.md` (or in the PR description). Future operations remain stable — the CloudFront URL only changes if the distribution is replaced (rare).

**Rejected alternatives**:
- CDK context (`cdk.json`): same manual step, just split across files.
- Custom resource Lambda: extra moving part, more permissions, harder to reason about for a one-time operation.
- Wildcard callback (`https://*.cloudfront.net/*`): rejected — bad practice, Cognito doesn't fully support wildcards in callback lists, and it'd accept tokens from any CloudFront site.

### 4.14 Signup verification flow (Q4) — Option A locked

Standard Cognito email-code confirmation flow:

1. User fills `/signup` form → submit calls `cognito.signUp({ Username, Password, UserAttributes: [{ Name: 'email', Value: email }] })`.
2. Success → redirect to `/signup/confirm` with `email` carried in router state (and query string for refresh resilience).
3. Cognito sends a 6-digit code to the email (default sender `no-reply@verificationemail.com` — acceptable for personal MVP; future change can switch to SES).
4. User enters the code on `/signup/confirm` → submit calls `cognito.confirmSignUp({ Username, ConfirmationCode })`.
5. Success → redirect to `/login` with a success toast. User logs in normally.
6. If the code is wrong or expired: error toast + "Resend code" button calls `cognito.resendConfirmationCode({ Username })`.

**Rejected alternative**: Admin auto-confirm via Lambda trigger — would deny the user a real verification flow even for personal use, and any future user (family member, friend) would hit the same un-verified path. Building the proper flow once is cheaper than retrofitting it.

### 4.15 SSM parameters added by web-mvp (Q5) — locked

All under `/smart-wallet/prod/web/`:

| Parameter | Producer | Consumer |
|-----------|----------|----------|
| `/smart-wallet/prod/web/bucket-name` | CDK `WebHosting` | Deploy script (`aws s3 sync`) |
| `/smart-wallet/prod/web/distribution-id` | CDK `WebHosting` | Deploy script (`aws cloudfront create-invalidation`) |
| `/smart-wallet/prod/web/distribution-domain` | CDK `WebHosting` | Documentation + manual capture for Cognito callbacks (§4.13) |

Naming follows the existing `wallet-mvp` convention (`/smart-wallet/prod/<service>/<key>`). Written by `WebHosting` construct via `StringParameter` resources; read by the deploy script using `aws ssm get-parameter --name ...`.

### 4.16 Lighthouse measurement (Q6) — Option A locked, manual

Manual run before each deploy:

1. Build (`pnpm --filter @smart-wallet/web build`).
2. Preview (`pnpm --filter @smart-wallet/web preview` on `localhost:4173`).
3. Open Chrome DevTools → Lighthouse panel → Mobile → Run.
4. Confirm score ≥ 90 across Performance / Accessibility / Best Practices / SEO.
5. If below 90 on Performance: investigate (likely culprits — bundle size, fonts, no `preconnect`). The proposal commits to a Performance ≥ 90 target only; the others should also clear 90 but are easier wins.

The deploy script's first line will echo a reminder to run Lighthouse before continuing. Automated CI Lighthouse (`@lhci/cli`) is deferred to a future `ci-cd-quality` change — not blocking MVP.

### 4.17 Error handling (Q7) — layered, locked

Three layers, no overlap:

1. **API client (`lib/api/client.ts`)** — handles 401 with auto-refresh + retry-once. Throws `ApiError(status, code, details?)` for any non-2xx. Network failures throw `ApiError(0, 'network_error')`.
2. **TanStack Query / Form handlers** — catch `ApiError` per query/mutation. UI patterns:
   - **Queries**: inline error state (e.g., a `<Card>` with the message + "Retry" button calling `refetch()`). Empty states are not errors — they're rendered separately.
   - **Mutations**: Sonner toast with the user-facing message (mapped from `ApiError.code` to friendly text, e.g., `currency_mismatch` → "Transaction currency must match wallet currency").
   - **Form-level validation errors (400)**: surfaced via `setError` on the matching field if `details.fieldErrors` is present; otherwise as a toast.
3. **Global `ErrorBoundary`** — single root boundary at `<App>` level catches React **render** errors (component crashes, undefined access). Renders a generic "Something went wrong" screen with a "Reload" button. Logs to console for now (future: Sentry, out of scope).

The boundary explicitly does NOT catch async errors or query/mutation failures — those are caller responsibilities.

### 4.18 Auth hydration on reload (Q8) — sessionStorage-first, locked

On `<AuthProvider>` mount:

1. Read `idToken`, `accessToken`, `refreshToken`, `username` from `sessionStorage` (single key, JSON-encoded).
2. If found → set as initial auth state (`isLoading: false`, user is "authenticated until proven otherwise").
3. **Do NOT pre-validate** by hitting an API endpoint. Avoids an extra request on every page load.
4. The first protected API call will either succeed (token still valid) or return 401 (token expired). The API client's 401 handler will then call `refreshSession()` using the stored `refreshToken`. If refresh fails → clear sessionStorage, redirect to `/login`.

If sessionStorage is empty → `isLoading: false`, unauthenticated, ProtectedRoute redirects to `/login`.

**Rejected**: Cognito SDK's `getCurrentUser()` reads from cookies which the SDK manages itself — this works in browsers but conflates two storage mechanisms and makes sign-out cleanup unreliable. Owning the session JSON in sessionStorage is explicit and easier to clear.

### 4.19 Sign-out flow (Q9) — full cleanup, locked

`logout()` in AuthProvider does, in order:

1. Call `cognito.getCurrentUser()?.signOut()` (synchronous local cleanup — clears Cognito SDK's internal cache).
2. Call `cognito.getCurrentUser()?.globalSignOut(callback)` — best-effort; fire-and-forget. Invalidates ALL refresh tokens server-side so an attacker with a stolen `refreshToken` can't continue refreshing. Errors logged but not surfaced (sign-out succeeds locally regardless).
3. Clear in-memory state (`setUser(null)`, `setIdToken(null)`).
4. Clear sessionStorage (`sessionStorage.removeItem('auth')`).
5. Clear the TanStack Query cache (`queryClient.clear()`) to evict any cached protected data.
6. Navigate to `/login`.

**Rationale**: `globalSignOut` is the best-practice belt-and-braces option. Without it, a leaked refresh token remains usable until its natural expiry (default 30 days). The extra HTTP request is fire-and-forget and doesn't delay the UI.

## 5. UI Map (page-by-page)

| Route | Purpose | Key components | Data hooks | Mutations |
|-------|---------|----------------|------------|-----------|
| `/login` | Email + password sign-in | `LoginForm` (RHF) | — | `useLogin()` (Cognito `initiateAuth` USER_PASSWORD_AUTH) |
| `/signup` | Email + password registration | `SignupForm` (RHF) | — | `useSignup()` (Cognito `signUp`) |
| `/signup/confirm` | Enter email confirmation code | `ConfirmCodeForm` (RHF) | — | `useConfirmSignup()`, `useResendCode()` |
| `/forgot-password` | Start password reset | `ForgotPasswordForm` | — | `useForgotPassword()` (Cognito `forgotPassword`) |
| `/forgot-password/confirm` | Code + new password | `ConfirmForgotPasswordForm` | — | `useConfirmForgotPassword()` (Cognito `confirmPassword`) |
| `/wallets` | List user wallets with balance | `WalletCard`, `WalletsListSkeleton`, `EmptyWalletsState` | `useWallets()` → `GET /wallets` | — |
| `/wallets/new` | Create wallet | `WalletForm` (name + currency select) | — | `useCreateWallet()` → `POST /wallets` |
| `/wallets/:walletId` | Wallet detail + recent transactions | `WalletBalanceHeader`, `RecentTransactionsList` | `useWallet(id)`, `useWalletTransactions(id, { limit: 10 })` | — |
| `/wallets/:walletId/transactions` | Full paginated transaction list | `TransactionListItem`, `TransactionFilters`, "Load more" | `useWalletTransactions(id, filters)` (infinite) | — |
| `/transactions/new` | Add a transaction | `TransactionForm`, `WalletSelect`, `CategorySelect`, `MoneyInput`, `DatePickerField` | `useWallets()`, `useCategories()` | `useAddTransaction()` → `POST /wallets/{walletId}/transactions` (with `Idempotency-Key` = UUID v4) |
| `/categories` | Predefined + custom categories | `CategoryList`, `CreateCategoryDialog`, `DeleteCategoryConfirm` | `useCategories()` → `GET /categories` | `useCreateCustomCategory()`, `useDeleteCustomCategory()` |
| `/settings` | Account info + sign-out | `SignOutButton`, `AccountInfo` | — | `useLogout()` |
| `*` | 404 | `NotFoundPage` | — | — |

## 6. API contract usage

Mapping every backend endpoint to its UI consumers. The proposal makes ZERO changes to the backend contract — it consumes `wallet-mvp` as-is.

| Endpoint | Used by |
|----------|---------|
| `POST /wallets` | `/wallets/new` → `useCreateWallet` mutation |
| `GET /wallets` | `/wallets` (list), `/transactions/new` (WalletSelect) |
| `GET /wallets/{walletId}` | `/wallets/:walletId` (header), `/wallets/:walletId/transactions` (header) |
| `POST /wallets/{walletId}/transactions` | `/transactions/new` (with `Idempotency-Key`) |
| `GET /wallets/{walletId}/transactions` | `/wallets/:walletId` (recent), `/wallets/:walletId/transactions` (full paginated) |
| `GET /transactions?categoryId=...` | Not used in MVP UI (no "by-category" view in this change). Endpoint remains available; future addition. |
| `GET /categories` | `/categories`, `/transactions/new` (CategorySelect) |
| `POST /categories` | `/categories` (CreateCategoryDialog) |
| `DELETE /categories/{categoryId}` | `/categories` (DeleteCategoryConfirm) |

Note: `GET /transactions?categoryId=` (the GSI1-backed endpoint) is intentionally not consumed in MVP — there is no "Filter by category" page yet. It's a future additive feature.

## 7. Constraints / Non-functional

- **Lighthouse mobile Performance ≥ 90**, manually verified before each deploy (§4.16).
- **Initial bundle (gzipped) target < 300 KB**. Largest expected contributor: `amazon-cognito-identity-js` (~50 KB gz). React + ReactDOM (~45 KB gz). TanStack Query (~13 KB gz). React Router (~10 KB gz). React Hook Form + Zod (~25 KB gz). shadcn components are copy-in and tree-shaken at build time. Lazy-load auth pages via `React.lazy` if budget pressure emerges.
- **Touch targets ≥ 44×44 px** on every interactive element.
- **Single environment**: `prod` only.
- **No tests** in this change (`strict_tdd: false`). Architecture stays testable.
- **TypeScript strictness**: `strict`, `verbatimModuleSyntax`, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess` — all enforced. `pnpm typecheck` and `pnpm lint` MUST be green at the end of every PR.
- **ESM-only**: `packages/web` is `"type": "module"`. Vite handles ESM/CJS interop for any CJS-only deps (e.g., `amazon-cognito-identity-js`).
- **Browser support**: latest two versions of Chrome, Safari, Firefox, Edge (Vite default). No IE11.
- **No new backend changes**: this proposal does not modify `serverless.yml`, Lambda handlers, or shared schemas. CORS is already CONFIRMED working with `Authorization`, `Content-Type`, `Idempotency-Key` allowed (per locked context).
- **Cost**: S3 storage + CloudFront PriceClass_100 within free tier for MVP traffic. No new $5 budget concerns.

## 8. Risks

1. **Cognito callback two-step deploy** (§4.13). If the operator forgets step 4, all authentication callbacks from the CloudFront URL will be rejected by Cognito. Mitigation: deploy script prints the manual step explicitly; PR4 documentation includes a deploy checklist.
2. **Bundle size with `amazon-cognito-identity-js`** (~50 KB gz + dependencies). Could push Lighthouse Performance below 90 on slow 3G. Mitigation: lazy-load auth pages via `React.lazy`; verify Lighthouse before each deploy; if needed, split Cognito into a dynamic import.
3. **`verbatimModuleSyntax` friction with React + shadcn**. Some shadcn components or third-party libs may use default exports incompatible with verbatim mode. Mitigation: smoke-test shadcn install (one component) before installing all 16; `allowSyntheticDefaultImports: true` is already in base tsconfig.
4. **CloudFront 403/404 mapping**. If either error response is missed in the construct, direct URL navigation (e.g., refresh on `/wallets/abc`) returns the CloudFront error page instead of the SPA. Mitigation: explicit code review of the `errorResponses` array; smoke test by hitting `https://.../wallets/foo` after deploy.
5. **Token refresh race conditions**. If multiple queries fire simultaneously and all get 401, multiple `refreshSession()` calls could race. Mitigation: the API client maintains a single in-flight refresh promise — concurrent 401s await the same promise.
6. **FAB z-index overlap with bottom tab bar / Load More button**. Mobile UX risk. Mitigation: explicit z-index discipline (§4.8); test on a real phone before deploying PR3.
7. **Session storage size limits**. ~5 MB available; Cognito tokens are JWTs (~1-2 KB each). No risk in practice — documented for completeness.
8. **CORS regression**. The locked context confirms CORS is working today. Risk: a future backend deploy changes CORS headers without coordination. Mitigation: out of scope here, but call it out — backend changes that touch `serverless.yml` CORS section should include a smoke test against the deployed frontend.

## 9. Dependencies

- **`@smart-wallet/shared-types`** (existing workspace package) — Zod schemas and DTOs reused as-is. No new schemas added.
- **`@smart-wallet/wallet-mvp` backend** — live in AWS prod. No changes.
- **AWS Cognito User Pool** `us-east-1_MDknurVIE` — existing. App Client `40e2iqcdhaqgq22rg32bm02lsv` (public, no secret). Will gain CloudFront domain in callback list (two-step).
- **AWS API Gateway HTTP API** `https://f4vv2f72ua.execute-api.us-east-1.amazonaws.com` — existing. CORS confirmed.
- **New AWS resources created by this change**: S3 bucket, CloudFront distribution, OAC, 3 SSM parameters.
- **Linear project**: Smart Wallet MVP (id `3998fe2e-be82-4a4f-9b0e-c5f927f15160`). PR descriptions reference this project.
- **New npm runtime deps** (installed in `sdd-apply`):
  - `react`, `react-dom`, `react-router-dom`
  - `@tanstack/react-query`
  - `react-hook-form`, `@hookform/resolvers`, `zod` (zod already in shared-types — used transitively)
  - `amazon-cognito-identity-js`
  - `tailwindcss`, `postcss`, `autoprefixer`
  - shadcn copy-in deps: `class-variance-authority`, `clsx`, `tailwind-merge`, `lucide-react`, `sonner`, `tailwindcss-animate`, `@radix-ui/react-*` (per shadcn install)
- **New devDeps**: `vite`, `@vitejs/plugin-react`, `@types/react`, `@types/react-dom`.
- **New infra-cdk deps**: none beyond existing `aws-cdk-lib` (`aws_s3`, `aws_cloudfront`, `aws_cloudfront_origins`, `aws_ssm`).

## 10. Acceptance criteria (high level)

`sdd-spec` will turn these into scenario-by-scenario specs; here are the high-level commitments:

1. A first-time user can sign up, confirm their email via code, log in, and reach `/wallets` — entirely through the deployed CloudFront URL.
2. After logging in, the user can create a wallet (USD or PEN), add an income or expense transaction, and see the wallet balance update to reflect the transaction.
3. Add Transaction always sends a unique `Idempotency-Key` (UUID v4 per submit); double-clicks DO NOT create duplicates.
4. The transaction list at `/wallets/:walletId/transactions` paginates via "Load more" using cursor-based `useInfiniteQuery`.
5. Custom categories can be created, used in transactions, and deleted (soft-delete on backend; UI hides them post-delete).
6. The user can sign out; subsequent visits to protected routes redirect to `/login`; the previous refresh token is invalidated server-side (`globalSignOut`).
7. Refreshing any protected page does NOT log the user out (sessionStorage hydration works).
8. A 401 from any API call triggers a single silent refresh and retry; only if refresh fails does the user get redirected to `/login`.
9. CloudFront URL is added to Cognito `callbackUrls` and `logoutUrls` after the second CDK deploy.
10. Lighthouse mobile Performance ≥ 90 measured on the deployed URL before the PR4 merge.
11. `pnpm typecheck` and `pnpm lint` are green across all packages (web + infra-cdk) at the end of every PR.
12. `tsc --noEmit` honours `verbatimModuleSyntax` — all imports are explicit `import type` vs value.
13. The CDK stack deploys cleanly. First deploy creates CloudFront + writes 3 new SSM parameters. Second deploy updates Cognito callbacks.
14. No backend (`infra-sls`, `api`, `domain`, `shared-types`) source files are modified by this change.

## 11. Slicing for apply (Q10) — 4 chained PRs locked

Each PR ~800-1000 LOC, independently deployable to a feature branch, ready for review:

### PR1 — `feat(web): bootstrap + auth shell`
- Vite + React + TypeScript + Tailwind + shadcn install + base components.
- `app/` providers (QueryProvider, AuthProvider, ErrorBoundary).
- `lib/cognito/`, `lib/api/client.ts` (auth + refresh skeleton).
- `lib/queryClient.ts`, `lib/routes.ts`, `lib/currency.ts`, `lib/auth.ts`.
- Layout: `PublicLayout`, `AppLayout`, `BottomTabBar`, `Sidebar`, `ProtectedRoute`.
- Auth feature complete: Login, Signup, ConfirmSignup, ForgotPassword, ConfirmForgotPassword, sign-out (logs to console; deploy comes in PR4).
- `.env.example`, `.env.production`, `vite-env.d.ts`.

### PR2 — `feat(web): wallets feature`
- `features/wallets/` complete: pages, components, hooks, API module, query keys.
- `WalletsListPage`, `WalletDetailPage`, `CreateWalletPage`.
- Currency formatting wired in.
- Empty states, skeletons, error states.
- Mobile bottom tab bar shows "Wallets" tab active correctly.

### PR3 — `feat(web): transactions + categories`
- `features/transactions/` complete: list, add, infinite pagination, filters (date, type).
- `features/categories/` complete: list, create, delete.
- FAB on mobile for "Add Transaction".
- Idempotency-Key generation on add.
- Refetch-on-success invalidations wired (wallet detail + transaction list).

### PR4 — `feat(infra): web hosting + cognito callbacks + deploy`
- `packages/infra-cdk/src/constructs/WebHosting.ts` (S3 + OAC + CloudFront + 3 SSM parameters).
- `SmartWalletStack` instantiates `WebHosting`.
- `packages/infra-cdk/src/constructs/UserPool.ts` updated to include CloudFront domain in callbacks/logout URLs (string read from CfnOutput-managed SSM after step 1).
- `packages/web/package.json` deploy scripts.
- `DEPLOY.md` (or PR description) with the two-step deploy instructions.
- Manual Lighthouse run + report attached to PR description.

PR1 → PR2 → PR3 are sequential code-only PRs. PR4 is infrastructure + deploy and lands last after the app is feature-complete.

---

## Appendix: Open questions resolution summary

| Q | Decision |
|---|----------|
| Q1 — Folder structure | Feature-sliced (`features/{auth,wallets,transactions,categories}/`) with shared `app/`, `components/`, `lib/`, `hooks/`, `types/`. §4.3 |
| Q2 — API client | Thin generic `fetch` core (`lib/api/client.ts`) + per-feature typed function modules (`walletsApi.list()`, etc.). §4.4 |
| Q3 — Two-step CDK deploy | Option A: manual two-step deploy. First creates CloudFront + writes domain to SSM; second updates Cognito callbacks. §4.13 |
| Q4 — Signup verification | Option A: full email-code confirmation flow with dedicated `/signup/confirm` page + Resend Code. §4.14 |
| Q5 — SSM parameters | 3 new under `/smart-wallet/prod/web/`: `bucket-name`, `distribution-id`, `distribution-domain`. Written by `WebHosting` construct. §4.15 |
| Q6 — Lighthouse measurement | Option A: manual run via Chrome DevTools before each deploy; deploy script reminder. Automation deferred. §4.16 |
| Q7 — Error handling | Three layers: API client (401 + ApiError) → query/mutation handlers (inline + toast) → global ErrorBoundary (render errors only). §4.17 |
| Q8 — Auth hydration on reload | Read sessionStorage on mount, trust until next request fails. No pre-validation request. §4.18 |
| Q9 — Sign-out flow | Local `signOut()` + best-effort `globalSignOut()` + clear sessionStorage + `queryClient.clear()` + navigate to `/login`. §4.19 |
| Q10 — PR strategy | 4 chained PRs: (1) bootstrap + auth, (2) wallets, (3) transactions + categories, (4) infra + deploy. §11 |
