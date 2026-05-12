# Tasks: web-mvp

> SDD phase: tasks
> Project: smart-wallet
> Change: web-mvp
> Date: 2026-05-12
> Engram topic_key: `sdd/web-mvp/tasks`

---

## Conventions

- `[ ]` = pending, `[x]` = completed (sdd-apply ticks these)
- Task ID: `T-{slice}-{nn}` (e.g., `T-04-03`)
- Each task includes:
  - **Slice**: design slice (0–12)
  - **Files**: created / modified
  - **Deps**: prior T-XX-YY that must complete first
  - **Acceptance**: spec REQ IDs it covers + verification step
  - **Est**: S (15–30 min), M (30–90 min), L (90–180 min)
- All user-facing copy is in Spanish (voseo/rioplatense). When a task touches copy, it is noted explicitly.

---

## Workload Forecast

| Metric | Estimate |
|---|---|
| Total tasks | 47 |
| Total estimated time | ~70 hours (solo dev, no tests) |
| Estimated changed lines (LOC) | ~3,400 |
| Files created | ~95 |
| Files modified | ~6 (package.json, tsconfig, SmartWalletStack, UserPool, WalletDetailPage in slice 9, AppRouter in slice 4) |
| **400-line budget risk** | **High** (PR3 alone is ~1,000 LOC) |
| **Chained PRs recommended** | **Yes** (4 PRs already defined; each ~600–1,000 LOC) |
| **Decision needed before apply** | **No** (delivery strategy `ask-on-risk` already resolved: 4 chained PRs are the plan) |

---

## Slice 0 — Install runtime and dev dependencies

- [x] **T-00-01** Install all runtime + dev deps into `packages/web`
  - **Slice**: 0
  - **Files**: `packages/web/package.json`, `pnpm-lock.yaml`
  - **Deps**: none
  - **Acceptance**: scaffolding only — no REQ directly covered. `pnpm install` succeeds with no unresolved peers. `packages/web/node_modules/react` exists.
  - **Est**: S
  - **Note**: Run `pnpm --filter @smart-wallet/web add react react-dom react-router-dom @tanstack/react-query @hookform/resolvers react-hook-form amazon-cognito-identity-js lucide-react sonner clsx tailwind-merge class-variance-authority date-fns react-day-picker tailwindcss-animate @radix-ui/react-slot @radix-ui/react-label @radix-ui/react-dialog @radix-ui/react-popover @radix-ui/react-select @radix-ui/react-separator @radix-ui/react-avatar @radix-ui/react-tabs zod` and dev deps `vite @vitejs/plugin-react @types/react @types/react-dom tailwindcss postcss autoprefixer`. Use `catalog:` for `zod` and `typescript`. Commit lockfile.

---

## Slice 1 — Vite + Tailwind + shadcn init + SHADCN COMPATIBILITY SPIKE

- [x] **T-01-01** Create Vite config, TypeScript config, PostCSS config, and `index.html`
  - **Slice**: 1
  - **Files**: `packages/web/vite.config.ts`, `packages/web/tsconfig.json`, `packages/web/postcss.config.cjs`, `packages/web/index.html`, `packages/web/src/main.tsx`, `packages/web/src/vite-env.d.ts`
  - **Deps**: T-00-01
  - **Acceptance**: REQ-CODE-01, REQ-CODE-03. `pnpm --filter @smart-wallet/web typecheck` green (even with stub `main.tsx`). Vite config has `@/` alias, `target: es2022`, hashed asset output.
  - **Est**: M

- [x] **T-01-02** Init Tailwind + globals CSS with CSS vars and safe-area utilities
  - **Slice**: 1
  - **Files**: `packages/web/tailwind.config.ts`, `packages/web/src/styles/globals.css`
  - **Deps**: T-01-01
  - **Acceptance**: scaffolding. `globals.css` contains `@tailwind base/components/utilities`, CSS variable block for shadcn colors/radius, and `.pb-safe` / `.pt-safe` utilities. Build compiles without Tailwind errors.
  - **Est**: S

- [x] **T-01-03** SPIKE: shadcn init + install ONE component (button) — verify build green
  - **Slice**: 1
  - **Files**: `packages/web/components.json`, `packages/web/src/components/ui/button.tsx`, `packages/web/src/lib/utils.ts`
  - **Deps**: T-01-02
  - **Acceptance**: REQ-CODE-01, REQ-CODE-03. **GATE**: run `pnpm --filter @smart-wallet/web typecheck` and `pnpm --filter @smart-wallet/web build` — both must pass with zero errors before proceeding. If `verbatimModuleSyntax` issues appear, document the workaround (e.g., explicit `import type` corrections in the generated file) before continuing to T-01-04. shadcn preset: New York, neutral base color, `cssVariables: true`.
  - **Est**: M

- [x] **T-01-04** Install remaining 15 shadcn components
  - **Slice**: 1
  - **Files**: `packages/web/src/components/ui/{input,label,form,card,select,separator,sonner,skeleton,dialog,sheet,badge,tabs,avatar,calendar,popover,table}.tsx`
  - **Deps**: T-01-03 (GATE must be green)
  - **Acceptance**: scaffolding. All 16 shadcn components present in `components/ui/`. `pnpm --filter @smart-wallet/web typecheck` green after all copy-ins.
  - **Est**: M

---

## Slice 2 — App scaffolding (lib/, app/, components/common/)

- [ ] **T-02-01** Create `lib/` foundation files
  - **Slice**: 2
  - **Files**: `packages/web/src/lib/env.ts`, `packages/web/src/lib/queryClient.ts`, `packages/web/src/lib/currency.ts`, `packages/web/src/lib/idempotency.ts`, `packages/web/src/lib/i18n.ts`
  - **Deps**: T-01-04
  - **Acceptance**: REQ-MNY-01, REQ-MNY-02, REQ-TXN-06, NFR-LANG-01. `lib/env.ts` throws on missing vars; `lib/currency.ts` exports `formatCurrency`, `signedFormat`, `parseDecimalInput`; `lib/i18n.ts` contains Spanish voseo string tree; `lib/idempotency.ts` exports `generateIdempotencyKey()`. Typecheck green.
  - **Est**: M

