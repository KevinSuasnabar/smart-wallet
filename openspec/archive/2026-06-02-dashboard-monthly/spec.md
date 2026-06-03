# Dashboard mensual — Spec

## Capability groups

- **ROUTE** — Routing & home redirect (4 requirements)
- **NAV** — Sidebar + BottomTabBar entries (3 requirements)
- **DATA** — Data fetching & aggregation hook (6 requirements)
- **BALANCE** — Total balance per currency card (3 requirements)
- **MONTHLY** — Monthly income/expense/net cards (4 requirements)
- **TOPCATS** — Top categories card (4 requirements)
- **I18N** — Strings in Spanish neutro (2 requirements)
- **EMPTY** — Empty/loading/error states (3 requirements)

Total: **29 requirements / 12 scenarios**.

---

## ROUTE — Routing

### ROUTE-01

The web app MUST expose a new route constant `routes.dashboard = '/dashboard'` in `packages/web/src/app/routes.ts`.

### ROUTE-02

`AppRouter.tsx` MUST register a protected route at `routes.dashboard` rendering `<DashboardPage />`, wrapped in `<AppLayout />`, behind `<ProtectedRoute />`. Same protection level as `/wallets`.

### ROUTE-03

The home route `/` MUST redirect to `routes.dashboard` (was: `routes.wallets`). Unauthenticated users still get bounced to `/login` by `ProtectedRoute` first.

### ROUTE-04

The redirect MUST use `<Navigate to={routes.dashboard} replace />` so the `/` entry does not appear in browser history.

---

## NAV — Navigation chrome

### NAV-01

`Sidebar` (desktop) MUST include a "Resumen" item as the FIRST entry in `navItems`, pointing to `routes.dashboard`, with the `LayoutGrid` icon from lucide-react.

### NAV-02

`BottomTabBar` (mobile) MUST include a "Resumen" tab as the FIRST entry, pointing to `routes.dashboard`, with the same `LayoutGrid` icon, matching the existing `tabClass` styling and active-state contrast (cream on navy when active).

### NAV-03

Both nav items MUST use `NavLink` so the active state highlights when the user is on `/dashboard`.

---

## DATA — Data fetching & aggregation

### DATA-01

A custom hook `useMonthlyDashboard(displayCurrency: Currency | null)` MUST live in `packages/web/src/features/dashboard/hooks/useMonthlyDashboard.ts`.

### DATA-02

The hook MUST internally call `useWallets()` and a parallel set of `useWalletTransactions(walletId, { from, to })` queries (one per wallet) using the month boundaries:

- `from = first day of current month at 00:00:00.000 local time, serialized to ISO8601 UTC`
- `to = current moment in ISO8601 UTC`

Boundaries are computed by a pure function `monthBoundaries(now: Date)` in `lib/aggregation.ts`.

### DATA-03

For each wallet's transaction query, the hook MUST drain all pages of the infinite query (call `fetchNextPage` while `hasNextPage` is true) BEFORE aggregating, so partial-page results don't skew the totals. This is exposed as an internal effect, not a button.

### DATA-04

The hook MUST return:

```ts
{
  totalsByCurrency: Array<{ currency: Currency; balance: string }>,
  monthlyIncome: string,    // sum of expense transactions in displayCurrency
  monthlyExpenses: string,  // sum of income transactions in displayCurrency (decimal string, non-negative)
  monthlyNet: string,       // monthlyIncome - monthlyExpenses (signed)
  topCategories: Array<{ categoryId: string; amount: string; share: number }>,
  availableCurrencies: Currency[], // distinct currencies present in wallets (sorted)
  isLoading: boolean,
  isError: boolean,
  refetch: () => Promise<void>,
}
```

All monetary aggregation uses string-decimal arithmetic (no `Number()`/`parseFloat` math). A small `decimal.ts` helper provides `add`, `sub`, `abs` on signed decimal strings (2 decimal places). If a helper already exists, reuse it.

### DATA-05

`displayCurrency = null` MUST behave as "no preferred and only one currency in wallets" — fall back to `availableCurrencies[0]` or `'USD'` if empty.

### DATA-06

`topCategories` MUST be the 3 categories with the largest **expense** amount (income excluded) for the month, in `displayCurrency`, sorted descending by amount. Ties broken by `categoryId` lexical. `share` is `amount / monthlyExpenses` as a number in [0,1]; when `monthlyExpenses === '0'`, `share` is `0`.

