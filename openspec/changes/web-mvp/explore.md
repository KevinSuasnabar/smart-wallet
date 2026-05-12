# Exploration: web-mvp

> SDD phase: explore
> Project: smart-wallet
> Change: web-mvp
> Date: 2026-05-12
> Engram topic_key: `sdd/web-mvp/explore`

## Current State

Backend `wallet-mvp` is LIVE in AWS production:
- Base URL: `https://f4vv2f72ua.execute-api.us-east-1.amazonaws.com`
- Cognito User Pool: `us-east-1_MDknurVIE`, App Client: `40e2iqcdhaqgq22rg32bm02lsv` (public, no secret)
- Auth flows enabled: SRP + USER_PASSWORD_AUTH
- OAuth callback URLs: `http://localhost:5173/auth/callback` only (Vite default)
- 9 endpoints with Zod schemas in `@smart-wallet/shared-types`
- `packages/web/` is empty placeholder (`src/index.ts` = `export {}`)
- TS strict flags active globally: `verbatimModuleSyntax`, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`

Existing shared-types ready for consumption (DTOs + helpers):
- Wallet/Transaction/Category DTOs + List/Query variants
- `PREDEFINED_CATEGORIES` (14 entries), `isPredefinedCategoryId()`
- `centsToDecimalString()`, `decimalStringToCents()`, `zDecimalString`
- `CURRENCIES`, `Currency` type, `currencyDecimals`

CDK has NO S3/CloudFront construct yet. callbackUrls only has localhost.

## Affected Areas

| File/Path | Change Type |
|-----------|-------------|
| `packages/web/package.json` | Add all deps |
| `packages/web/vite.config.ts` | NEW |
| `packages/web/index.html` | NEW |
| `packages/web/src/main.tsx` | NEW |
| `packages/web/src/app/` | NEW (Router + QueryClient + AuthProvider) |
| `packages/web/src/features/{auth,wallets,transactions,categories}/` | NEW |
| `packages/web/src/components/ui/` | NEW (shadcn copy-in) |
| `packages/web/src/lib/` | NEW (queryClient, api, currency) |
| `packages/infra-cdk/src/constructs/WebHosting.ts` | NEW |
| `packages/infra-cdk/src/stacks/SmartWalletStack.ts` | Add WebHosting |
| `packages/infra-cdk/src/constructs/UserPool.ts` | Update callbackUrls with CloudFront domain |

---

## Topic 1: Auth UI Strategy

### Option A: Cognito Hosted UI
- **Pros**: zero auth UI code, AWS handles SRP/MFA, fast time-to-auth
- **Cons**: limited CSS customization (no Tailwind/shadcn), redirect breaks SPA feel, callback URL chicken-and-egg, ugly default UI
- **Effort**: Low auth + Medium CDK plumbing

### Option B: Custom UI with `amazon-cognito-identity-js`
- **Pros**: full Tailwind/shadcn control, SRP in browser, explicit token refresh, fits our design system
- **Cons**: ~50KB gz lib, must build 4-6 auth screens, SRP complex to implement correctly
- **Effort**: High (4-6 screens, token refresh logic)

### Option C: AWS Amplify UI (`@aws-amplify/ui-react`)
- **Pros**: pre-built `<Authenticator>`, all flows handled
- **Cons**: `aws-amplify` core ≈ 700KB+ min — **DISQUALIFIED for Lighthouse ≥ 90 mobile**
- **Effort**: Low

### **Recommendation: Option B** — custom UI with `amazon-cognito-identity-js`

Rationale: Tailwind + shadcn design system locked. Hosted UI breaks continuity. Amplify's bundle weight fails Lighthouse constraint. Use `USER_PASSWORD_AUTH` for MVP (simpler than SRP), document SRP as hardening step.

Token storage: IdToken + RefreshToken in memory (React state/context) + sessionStorage for page-refresh resilience. **Avoid localStorage** for tokens.

Refresh: IdTokens expire 1h. Call `refreshSession()` on 401. Wrap in TanStack Query retry logic.

---

## Topic 2: Routing Structure

```
/                          → redirect to /wallets or /login
/login                     → LoginPage (public)
/signup                    → SignupPage (public)
/forgot-password           → ForgotPasswordPage (public)
/wallets                   → WalletsListPage (protected)
/wallets/new               → CreateWalletPage (protected)
/wallets/:walletId         → WalletDetailPage (protected)
/wallets/:walletId/transactions → TransactionListPage (protected)
/transactions/new          → AddTransactionPage (protected, modal or page)
/categories                → CategoriesPage (protected)
/settings                  → SettingsPage (protected)
*                          → NotFoundPage
```

Layout strategy: Outlet-based nested layouts. Public layout (no nav) for auth pages, App layout for protected routes. Mobile bottom tab bar (Wallets / + / Categories / Settings) with `safe-area-inset-bottom`. Desktop (≥768px) side sidebar.

Protected route wrapper checks auth from Context, redirects to `/login` if unauthenticated.

---

## Topic 3: Data Fetching Architecture

Query key factories (typed):
```ts
const walletKeys = {
  all: ['wallets'] as const,
  list: (params?: ListWalletsQueryDTO) => ['wallets', 'list', params] as const,
  detail: (walletId: string) => ['wallets', walletId] as const,
}
const transactionKeys = {
  byWallet: (walletId: string, params?: ListTransactionsByWalletQueryDTO) =>
    ['transactions', 'wallet', walletId, params] as const,
  byCategory: (params: ListTransactionsByCategoryQueryDTO) =>
    ['transactions', 'category', params] as const,
}
const categoryKeys = { all: ['categories'] as const }
```

Mutations strategy:
- `addTransaction` → invalidate `walletKeys.detail(walletId)` + `transactionKeys.byWallet(walletId)`
- `createWallet` → invalidate `walletKeys.list()`
- category mutations → invalidate `categoryKeys.all`
- **NO optimistic updates for MVP** — financial data needs server confirmation

Pagination: `useInfiniteQuery` for transaction lists (cursor-based). Plain `useQuery` for wallet list (small set).

Error handling: global error boundary for 500s, per-query inline errors with retry, mutation errors via Toast (sonner), 401 → clear auth + redirect.

---

## Topic 4: Forms Strategy

**Recommendation**: React Hook Form + Zod resolver + shadcn `<Form>` component.

- shadcn `<Form>` is built on `react-hook-form` — canonical pattern
- Existing Zod schemas in `shared-types` reused directly as validators (zero duplication)
- `@hookform/resolvers/zod` bridges RHF + Zod

Note on `AddTransactionRequestSchema.currency`: schema includes it for backend use, but in the web form currency comes from the selected wallet — auto-populated, not user-entered.

---

## Topic 5: shadcn Components

Install via `npx shadcn@latest add <component>`:

**Critical** (auth + wallets + transactions): `button`, `input`, `label`, `form`, `card`, `select`, `separator`, `toast` (sonner), `skeleton`, `dialog`, `sheet`

**Secondary** (categories + settings): `badge`, `tabs`, `avatar`

**Date**: `calendar`, `popover` (date picker)

**Data**: `table` (desktop transaction list)

Total ~16 components, all copy-in (zero runtime shadcn dep).

---

## Topic 6: Mobile-First Design System

Breakpoints: Tailwind defaults (`sm:640`, `md:768`, `lg:1024`)

Navigation:
- Mobile (< md): fixed bottom tab bar (Wallets / + FAB / Categories / Settings)
- Desktop (≥ md): collapsible left sidebar

Touch targets: ≥ 44×44 px via `min-h-[44px] min-w-[44px]`

Safe area:
```css
.pb-safe { padding-bottom: env(safe-area-inset-bottom); }
```

Loading: Skeleton (no spinners). Each card/list has Skeleton variant.

Typography: Inter (system fallback acceptable for MVP — no font fetch).

---

## Topic 7: State Management

- **Server state**: TanStack Query (all API data)
- **Auth state**: React Context with `useAuth()` hook
  - Holds `{ user, idToken, isLoading }`, methods `login/logout/refreshToken`
  - Memory + sessionStorage for page-refresh persistence
- **UI state**: local `useState`

**NO Redux, NO Zustand** — overkill for MVP.

---

## Topic 8: Money & Currency Display

Backend returns decimal strings (`"94.50"`, `"-3.50"`).

```ts
// packages/web/src/lib/currency.ts
const formatCurrency = (amount: string, currency: Currency): string => {
  const num = parseFloat(amount);
  const locale = currency === 'PEN' ? 'es-PE' : 'en-US';
  return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(num);
};
// USD: "$94.50"  PEN: "S/ 94.50"
```

Sign convention in transaction list:
- Income: `+$94.50` (green)
- Expense: `-$94.50` (red, prepend minus since backend returns positive)

Balance (potentially negative): pass directly to `formatCurrency` — `Intl.NumberFormat` handles sign.

---

## Topic 9: Charts

**Recommendation: DEFER** to future `web-charts` change. MVP transaction list is sufficient. No backend aggregation endpoints exist in wallet-mvp.

Future preference: Recharts > Chart.js > Victory.

---

## Topic 10: Hosting (S3 + CloudFront)

New CDK construct `WebHosting.ts`:
- S3 private bucket, BPA enabled, versioning on
- OAC (Origin Access Control), not legacy OAI
- CloudFront distribution:
  - Default root object: `index.html`
  - Custom error responses: **403 AND 404 → /index.html with 200** (S3 returns 403 for missing keys, not 404)
  - PriceClass: `PriceClass_100` (US/Canada/Europe, cheapest)
  - HTTP → HTTPS redirect
- Cache-Control:
  - `index.html`: `no-cache, no-store, must-revalidate`
  - `assets/*.{js,css,png,woff2}`: `public, max-age=31536000, immutable` (Vite hashes filenames)

Deploy: `aws s3 sync packages/web/dist/ s3://<bucket>/ --delete` + CloudFront invalidation of `/index.html`.

New SSM parameters:
- `/smart-wallet/prod/web/distribution-id`
- `/smart-wallet/prod/web/bucket-name`

CloudFront domain MUST be added to Cognito `callbackUrls` + `logoutUrls`. Chicken-and-egg: first CDK deploy creates distribution (URL is CfnOutput), then update callbackUrls in second deploy.

---

## Topic 11: Environment Configuration

Build-time Vite env vars (browser-exposed via `VITE_` prefix):
```
VITE_API_BASE_URL=https://f4vv2f72ua.execute-api.us-east-1.amazonaws.com
VITE_COGNITO_USER_POOL_ID=us-east-1_MDknurVIE
VITE_COGNITO_CLIENT_ID=40e2iqcdhaqgq22rg32bm02lsv
VITE_COGNITO_REGION=us-east-1
```

Files:
- `packages/web/.env.example` — committed
- `packages/web/.env.production` — committed (no secrets; all public config)

TypeScript typing in `vite-env.d.ts`:
```ts
interface ImportMetaEnv {
  readonly VITE_API_BASE_URL: string;
  readonly VITE_COGNITO_USER_POOL_ID: string;
  readonly VITE_COGNITO_CLIENT_ID: string;
  readonly VITE_COGNITO_REGION: string;
}
```

Trade-off: rebuild required to change config. Correct for single-env MVP.

---

## Topic 12: PWA

**Out of scope for MVP**. Defer to `web-pwa` change.

---

## Topic 13: Local Dev

Default: `VITE_API_BASE_URL` → prod API. Requires real Cognito JWT. No local infra needed.

Alternative: `VITE_API_BASE_URL=http://localhost:3000` + `serverless-offline` + `pnpm ddb:up`. Uses `X-Mock-User-Id` header in offline mode.

Vite dev server: `localhost:5173` (matches the OAuth callback already in CDK).

---

## Recommendation Summary

| Topic | Recommendation |
|-------|----------------|
| Auth UI | `amazon-cognito-identity-js` + custom shadcn screens (USER_PASSWORD_AUTH) |
| Routing | React Router v6 nested Outlet layouts; mobile bottom tab bar / desktop sidebar |
| Data | TanStack Query; `useInfiniteQuery` for transactions; refetch-on-success (no optimistic) |
| Forms | RHF + Zod resolver + shadcn `<Form>`; reuse `shared-types` schemas |
| shadcn | ~16 copy-in components (Button, Input, Form, Card, Toast, Skeleton, Dialog, Sheet, etc.) |
| Design | Tailwind mobile-first, skeletons, safe-area, ≥44px touch targets, Inter system font |
| State | Auth Context + TanStack Query; NO Redux/Zustand |
| Money | `Intl.NumberFormat` in `lib/currency.ts`; sign + color from `type` |
| Charts | DEFER |
| Hosting | CDK `WebHosting.ts` (S3+OAC+CloudFront PriceClass_100); 403+404 → /index.html |
| Env | Build-time `VITE_*` vars; `.env.production` committed (public config) |
| PWA | DEFER |
| Local dev | Prod API by default; optional serverless-offline override |

---

## Risks

1. **Cognito callbackUrls chicken-and-egg** — CloudFront URL unknown before deploy. Requires two-step CDK deploy (create distribution → capture URL → update callbackUrls).

2. **CORS not verified in serverless.yml** — Postman bypasses CORS; browsers WILL enforce preflight OPTIONS. Browser requests will fail if `cors: true` not configured on HTTP API. **Highest-priority blocker** — verify before web development starts.

3. **CloudFront 403 vs 404 for SPA routing** — S3 returns 403 (not 404) for missing keys. CloudFront error pages MUST map BOTH 403 AND 404 → `/index.html` with 200 status.

4. **`verbatimModuleSyntax` + React/shadcn imports** — strict import discipline. Some libraries may need `allowSyntheticDefaultImports: true`. Smoke-test shadcn install pipeline early.

5. **Bundle size with `amazon-cognito-identity-js`** (~170KB min) — must validate Lighthouse ≥ 90 mobile. Lazy-load auth pages via React.lazy. Vite tree-shaking should keep it manageable.

6. **Cursor pagination UX on mobile** — FAB (Add Transaction) z-index must not overlap "Load More" button. Test on small screens.

## Ready for Proposal

Yes. All 13 focus areas explored with concrete recommendations grounded in the actual codebase. The proposal phase should formalize:
- Folder structure for `packages/web/src/`
- Exact CDK construct interface for `WebHosting.ts`
- CORS remediation plan for `infra-sls`
- Two-step CDK deploy for Cognito callbackUrls
- API client wrapper with auto-refresh on 401