- [ ] **T-02-02** Create `lib/api/` (client + errors)
  - **Slice**: 2
  - **Files**: `packages/web/src/lib/api/client.ts`, `packages/web/src/lib/api/errors.ts`, `packages/web/src/lib/api/types.ts`
  - **Deps**: T-02-01
  - **Acceptance**: REQ-AUTH-07, REQ-AUTH-09, REQ-ERR-01, REQ-ERR-04. `ApiError` class with `status`, `code`, `message`, `details`. `userMessageFor()` maps known codes to Spanish strings. `ApiClient` class with `configure()`, `request()`, single-flight refresh via `allowRetry` flag. Typecheck green.
  - **Est**: M

- [ ] **T-02-03** Create `lib/cognito/pool.ts`
  - **Slice**: 2
  - **Files**: `packages/web/src/lib/cognito/pool.ts`
  - **Deps**: T-02-01
  - **Acceptance**: scaffolding. `CognitoUserPool` singleton exported, reading from `env`. Typecheck green.
  - **Est**: S

- [ ] **T-02-04** Create `app/` scaffolding (App, AppRouter stub, ErrorBoundary, routes)
  - **Slice**: 2
  - **Files**: `packages/web/src/app/App.tsx`, `packages/web/src/app/AppRouter.tsx` (stub: only `/login` → placeholder), `packages/web/src/app/ErrorBoundary.tsx`, `packages/web/src/app/routes.ts`
  - **Deps**: T-02-02, T-02-03
  - **Acceptance**: REQ-ERR-03, REQ-NAV-06. `ErrorBoundary` is a class component implementing `getDerivedStateFromError` and `componentDidCatch`. `App.tsx` wraps `BrowserRouter → Providers → AppRouter`. `routes.ts` exports `RoutePaths` constants. Dev server starts (`pnpm --filter @smart-wallet/web dev`).
  - **Est**: M

- [ ] **T-02-05** Create `components/common/` (NotFoundPage, GenericErrorScreen, ErrorState, EmptyState, PageHeader)
  - **Slice**: 2
  - **Files**: `packages/web/src/components/common/NotFoundPage.tsx`, `packages/web/src/components/common/GenericErrorScreen.tsx`, `packages/web/src/components/common/ErrorState.tsx`, `packages/web/src/components/common/EmptyState.tsx`, `packages/web/src/components/common/PageHeader.tsx`
  - **Deps**: T-02-04
  - **Acceptance**: REQ-NAV-06, REQ-ERR-03. Spanish (voseo) strings from `t.*`. `NotFoundPage` has link back to `/wallets`. `GenericErrorScreen` has reload button. Typecheck green.
  - **Est**: M

- [ ] **T-02-06** Create `.env.example` + `.env.production` + commit `favicon.svg`
  - **Slice**: 2
  - **Files**: `packages/web/.env.example`, `packages/web/.env.production`, `packages/web/public/favicon.svg`
  - **Deps**: T-02-01
  - **Acceptance**: REQ-INFRA-06. `.env.example` documents all four `VITE_*` vars. `.env.production` has the real prod values (no secrets — all public Cognito + API config). Simple SVG favicon.
  - **Est**: S

---

## Slice 3 — AuthProvider + session management

- [ ] **T-03-01** Create auth types + sessionStorage helpers
  - **Slice**: 3
  - **Files**: `packages/web/src/features/auth/types.ts`, `packages/web/src/features/auth/sessionStorage.ts`
  - **Deps**: T-02-04
  - **Acceptance**: REQ-AUTH-06, REQ-AUTH-08. `PersistedSession` shape (username, idToken, accessToken, refreshToken). `saveSession`, `loadSession` (with guard for malformed JSON), `clearSession`. Typecheck green.
  - **Est**: S

- [ ] **T-03-02** Create `AuthProvider` + `useAuth`
  - **Slice**: 3
  - **Files**: `packages/web/src/features/auth/AuthProvider.tsx`, `packages/web/src/features/auth/useAuth.ts`
  - **Deps**: T-03-01, T-02-03
  - **Acceptance**: REQ-AUTH-04, REQ-AUTH-06, REQ-AUTH-07, REQ-AUTH-08, REQ-AUTH-09. `AuthProvider` hydrates from sessionStorage on mount (no API call). Exposes `signIn`, `signUp`, `confirmSignUp`, `resendCode`, `forgotPassword`, `confirmForgotPassword`, `refreshSession` (single-flight via `refreshInFlightRef`), `signOut` (full cleanup: local + global signout + clear sessionStorage + queryClient.clear() + navigate). `useAuth` throws if called outside provider. Typecheck green.
  - **Est**: L

- [ ] **T-03-03** Wire `Providers.tsx` with `ApiClientBridge`
  - **Slice**: 3
  - **Files**: `packages/web/src/app/Providers.tsx`
  - **Deps**: T-03-02, T-02-02
  - **Acceptance**: REQ-AUTH-07. `ApiClientBridge` component calls `apiClient.configure({ getToken, refresh })` in `useEffect` whenever `idToken` changes. Provider tree order: `BrowserRouter → ErrorBoundary → QueryClientProvider → AuthProvider → ApiClientBridge → Toaster → children`. Typecheck green. Dev server with empty `.env.development` (same prod values) loads without errors.
  - **Est**: M

---

## Slice 4 — Auth pages + layout shell

- [ ] **T-04-01** Create layout components (PublicLayout, AppLayout, ProtectedRoute)
  - **Slice**: 4
  - **Files**: `packages/web/src/components/layout/PublicLayout.tsx`, `packages/web/src/components/layout/AppLayout.tsx`, `packages/web/src/components/layout/ProtectedRoute.tsx`
  - **Deps**: T-03-03
  - **Acceptance**: REQ-NAV-01, REQ-NAV-02. `ProtectedRoute` reads `useAuth()`, redirects to `/login?next={encoded pathname}` when `idToken === null`. `AppLayout` has `min-h-dvh flex bg-background`, renders `Sidebar` + main + `Fab` + `BottomTabBar` with correct z-index. `PublicLayout` centres content. Typecheck green.
  - **Est**: M