---

## BALANCE — Total balance card

### BALANCE-01

`BalanceCard` MUST render `t.dashboard.totalBalance` as the eyebrow, and one numeric tile per item in `totalsByCurrency`. Each tile shows the currency label (`USD`, `PEN`) and the formatted balance via `formatCurrency(balance, currency)`.

### BALANCE-02

The card MUST use the `ColorBlock` editorial primitive with tone `navy` (or a fixed `cream`-based design — final tone decided in design.md).

### BALANCE-03

When `totalsByCurrency` is empty (no wallets), the card MUST render a placeholder showing `t.dashboard.noWallets` with a CTA linking to `routes.walletsNew`.

---

## MONTHLY — Monthly stats cards

### MONTHLY-01

The dashboard MUST render three side-by-side cards (responsive: 1 column mobile, 3 columns md+): Ingresos del mes, Gastos del mes, Balance del mes.

### MONTHLY-02

Each card displays:

- Eyebrow: `t.dashboard.monthlyIncome` / `t.dashboard.monthlyExpenses` / `t.dashboard.monthlyNet`
- Amount: formatted with `formatCurrency(value, displayCurrency)`. The "Balance" card prefixes `+` or `−` depending on sign; the "Ingresos" and "Gastos" cards do not.

### MONTHLY-03

When the user has wallets in more than one currency (`availableCurrencies.length > 1`), the dashboard MUST render a `CurrencyToggle` above the monthly cards, allowing the user to switch which currency the MTD cards are shown in. The toggle persists the choice in component state only (no localStorage write — `usePreferredCurrency` from Settings stays the source of truth for the default).

### MONTHLY-04

The initial `displayCurrency` resolution order is:

1. `usePreferredCurrency().currency` if it is in `availableCurrencies`
2. `availableCurrencies[0]` if non-empty
3. `'USD'` fallback

---

## TOPCATS — Top categories card

### TOPCATS-01

`TopCategoriesCard` MUST render `t.dashboard.topExpenses` as the eyebrow and a list of up to 3 categories from `topCategories`.

### TOPCATS-02

Each row MUST show:

- A small colored dot using the category's `color` (`bg-block-{color}` class, mapped via the existing `WalletColor` Tailwind tokens)
- Category display name resolved via: custom → `useCategories()` result match; predefined → `PREDEFINED_CATEGORIES` lookup by `categoryId`. If unresolved (orphan tx), render `categoryId` raw as a fallback.
- Amount formatted via `formatCurrency`
- `share` as a percentage label (e.g. "32%") rounded to nearest integer

### TOPCATS-03

When `topCategories` is empty AND there are no expense transactions this month, the card MUST render `t.dashboard.noExpensesYet` as the body.

### TOPCATS-04

The card MUST tolerate categories whose `categoryId` is a UUID for a category that has since been deleted (rare: server-side guard prevents this, but client cache may still hold a stale tx). In that case, render the raw `categoryId` short-form (`UUID slice 0-8…`) — do NOT crash.

---

## I18N — Strings

### I18N-01

A new `t.dashboard` section MUST exist in `packages/web/src/lib/i18n.ts` with these keys:

- `title: 'Resumen'`
- `eyebrow: 'Este mes'`
- `totalBalance: 'Balance total'`
- `monthlyIncome: 'Ingresos del mes'`
- `monthlyExpenses: 'Gastos del mes'`
- `monthlyNet: 'Balance del mes'`
- `topExpenses: 'Top categorías'`
- `noExpensesYet: 'Aún no hay gastos este mes'`
- `noWallets: 'Crea tu primera billetera para ver tu resumen'`
- `addTransactionCta: 'Agregar movimiento'`
- `sidebarLabel: 'Resumen'`

### I18N-02

All strings MUST be Spanish latinoamericano neutro (NO voseo). Verbs in third-person imperative (`Crea`, not `Creá`).

---

## EMPTY — Empty / loading / error states

### EMPTY-01

While `useMonthlyDashboard().isLoading` is true, the page MUST render a skeleton (greyed-out card shapes). Reuse the existing `WalletsListSkeleton` pattern or create a small `DashboardSkeleton.tsx`.