- [ ] **T-04-02** Create BottomTabBar + Sidebar + Fab (stubs — no active links yet)
  - **Slice**: 4
  - **Files**: `packages/web/src/components/layout/BottomTabBar.tsx`, `packages/web/src/components/layout/Sidebar.tsx`, `packages/web/src/components/layout/Fab.tsx`
  - **Deps**: T-04-01
  - **Acceptance**: REQ-NAV-03, REQ-NAV-04, REQ-UI-01, REQ-UI-02. `BottomTabBar` is `fixed inset-x-0 bottom-0 pb-safe z-30 md:hidden`. FAB is `z-40 md:hidden`. Sidebar is `hidden md:flex z-20`. Touch targets `min-h-[44px] min-w-[44px]`. Nav items hard-coded for now (links wired in T-07-01). Typecheck green.
  - **Est**: M

- [ ] **T-04-03** Create LoginPage with RHF form
  - **Slice**: 4
  - **Files**: `packages/web/src/features/auth/pages/LoginPage.tsx`
  - **Deps**: T-04-01, T-03-02
  - **Acceptance**: REQ-AUTH-04, REQ-ERR-01, REQ-VAL-02, REQ-VAL-03, REQ-NAV-02. Form fields: email + password. On success: reads `next` query param, redirects to `next` or `/wallets`. Error: toast with Spanish message (from `userMessageFor`). Submit disabled while pending. Spanish (voseo) labels from `t.auth.*`. Typecheck green.
  - **Est**: M

- [ ] **T-04-04** Create SignupPage + ConfirmSignupPage
  - **Slice**: 4
  - **Files**: `packages/web/src/features/auth/pages/SignupPage.tsx`, `packages/web/src/features/auth/pages/ConfirmSignupPage.tsx`, `packages/web/src/features/auth/components/PasswordRequirementsHint.tsx`
  - **Deps**: T-04-03
  - **Acceptance**: REQ-AUTH-01, REQ-AUTH-02, REQ-AUTH-03, REQ-VAL-02, REQ-VAL-03, REQ-ERR-02. Signup: email + password (≥10 chars, uppercase, lowercase, digit validated by Zod). On success → navigate to `/signup/confirm?email=...`. Confirm: 6-digit code field + "Resend code" button. On success → navigate to `/login` with success toast. Wrong code → toast error in Spanish. Spanish (voseo) strings from `t.auth.*`. Typecheck green.
  - **Est**: M

- [ ] **T-04-05** Create ForgotPasswordPage + ConfirmForgotPasswordPage
  - **Slice**: 4
  - **Files**: `packages/web/src/features/auth/pages/ForgotPasswordPage.tsx`, `packages/web/src/features/auth/pages/ConfirmForgotPasswordPage.tsx`
  - **Deps**: T-04-03
  - **Acceptance**: REQ-AUTH-05, REQ-VAL-03. ForgotPassword: email field → navigate to `/forgot-password/confirm?email=...`. ConfirmForgotPassword: code + new password → navigate to `/login` with success toast. Spanish (voseo) strings. Typecheck green.
  - **Est**: M

- [ ] **T-04-06** Wire full route map in AppRouter + SettingsPage stub
  - **Slice**: 4
  - **Files**: `packages/web/src/app/AppRouter.tsx` (full route map), `packages/web/src/features/settings/pages/SettingsPage.tsx`, `packages/web/src/features/settings/components/SignOutButton.tsx`, `packages/web/src/features/settings/components/AccountInfo.tsx`
  - **Deps**: T-04-05
  - **Acceptance**: REQ-AUTH-08, REQ-NAV-06. All routes from design §3.8 wired. SettingsPage shows username + sign-out button. Sign-out triggers full cleanup (clears session, navigates to `/login`). `NotFoundPage` renders on `*`. Typecheck green.
  - **Est**: M

- [ ] **T-04-07** PR1 end-to-end smoke test (manual, dev → prod Cognito)
  - **Slice**: 4
  - **Files**: none (verification task)
  - **Deps**: T-04-06
  - **Acceptance**: REQ-AUTH-01 through REQ-AUTH-08, REQ-NAV-01, REQ-NAV-02. Manual walkthrough: signup → confirm → login → land on `/wallets` placeholder → refresh stays on `/wallets` (sessionStorage hydration) → sign out → protected routes redirect to `/login`. `pnpm --filter @smart-wallet/web typecheck` and `pnpm --filter @smart-wallet/web lint` both green.
  - **Est**: M

---

## Slice 5 — Wallets API + queries

- [x] **T-05-01** Create `walletsApi.ts` typed API module
  - **Slice**: 5
  - **Files**: `packages/web/src/features/wallets/walletsApi.ts`
  - **Deps**: T-02-02
  - **Acceptance**: REQ-CODE-04, REQ-VAL-01. `walletsApi.list`, `walletsApi.get`, `walletsApi.create` use `apiClient` and DTOs from `@smart-wallet/shared-types` only. No duplicate type definitions. Typecheck green.
  - **Est**: S

- [x] **T-05-02** Create `queries.ts` with `walletKeys` factory + hooks
  - **Slice**: 5
  - **Files**: `packages/web/src/features/wallets/queries.ts`
  - **Deps**: T-05-01
  - **Acceptance**: REQ-WAL-01, REQ-WAL-02. `walletKeys` factory (all, lists, list, details, detail). `useWallets`, `useWallet`, `useCreateWallet` (invalidates `walletKeys.all` on success). Typecheck green.
  - **Est**: S

---

## Slice 6 — Wallets pages + components

- [ ] **T-06-01** Create shared form components (MoneyInput, CurrencySelect, DatePickerField, CategorySelect, WalletSelect)
  - **Slice**: 6
  - **Files**: `packages/web/src/components/forms/MoneyInput.tsx`, `packages/web/src/components/forms/CurrencySelect.tsx`, `packages/web/src/components/forms/DatePickerField.tsx`, `packages/web/src/components/forms/CategorySelect.tsx`, `packages/web/src/components/forms/WalletSelect.tsx`
  - **Deps**: T-01-04, T-02-01
  - **Acceptance**: REQ-TXN-02, REQ-TXN-03, REQ-TXN-04, REQ-TXN-05, REQ-WAL-06, REQ-UI-01, REQ-A11Y-02. `CurrencySelect` shows only USD/PEN. `DatePickerField` defaults to now, enforces max 1 day future, allows 5 years past. `MoneyInput` accepts decimal ≥ 0, at most 2 decimal places. Every field has an associated `<Label>` (accessible). Spanish (voseo) labels from `t.*`. Typecheck green.
  - **Est**: L

- [x] **T-06-02** Create `WalletCard`, `WalletBalanceHeader`, `WalletsListSkeleton`, `EmptyWalletsState`
  - **Slice**: 6
  - **Files**: `packages/web/src/features/wallets/components/WalletCard.tsx`, `packages/web/src/features/wallets/components/WalletBalanceHeader.tsx`, `packages/web/src/features/wallets/components/WalletsListSkeleton.tsx`, `packages/web/src/features/wallets/components/EmptyWalletsState.tsx`
  - **Deps**: T-02-01, T-01-04
  - **Acceptance**: REQ-WAL-01, REQ-WAL-05, REQ-WAL-07, REQ-UI-03, REQ-MNY-01. `WalletCard` shows name, currency (read-only), balance via `formatCurrency`. `WalletsListSkeleton` shows card-shaped skeletons (no spinner). `EmptyWalletsState` has CTA link to `/wallets/new`. Spanish strings from `t.wallets.*`. Typecheck green.
  - **Est**: M

- [x] **T-06-03** Create `WalletForm` component
  - **Slice**: 6
  - **Files**: `packages/web/src/features/wallets/components/WalletForm.tsx`
  - **Deps**: T-06-01
  - **Acceptance**: REQ-WAL-06, REQ-VAL-01, REQ-VAL-02, REQ-VAL-03, REQ-ERR-02. RHF + Zod resolver using `CreateWalletRequestSchema` from `@smart-wallet/shared-types`. Name field (1–64 chars). CurrencySelect (USD/PEN). Submit disabled when invalid or pending. Inline field errors in Spanish via shadcn `<FormMessage>`. Typecheck green.
  - **Est**: M

- [x] **T-06-04** Create `WalletsListPage` + `WalletDetailPage` + `CreateWalletPage`
  - **Slice**: 6
  - **Files**: `packages/web/src/features/wallets/pages/WalletsListPage.tsx`, `packages/web/src/features/wallets/pages/WalletDetailPage.tsx`, `packages/web/src/features/wallets/pages/CreateWalletPage.tsx`
  - **Deps**: T-06-02, T-06-03, T-05-02
  - **Acceptance**: REQ-WAL-01, REQ-WAL-02, REQ-WAL-03, REQ-WAL-04, REQ-WAL-07, REQ-WAL-08, REQ-MNY-03, REQ-UI-03, REQ-ERR-01. `WalletsListPage` shows skeleton while loading, empty state when empty, wallet cards with balance. `CreateWalletPage` submits `useCreateWallet` mutation, navigates to `/wallets` on success, shows toast. `WalletDetailPage` shows wallet header + placeholder for recent transactions (wired in T-09-02). Currency is read-only display everywhere. ErrorState component with retry on query error. Spanish strings throughout. Typecheck green.
  - **Est**: L

---

## Slice 7 — Responsive nav wired

- [x] **T-07-01** Wire BottomTabBar + Sidebar + Fab with real nav links and active state
  - **Slice**: 7
  - **Files**: `packages/web/src/components/layout/BottomTabBar.tsx` (update), `packages/web/src/components/layout/Sidebar.tsx` (update), `packages/web/src/components/layout/Fab.tsx` (update)
  - **Deps**: T-06-04, T-04-02
  - **Acceptance**: REQ-NAV-03, REQ-NAV-04, REQ-UI-01, REQ-UI-02, REQ-A11Y-01. BottomTabBar: 4 items (Wallets → `/wallets`, FAB → `/transactions/new`, Categories → `/categories`, Settings → `/settings`). Active item highlighted via `useLocation`. FAB icon has `aria-label`. Safe-area inset applied. Smoke-test on Chrome DevTools mobile emulation: bottom nav visible at < 768 px, sidebar visible at ≥ 768 px. Spanish nav labels from `t.*`. Typecheck + lint green.
  - **Est**: M

- [x] **T-07-02** PR2 end-to-end smoke test (manual)
  - **Slice**: 7
  - **Files**: none (verification task)
  - **Deps**: T-07-01
  - **Acceptance**: REQ-WAL-01 through REQ-WAL-08, REQ-MNY-01, REQ-MNY-03, REQ-UI-03. User can list wallets, see balance formatted correctly (USD `$50.00`, PEN `S/ 200.00`), navigate to detail, create wallet. Skeleton renders during fetch. Empty state shown when no wallets. Error state has Retry button. `pnpm typecheck` + `pnpm lint` green.
  - **Est**: M

---

## Slice 8 — Transactions API + queries

- [ ] **T-08-01** Create `transactionsApi.ts` typed API module
  - **Slice**: 8
  - **Files**: `packages/web/src/features/transactions/transactionsApi.ts`
  - **Deps**: T-02-02, T-05-01
  - **Acceptance**: REQ-TXN-06, REQ-CODE-04. `transactionsApi.byWallet` (GET with filters), `transactionsApi.add` (POST with `Idempotency-Key` header). DTOs from `@smart-wallet/shared-types`. Typecheck green.
  - **Est**: S

- [ ] **T-08-02** Create `queries.ts` with `transactionKeys` factory + hooks
  - **Slice**: 8
  - **Files**: `packages/web/src/features/transactions/queries.ts`
  - **Deps**: T-08-01, T-05-02
  - **Acceptance**: REQ-TXN-07, REQ-TXN-11. `transactionKeys` factory (all, byWallet, byWalletFiltered). `useWalletTransactions` uses `useInfiniteQuery` with `getNextPageParam: (last) => last.nextCursor`. `useAddTransaction` invalidates `transactionKeys.byWallet(walletId)`, `walletKeys.detail(walletId)`, `walletKeys.lists()` on success. Typecheck green.
  - **Est**: S