### EMPTY-02

On `isError`, the page MUST render the existing `<ErrorState message={t.errors.generic} onRetry={refetch} />`.

### EMPTY-03

When the user has zero wallets, the BalanceCard, MonthlyStats, and TopCats sections MUST all render with a unified empty message: "Crea tu primera billetera para ver tu resumen" + CTA to `routes.walletsNew`. No partial rendering, no half-empty cards.

---

## Scenarios

### S-01 — happy path with one currency

**Given** user has 2 wallets in USD with combined balance "150.00", and this month has 3 income tx (sum 500.00) and 4 expense tx (sum 320.00)
**When** the user navigates to `/dashboard`
**Then** BalanceCard shows "USD 150.00", Monthly cards show "Ingresos 500.00 USD / Gastos 320.00 USD / Balance +180.00 USD", TopCats shows up to 3 expense categories sorted by amount with shares summing to 100%.

### S-02 — happy path multi-currency

**Given** user has 1 USD wallet (balance 100.00) and 1 PEN wallet (balance 380.00), preferred currency PEN, with month tx in both currencies
**When** the user opens `/dashboard`
**Then** BalanceCard shows two tiles "USD 100.00" and "PEN 380.00", CurrencyToggle is visible with PEN active, Monthly cards aggregate only PEN tx, TopCats only PEN expense categories.

### S-03 — switch currency

**Given** S-02 setup with toggle visible
**When** user clicks "USD" in the toggle
**Then** Monthly and TopCats re-aggregate using USD tx only; BalanceCard is unchanged.

### S-04 — no wallets

**Given** newly registered user with zero wallets
**When** the user opens `/dashboard`
**Then** all three sections render the unified empty message "Crea tu primera billetera…" with a CTA to `routes.walletsNew`.

### S-05 — wallets but no tx this month

**Given** user has a USD wallet with balance 0.00 and no tx this month (or ever)
**When** the user opens `/dashboard`
**Then** BalanceCard shows "USD 0.00", Monthly cards show "0.00 USD" each, TopCats shows "Aún no hay gastos este mes".

### S-06 — month boundary

**Given** today is the 1st of the month at 00:01 local time
**When** the user opens `/dashboard`
**Then** the dashboard fetches `from = today 00:00:00.000` and `to = now`, including tx created in the past minute and excluding any tx from the previous month.

### S-07 — pagination drain

**Given** a wallet has 250 tx in this month and the API returns 100 per page
**When** the user opens `/dashboard`
**Then** the hook triggers 3 page fetches (drains the infinite query) before flipping `isLoading` to false, and aggregates all 250 tx.

### S-08 — home redirect

**Given** authenticated user
**When** the user navigates to `/`
**Then** the URL changes to `/dashboard` (history-replace, not pushed), and DashboardPage renders.

### S-09 — orphan categoryId

**Given** a transaction this month references a `categoryId` not present in `useCategories()` result nor in `PREDEFINED_CATEGORIES` (cache stale or race)
**When** the dashboard renders
**Then** TopCats does NOT crash; the offending row shows the first 8 chars of the UUID as the label.

### S-10 — preferred currency mismatch

**Given** preferred currency is EUR (legacy stale localStorage) but available wallets are only USD/PEN
**When** the dashboard loads
**Then** EUR is ignored and `displayCurrency` falls back to `availableCurrencies[0]` (USD).

### S-11 — refetch after add tx

**Given** user is on `/dashboard` with month data loaded
**When** the user opens "Agregar movimiento" CTA, submits a new expense, returns to dashboard
**Then** React Query's mutation invalidation refreshes the affected wallet's tx list and the new tx appears in the monthly aggregation without a manual reload.

### S-12 — error

**Given** the wallets endpoint returns 500
**When** the user opens `/dashboard`
**Then** the page renders `<ErrorState>` with a Retry button; clicking Retry calls the hook's `refetch`.

---

## Glossary

- **MTD (mes a la fecha)**: from the 1st of the current month at 00:00:00.000 local time to the current moment.
- **Display currency**: the single currency in which Monthly stats and TopCats numbers are shown. Independent of `usePreferredCurrency`'s storage; the hook reads it but the toggle overrides it for the session.
- **Available currencies**: distinct set of `wallet.currency` values across the user's wallets.