---

## Slice 9 — Transactions pages + forms

- [ ] **T-09-01** Create `TransactionListItem` + `TransactionsListSkeleton` components
  - **Slice**: 9
  - **Files**: `packages/web/src/features/transactions/components/TransactionListItem.tsx`, `packages/web/src/features/transactions/components/TransactionsListSkeleton.tsx`
  - **Deps**: T-02-01, T-01-04
  - **Acceptance**: REQ-TXN-12, REQ-UI-03, REQ-MNY-02. `TransactionListItem` displays amount via `signedFormat`: income is `+${formatted}` in green, expense is `-${formatted}` in red. Skeleton matches list item shape (no spinner). Typecheck green.
  - **Est**: S

- [ ] **T-09-02** Create `RecentTransactionsList` + wire into `WalletDetailPage`
  - **Slice**: 9
  - **Files**: `packages/web/src/features/transactions/components/RecentTransactionsList.tsx`, `packages/web/src/features/wallets/pages/WalletDetailPage.tsx` (update)
  - **Deps**: T-09-01, T-08-02, T-06-04
  - **Acceptance**: REQ-WAL-04, REQ-TXN-12. `RecentTransactionsList` calls `useWalletTransactions(walletId, { limit: 10 })` and renders up to 10 items. Link to `/wallets/:walletId/transactions` visible. Spanish empty state text. Typecheck green.
  - **Est**: M

- [ ] **T-09-03** Create `TransactionFilters` component
  - **Slice**: 9
  - **Files**: `packages/web/src/features/transactions/components/TransactionFilters.tsx`
  - **Deps**: T-06-01
  - **Acceptance**: REQ-TXN-10. Collapsible panel with date-range (from/to `DatePickerField`) and type filter (income/expense select). Filter state stored in component local state (no URL sync in MVP). Spanish (voseo) labels. Typecheck green.
  - **Est**: M

- [ ] **T-09-04** Create `TransactionForm` component
  - **Slice**: 9
  - **Files**: `packages/web/src/features/transactions/components/TransactionForm.tsx`
  - **Deps**: T-06-01, T-09-01
  - **Acceptance**: REQ-TXN-01 through REQ-TXN-09, REQ-VAL-01, REQ-VAL-02, REQ-VAL-03, REQ-ERR-02, REQ-A11Y-02. RHF + Zod resolver using `AddTransactionRequestSchema` from `@smart-wallet/shared-types`. Fields: type toggle (income/expense), WalletSelect, currency (read-only from wallet, auto-populated), MoneyInput (>0, ≤2 decimal places), CategorySelect (filtered by selected type — resets when type changes), DatePickerField (default now, max 1 day future, 5 years past). Note field (optional). Submit disabled when invalid or pending. Per-field inline errors in Spanish via `<FormMessage>`. Accepts `form`, `wallets`, `categories`, `submitting`, `onSubmit` as props (presentational). Typecheck green.
  - **Est**: L

- [ ] **T-09-05** Create `AddTransactionPage`
  - **Slice**: 9
  - **Files**: `packages/web/src/features/transactions/pages/AddTransactionPage.tsx`
  - **Deps**: T-09-04, T-08-02, T-05-02
  - **Acceptance**: REQ-TXN-01, REQ-TXN-06, REQ-TXN-07, REQ-TXN-09. `idempotencyKey` generated once via `useMemo(generateIdempotencyKey, [])` on mount. On success: toast "Transacción guardada", `navigate(-1)`. On server error: toast via `userMessageFor(e)` in Spanish, form stays open. 409 errors (currency_mismatch, category_type_mismatch) mapped to inline field errors via `setError`. Typecheck green.
  - **Est**: M

- [ ] **T-09-06** Create `TransactionListPage` with pagination + filters
  - **Slice**: 9
  - **Files**: `packages/web/src/features/transactions/pages/TransactionListPage.tsx`
  - **Deps**: T-09-03, T-09-01, T-08-02
  - **Acceptance**: REQ-TXN-10, REQ-TXN-11, REQ-TXN-13. `useWalletTransactions` with `useInfiniteQuery`. "Cargar más" button calls `fetchNextPage()`; disappears when `!hasNextPage`. Filter panel passes `from`, `to`, `type` to the query. Empty state: "No hay transacciones todavía." or "No hay transacciones con los filtros aplicados." (Spanish voseo). Skeleton while loading. Typecheck green.
  - **Est**: L

- [ ] **T-09-07** PR3-transactions smoke test (manual, against prod API)
  - **Slice**: 9
  - **Files**: none (verification task)
  - **Deps**: T-09-06
  - **Acceptance**: REQ-TXN-01 through REQ-TXN-13. Add income + expense transaction. Double-click submit → only one transaction. Pagination: load 10 → click "Cargar más" → more load without replacing. Filter by type works. Empty state visible on empty wallet. `pnpm typecheck` + `pnpm lint` green.
  - **Est**: M

---

## Slice 10 — Categories feature

- [ ] **T-10-01** Create `categoriesApi.ts` typed API module + `queries.ts`
  - **Slice**: 10
  - **Files**: `packages/web/src/features/categories/categoriesApi.ts`, `packages/web/src/features/categories/queries.ts`
  - **Deps**: T-02-02
  - **Acceptance**: REQ-CAT-01, REQ-CAT-02, REQ-CAT-03, REQ-CODE-04. `categoriesApi.list`, `.create`, `.delete`. `categoryKeys` factory. `useCategories`, `useCreateCustomCategory`, `useDeleteCustomCategory` (each invalidates `categoryKeys.all` on success). Typecheck green.
  - **Est**: S

- [ ] **T-10-02** Create `CategoryItem` + `CategoryList` components
  - **Slice**: 10
  - **Files**: `packages/web/src/features/categories/components/CategoryItem.tsx`, `packages/web/src/features/categories/components/CategoryList.tsx`
  - **Deps**: T-01-04, T-02-01
  - **Acceptance**: REQ-CAT-01, REQ-CAT-03. `CategoryItem` shows name + type badge. Delete button visible only when `isCustom === true` (predefined items show nothing). Predefined and custom categories grouped by type. Spanish labels. Touch targets ≥ 44 px. Typecheck green.
  - **Est**: M

- [ ] **T-10-03** Create `CreateCategoryDialog` component
  - **Slice**: 10
  - **Files**: `packages/web/src/features/categories/components/CreateCategoryDialog.tsx`
  - **Deps**: T-10-01, T-01-04
  - **Acceptance**: REQ-CAT-02, REQ-CAT-05, REQ-VAL-01, REQ-VAL-02, REQ-VAL-03, REQ-A11Y-03. Dialog (shadcn `<Dialog>`) with RHF form + Zod resolver using `CreateCustomCategoryRequestSchema` from `@smart-wallet/shared-types`. Name (1–32 chars), type select. Submit disabled when invalid or pending. Inline field errors in Spanish. Focus trapped inside dialog (shadcn handles this). When closed, focus returns to trigger button. Typecheck green.
  - **Est**: M

- [ ] **T-10-04** Create `DeleteCategoryConfirm` component
  - **Slice**: 10
  - **Files**: `packages/web/src/features/categories/components/DeleteCategoryConfirm.tsx`
  - **Deps**: T-10-01, T-01-04
  - **Acceptance**: REQ-CAT-03, REQ-CAT-04, REQ-A11Y-03. Confirmation dialog ("¿Eliminar esta categoría?"). Delete request NOT sent until user confirms. Cancel closes dialog without any API call. On confirm: `useDeleteCustomCategory` called → success toast in Spanish → query invalidated. Focus trap + restoration via shadcn Dialog. Typecheck green.
  - **Est**: M

- [ ] **T-10-05** Create `CategoriesPage`
  - **Slice**: 10
  - **Files**: `packages/web/src/features/categories/pages/CategoriesPage.tsx`
  - **Deps**: T-10-02, T-10-03, T-10-04
  - **Acceptance**: REQ-CAT-01 through REQ-CAT-05. Lists predefined + custom categories grouped by type. "Nueva categoría" button opens `CreateCategoryDialog`. Delete button on custom items opens `DeleteCategoryConfirm`. Skeleton while loading. ErrorState with retry on query error. Spanish strings from `t.categories.*`. Typecheck green.
  - **Est**: M

- [ ] **T-10-06** PR3-categories smoke test (manual)
  - **Slice**: 10
  - **Files**: none (verification task)
  - **Deps**: T-10-05, T-09-07
  - **Acceptance**: REQ-CAT-01 through REQ-CAT-05, REQ-TXN-04. Create custom category. Use it in Add Transaction form (appears in CategorySelect). Delete it (confirmation dialog). Predefined categories have no delete control. `pnpm typecheck` + `pnpm lint` green.
  - **Est**: M

---

## Slice 11 — CDK WebHosting construct + stack integration

- [ ] **T-11-01** Create `WebHosting.ts` CDK construct
  - **Slice**: 11
  - **Files**: `packages/infra-cdk/src/constructs/WebHosting.ts`
  - **Deps**: none (parallel-safe with PR1–3 code work)
  - **Acceptance**: REQ-INFRA-01, REQ-INFRA-02, REQ-INFRA-05. S3 bucket: `BLOCK_ALL`, `S3_MANAGED` encryption, `versioned: true`, `DESTROY` removal policy (MVP). CloudFront: OAC via `S3BucketOrigin.withOriginAccessControl`, `PRICE_CLASS_100`, `REDIRECT_TO_HTTPS`, `CACHING_OPTIMIZED`, `SECURITY_HEADERS`, `compress: true`. Error responses: BOTH 403 AND 404 → `/index.html` HTTP 200 with `ttl: 0`. Three `StringParameter` SSM resources. `pnpm --filter @smart-wallet/infra-cdk typecheck` green.
  - **Est**: M

- [ ] **T-11-02** Wire `WebHosting` into `SmartWalletStack` + add `CfnOutput`
  - **Slice**: 11
  - **Files**: `packages/infra-cdk/src/stacks/SmartWalletStack.ts`
  - **Deps**: T-11-01
  - **Acceptance**: REQ-INFRA-05. `SmartWalletStack` instantiates `WebHosting`. `CfnOutput` for `WebDistributionDomain` (with description: "CloudFront domain — copy into UserPool callbackUrls and redeploy."). `pnpm --filter @smart-wallet/infra-cdk synth` clean (no errors). Typecheck green.
  - **Est**: S

- [ ] **T-11-03** Create deploy script (`scripts/deploy.mjs`) + `pnpm deploy` script entry
  - **Slice**: 11
  - **Files**: `packages/web/scripts/deploy.mjs`, `packages/web/package.json` (update `scripts.deploy`)
  - **Deps**: T-11-02
  - **Acceptance**: REQ-INFRA-06, REQ-INFRA-03. Script reads `bucket-name` and `distribution-id` from SSM. Two-pass S3 sync: hashed assets with 1y immutable cache, `index.html` with `no-cache, no-store, must-revalidate`. CloudFront invalidation of `/index.html` only. Prints Lighthouse reminder. Script is `node:child_process` only — no extra deps. Manually verify script logic (dry run with `echo` before real deploy).
  - **Est**: M

- [ ] **T-11-04** Create `DEPLOY.md` with two-step deploy checklist
  - **Slice**: 11
  - **Files**: `packages/web/DEPLOY.md`
  - **Deps**: T-11-02
  - **Acceptance**: REQ-INFRA-04. Documents: (1) `cdk deploy` step 1, (2) `aws ssm get-parameter` to capture domain, (3) edit `UserPool.ts` callbackUrls/logoutUrls with literal URL, (4) `cdk deploy` step 2, (5) Lighthouse reminder. Exact CLI commands included. This is a project doc (not an SDD artifact) and is permitted by `~/.claude/CLAUDE.md`.
  - **Est**: S

---

## Slice 12 — Deploy step 1 + capture domain + step 2 + Lighthouse

- [ ] **T-12-01** CDK deploy step 1 — create CloudFront + SSM parameters
  - **Slice**: 12
  - **Files**: none (operational task)
  - **Deps**: T-11-02, T-10-06 (app feature-complete from PR3)
  - **Acceptance**: REQ-INFRA-01, REQ-INFRA-02, REQ-INFRA-05. `pnpm --filter @smart-wallet/infra-cdk deploy` succeeds. CloudFront distribution created. Three SSM parameters under `/smart-wallet/prod/web/` exist. `CfnOutput` shows distribution domain. Bucket exists with BPA.
  - **Est**: M

- [ ] **T-12-02** Build web app + run deploy script (sync to S3)
  - **Slice**: 12
  - **Files**: none (operational task)
  - **Deps**: T-12-01
  - **Acceptance**: REQ-INFRA-03, REQ-INFRA-06. `pnpm --filter @smart-wallet/web build` succeeds. `node scripts/deploy.mjs` syncs `dist/` to S3 with correct cache headers. CloudFront invalidation of `/index.html` completes. Site reachable at `https://{distribution-domain}`.
  - **Est**: S

- [ ] **T-12-03** Update `UserPool.ts` callbackUrls + logoutUrls with CloudFront domain
  - **Slice**: 12
  - **Files**: `packages/infra-cdk/src/constructs/UserPool.ts`
  - **Deps**: T-12-01
  - **Acceptance**: REQ-INFRA-04. Literal CloudFront domain added to `callbackUrls` and `logoutUrls`. `pnpm --filter @smart-wallet/infra-cdk synth` clean. Typecheck green.
  - **Est**: S

- [ ] **T-12-04** CDK deploy step 2 — update Cognito callbacks
  - **Slice**: 12
  - **Files**: none (operational task)
  - **Deps**: T-12-03
  - **Acceptance**: REQ-INFRA-04. `cdk deploy` applies only the UserPool client diff. Cognito User Pool Client now has CloudFront URL in `callbackUrls` and `logoutUrls`. Verify via AWS Console or `aws cognito-idp describe-user-pool-client`.
  - **Est**: S

- [ ] **T-12-05** Deep-link smoke test + SPA routing verification
  - **Slice**: 12
  - **Files**: none (verification task)
  - **Deps**: T-12-04
  - **Acceptance**: REQ-NAV-05, REQ-INFRA-02. `curl -i https://{domain}/wallets/foo` → `HTTP/2 200` + index.html body. Browser: direct navigation to `/categories` on deployed URL renders app correctly (not CloudFront 404). `https://{domain}` redirects HTTP → HTTPS.
  - **Est**: S

- [ ] **T-12-06** Full happy-path smoke test on real phone + Lighthouse run
  - **Slice**: 12
  - **Files**: none (verification task)
  - **Deps**: T-12-05
  - **Acceptance**: REQ-UI-04, NFR-PERF-01, NFR-A11Y-01, NFR-BP-01, NFR-SEO-01, NFR-BUNDLE-01. Manual: signup → confirm → login → create wallet → add income + expense → see balance → categories → sign out. Lighthouse mobile (Chrome DevTools, Mobile preset, on deployed URL): Performance ≥ 90, Accessibility ≥ 90, Best Practices ≥ 90, SEO ≥ 90. Bundle gzip: confirm < 300 KB in `dist/assets/`. Attach Lighthouse report to PR4 description.
  - **Est**: M

---

## Slice → PR Map

| Slice | Title | PR | LOC estimate |
|---|---|---|---|
| 0 | Install deps | PR1 | ~20 (package.json delta) |
| 1 | Vite + Tailwind + shadcn init (spike) | PR1 | ~350 |
| 2 | App scaffolding (lib/, app/, common/) | PR1 | ~300 |
| 3 | AuthProvider + session management | PR1 | ~200 |
| 4 | Auth pages + layout shell | PR1 | ~400 |
| 5 | Wallets API + queries | PR2 | ~80 |
| 6 | Wallets pages + components | PR2 | ~400 |
| 7 | Responsive nav wired | PR2 | ~150 |
| 8 | Transactions API + queries | PR3 | ~100 |
| 9 | Transactions pages + forms | PR3 | ~500 |
| 10 | Categories feature | PR3 | ~350 |
| 11 | CDK WebHosting construct + deploy script | PR4 | ~250 |
| 12 | Deploy + Cognito update + verification | PR4 | ~50 (operational) |

---

## PR Boundaries

| PR | Slices | Acceptance gate |
|---|---|---|
| **PR1** — Bootstrap + Auth | 0–4 | Auth flow works end-to-end against deployed prod Cognito; build green; `typecheck` + `lint` green; sessionStorage hydration verified on reload |
| **PR2** — Wallets | 5–7 | List + create + detail work against prod API with real JWT (localhost dev server); skeleton + empty + error states verified |
| **PR3** — Transactions + Categories | 8–10 | All 9 backend endpoints consumed; idempotency-key double-submit verified; paginated load more works; categories create + delete work |
| **PR4** — Infra + Deploy | 11–12 | App accessible at CloudFront URL; Cognito callbacks updated; Lighthouse mobile ≥ 90 on all 4 categories; deep-link routing works |

---

## Spec → Task Coverage Map

| REQ ID | Tasks |
|---|---|
| REQ-AUTH-01 | T-04-04 |
| REQ-AUTH-02 | T-04-04 |
| REQ-AUTH-03 | T-04-04 |
| REQ-AUTH-04 | T-03-02, T-04-03 |
| REQ-AUTH-05 | T-04-05 |
| REQ-AUTH-06 | T-03-01, T-03-02 |
| REQ-AUTH-07 | T-02-02, T-03-02 |
| REQ-AUTH-08 | T-03-02, T-04-06 |
| REQ-AUTH-09 | T-03-02 |
| REQ-NAV-01 | T-04-01 |
| REQ-NAV-02 | T-04-01, T-04-03 |
| REQ-NAV-03 | T-04-02, T-07-01 |
| REQ-NAV-04 | T-04-02, T-07-01 |
| REQ-NAV-05 | T-11-01, T-12-05 |
| REQ-NAV-06 | T-02-04, T-02-05 |
| REQ-WAL-01 | T-06-02, T-06-04 |
| REQ-WAL-02 | T-06-03, T-06-04 |
| REQ-WAL-03 | T-06-04 |
| REQ-WAL-04 | T-09-02 |
| REQ-WAL-05 | T-06-02, T-06-04 |
| REQ-WAL-06 | T-06-03 |
| REQ-WAL-07 | T-06-02, T-06-04 |
| REQ-WAL-08 | T-06-04 |
| REQ-TXN-01 | T-09-04, T-09-05 |
| REQ-TXN-02 | T-06-01, T-09-04 |
| REQ-TXN-03 | T-06-01, T-09-04 |
| REQ-TXN-04 | T-09-04 |
| REQ-TXN-05 | T-06-01 |
| REQ-TXN-06 | T-08-01, T-09-05 |
| REQ-TXN-07 | T-08-02, T-09-05 |
| REQ-TXN-08 | T-09-04 |
| REQ-TXN-09 | T-09-05 |
| REQ-TXN-10 | T-09-03, T-09-06 |
| REQ-TXN-11 | T-08-02, T-09-06 |
| REQ-TXN-12 | T-09-01 |
| REQ-TXN-13 | T-09-06 |
| REQ-CAT-01 | T-10-01, T-10-02, T-10-05 |
| REQ-CAT-02 | T-10-03, T-10-05 |
| REQ-CAT-03 | T-10-02, T-10-04 |
| REQ-CAT-04 | T-10-04 |
| REQ-CAT-05 | T-10-03 |
| REQ-UI-01 | T-04-02, T-07-01 |
| REQ-UI-02 | T-04-02, T-07-01 |
| REQ-UI-03 | T-06-02, T-09-01, T-09-06 |
| REQ-UI-04 | T-12-06 |
| REQ-UI-05 | T-12-06 |
| REQ-UI-06 | T-09-04 |
| REQ-UI-07 | T-09-04 |
| REQ-UI-08 | T-12-06 |
| REQ-ERR-01 | T-02-02, T-04-03 |
| REQ-ERR-02 | T-06-03, T-09-04, T-10-03 |
| REQ-ERR-03 | T-02-04 |
| REQ-ERR-04 | T-02-02, T-03-02 |
| REQ-MNY-01 | T-02-01, T-06-02 |
| REQ-MNY-02 | T-09-01 |
| REQ-MNY-03 | T-06-04 |
| REQ-VAL-01 | T-06-03, T-09-04, T-10-03 |
| REQ-VAL-02 | T-06-03, T-09-04, T-10-03 |
| REQ-VAL-03 | T-04-03, T-04-04, T-06-03, T-09-04, T-10-03 |
| REQ-A11Y-01 | T-07-01 |
| REQ-A11Y-02 | T-06-01, T-09-04 |
| REQ-A11Y-03 | T-10-03, T-10-04 |
| REQ-A11Y-04 | T-03-03 (Sonner configured with `richColors`, aria-live built-in) |
| REQ-INFRA-01 | T-11-01 |
| REQ-INFRA-02 | T-11-01, T-12-05 |
| REQ-INFRA-03 | T-11-03 |
| REQ-INFRA-04 | T-12-03, T-12-04 |
| REQ-INFRA-05 | T-11-01 |
| REQ-INFRA-06 | T-11-03 |
| REQ-CODE-01 | T-04-07, T-07-02, T-10-06 (typecheck gate per PR) |
| REQ-CODE-02 | T-04-07, T-07-02, T-10-06 (lint gate per PR) |
| REQ-CODE-03 | T-01-03 (SPIKE gate) |
| REQ-CODE-04 | T-05-01, T-08-01, T-10-01 |
| REQ-CODE-05 | all tasks (no backend files touched — enforced by folder structure) |

---

## Notes for sdd-apply

1. **SPIKE GATE** (T-01-03): install ONE shadcn component (`button`), run `pnpm typecheck` + `pnpm build`. If `verbatimModuleSyntax` errors appear in generated shadcn code, fix them (add `import type` where needed) BEFORE scaling to all 16 components. Do not skip this gate.

2. **After EVERY slice**: run `pnpm --filter @smart-wallet/web typecheck && pnpm --filter @smart-wallet/web lint`. Do not accumulate type debt across slices.

3. **After EVERY PR**: run `pnpm typecheck && pnpm lint` at the monorepo level (infra-cdk included in PR4).

4. **Spanish strings (voseo)**: all user-facing copy (labels, placeholders, error messages, toasts, empty states, confirmation dialogs, nav labels) must come from `lib/i18n.ts`. No English string literals in JSX. Use `t.*` everywhere.

5. **No tests** in this change (`strict_tdd: false`). Do not create test files.

6. **Zod schemas from shared-types**: do NOT duplicate schemas. `CreateWalletRequestSchema`, `AddTransactionRequestSchema`, `CreateCustomCategoryRequestSchema` etc. must be imported from `@smart-wallet/shared-types`. Only auth-specific validations (password strength, 6-digit code pattern) can be inline since they have no backend schema counterpart.

7. **Currencies: USD and PEN only**. `CurrencySelect` hard-codes `["USD", "PEN"]`. No other currency option.

8. **Idempotency key**: `useMemo(generateIdempotencyKey, [])` in `AddTransactionPage` — stable for the lifetime of the component mount. Do not generate inside the submit handler.

9. **`verbatimModuleSyntax`**: all type-only imports must use `import type`. Vite + `moduleResolution: Bundler` handle this — do NOT add `.js` extensions to source imports.

10. **PR4 two-step deploy**: T-12-03 requires manually reading the CloudFront domain from SSM after T-12-01. Do not skip the second `cdk deploy` — auth callbacks will be rejected without it.

11. **Auth pages vs shared-types**: auth forms (login, signup, etc.) do NOT use DTOs from `shared-types` — those are backend HTTP request shapes. Auth form schemas are defined inline (password strength Zod refinements, 6-digit code pattern). This is intentional.

12. **`removalPolicy: DESTROY`** for the S3 bucket — intentional for personal MVP. The bucket holds only rebuilt assets.
