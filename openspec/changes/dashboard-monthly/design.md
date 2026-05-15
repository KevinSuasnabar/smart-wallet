# Dashboard mensual — Design

## 1. File tree

```
packages/web/src/
├── app/
│   ├── routes.ts                          # MODIFY: add `dashboard: '/dashboard'`
│   └── AppRouter.tsx                      # MODIFY: register /dashboard, redirect /
├── components/layout/
│   ├── Sidebar.tsx                        # MODIFY: prepend Resumen item
│   └── BottomTabBar.tsx                   # MODIFY: prepend Resumen tab
├── lib/
│   ├── decimal.ts                         # NEW: add/sub/abs/cmp on signed decimal strings (BigInt cents internally)
│   └── i18n.ts                            # MODIFY: add t.dashboard section
└── features/dashboard/                    # NEW feature folder
    ├── pages/
    │   └── DashboardPage.tsx              # NEW: composes the page
    ├── hooks/
    │   └── useMonthlyDashboard.ts         # NEW: orchestrates queries, drains pages, aggregates
    ├── lib/
    │   └── aggregation.ts                 # NEW: pure functions monthBoundaries, sumByCurrency, splitIncomeExpense, topCategoriesByAmount
    └── components/
        ├── BalanceCard.tsx                # NEW
        ├── MonthlyStatsCard.tsx           # NEW
        ├── TopCategoriesCard.tsx          # NEW
        ├── CurrencyToggle.tsx             # NEW (only renders when >1 currency)
        └── DashboardSkeleton.tsx          # NEW
```

## 2. `lib/decimal.ts`

Tiny utility operating on signed decimal strings with 2 decimal places. Internally uses `BigInt` cents to avoid float drift.

```ts
// All inputs/outputs are signed decimal strings, e.g. "100.00", "-50.25", "0.00".
// Trailing zeros normalized to 2 decimals. NaN/invalid → throws.

const toCents = (s: string): bigint => {
  // Accept "100", "100.5", "100.50", "-100.50". Reject anything else.
  const m = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(s);
  if (m === null) throw new Error(`Invalid decimal string: ${s}`);
  const [, sign, intPart = '0', decPart = ''] = m;
  const decPadded = decPart.padEnd(2, '0');
  const magnitude = BigInt(intPart) * 100n + BigInt(decPadded);
  return sign === '-' ? -magnitude : magnitude;
};

const fromCents = (c: bigint): string => {
  const sign = c < 0n ? '-' : '';
  const abs = c < 0n ? -c : c;
  const intPart = abs / 100n;
  const decPart = abs % 100n;
  return `${sign}${intPart.toString()}.${decPart.toString().padStart(2, '0')}`;
};

export const add = (a: string, b: string): string => fromCents(toCents(a) + toCents(b));
export const sub = (a: string, b: string): string => fromCents(toCents(a) - toCents(b));
export const abs = (a: string): string => fromCents(toCents(a) < 0n ? -toCents(a) : toCents(a));
export const cmp = (a: string, b: string): number => {
  const ca = toCents(a), cb = toCents(b);
  return ca < cb ? -1 : ca > cb ? 1 : 0;
};
export const isZero = (a: string): boolean => toCents(a) === 0n;
export const ratio = (a: string, b: string): number => {
  // For top-cat share. Returns 0 if b is zero.
  const cb = toCents(b);
  if (cb === 0n) return 0;
  return Number(toCents(a)) / Number(cb);
};
```

Why BigInt: amounts up to ~21 trillion cents fit comfortably; no precision drift on add/sub.

## 3. `features/dashboard/lib/aggregation.ts`

Pure functions. No React, no fetch.

```ts
import type { Currency, TransactionResponseDTO, WalletResponseDTO } from '@smart-wallet/shared-types';
import { add, abs, cmp, ratio } from '../../../lib/decimal.js';

export interface MonthRange { from: string; to: string; }

export const monthBoundaries = (now: Date): MonthRange => {
  const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
  return { from: firstOfMonth.toISOString(), to: now.toISOString() };
};

export const sumBalancesByCurrency = (
  wallets: WalletResponseDTO[],
): Array<{ currency: Currency; balance: string }> => {
  const map = new Map<Currency, string>();
  for (const w of wallets) {
    const prev = map.get(w.currency) ?? '0.00';
    map.set(w.currency, add(prev, w.balance));
  }
  return Array.from(map.entries())
    .map(([currency, balance]) => ({ currency, balance }))
    .sort((a, b) => a.currency.localeCompare(b.currency));
};

export interface MonthlyStats {
  income: string;
  expenses: string;
  net: string;
}

export const splitIncomeExpense = (txs: TransactionResponseDTO[]): MonthlyStats => {
  let income = '0.00';
  let expenses = '0.00';
  for (const tx of txs) {
    if (tx.type === 'income') income = add(income, tx.amount);
    else expenses = add(expenses, tx.amount);
  }
  // net = income - expenses (computed by caller via sub, kept here for clarity)
  return { income, expenses, net: '0.00' /* caller fills via sub() */ };
};

export interface CategoryAggregate {
  categoryId: string;
  amount: string;
  share: number;
}

export const topCategoriesByAmount = (
  expenseTxs: TransactionResponseDTO[],
  topN = 3,
): CategoryAggregate[] => {
  const sums = new Map<string, string>();
  for (const tx of expenseTxs) {
    const prev = sums.get(tx.categoryId) ?? '0.00';
    sums.set(tx.categoryId, add(prev, tx.amount));
  }
  const total = Array.from(sums.values()).reduce((acc, v) => add(acc, v), '0.00');
  const arr = Array.from(sums.entries()).map(([categoryId, amount]) => ({
    categoryId,
    amount,
    share: ratio(amount, total),
  }));
  arr.sort((a, b) => {
    const c = cmp(b.amount, a.amount);
    return c !== 0 ? c : a.categoryId.localeCompare(b.categoryId);
  });
  return arr.slice(0, topN);
};
```

## 4. `features/dashboard/hooks/useMonthlyDashboard.ts`

Orchestrator. Two parts:
1. Top-level: `useWallets()` to know which wallets exist
2. For each wallet, an `useWalletTransactions(walletId, { from, to })` (infinite query) — paged
3. An effect that calls `fetchNextPage()` while `hasNextPage` is true on each infinite query
4. Once **all** queries are settled and drained, build the aggregate

Implementation outline:

```ts
import { useEffect, useMemo } from 'react';
import { useQueries } from '@tanstack/react-query';
import type { Currency, TransactionResponseDTO } from '@smart-wallet/shared-types';
import { useWallets } from '../../wallets/queries.js';
import { transactionKeys } from '../../transactions/queries.js';
import { transactionsApi } from '../../transactions/transactionsApi.js';
import {
  monthBoundaries,
  sumBalancesByCurrency,
  splitIncomeExpense,
  topCategoriesByAmount,
  type CategoryAggregate,
} from '../lib/aggregation.js';
import { sub } from '../../../lib/decimal.js';

export interface MonthlyDashboard {
  totalsByCurrency: ReturnType<typeof sumBalancesByCurrency>;
  monthlyIncome: string;
  monthlyExpenses: string;
  monthlyNet: string;
  topCategories: CategoryAggregate[];
  availableCurrencies: Currency[];
  isLoading: boolean;
  isError: boolean;
  refetch: () => Promise<void>;
}

export const useMonthlyDashboard = (
  displayCurrency: Currency | null,
): MonthlyDashboard => {
  const wallets = useWallets();
  const range = useMemo(() => monthBoundaries(new Date()), []);

  // Drain-by-default: pre-fetch all pages of each wallet's tx list, no infinite.
  // We swap useInfiniteQuery for a plain useQueries with a queryFn that loops
  // pages internally — keeps the hook predictable (one settled state) and
  // shares the cache by including filters in the queryKey.
  const items = wallets.data?.items ?? [];
  const txQueries = useQueries({
    queries: items.map((w) => ({
      queryKey: [...transactionKeys.byWalletFiltered(w.walletId, range), 'drain'],
      queryFn: async (): Promise<TransactionResponseDTO[]> => {
        const out: TransactionResponseDTO[] = [];
        let cursor: string | undefined = undefined;
        // Drain loop — terminates when nextCursor is null/undefined.
        do {
          const page = await transactionsApi.byWallet(w.walletId, {
            ...range,
            ...(cursor !== undefined ? { cursor } : {}),
          });
          out.push(...page.items);
          cursor = page.nextCursor ?? undefined;
        } while (cursor !== undefined);
        return out;
      },
      enabled: w.walletId !== '',
      staleTime: 30_000,
    })),
  });

  return useMemo(() => {
    const totalsByCurrency = sumBalancesByCurrency(items);
    const availableCurrencies = totalsByCurrency.map((t) => t.currency);

    const isLoading = wallets.isLoading || txQueries.some((q) => q.isLoading);
    const isError = wallets.isError || txQueries.some((q) => q.isError);

    if (isLoading || isError || displayCurrency === null) {
      return {
        totalsByCurrency,
        monthlyIncome: '0.00',
        monthlyExpenses: '0.00',
        monthlyNet: '0.00',
        topCategories: [],
        availableCurrencies,
        isLoading,
        isError,
        refetch: async () => { await wallets.refetch(); await Promise.all(txQueries.map((q) => q.refetch())); },
      };
    }

    // Flatten tx of wallets in displayCurrency.
    const txOfCurrency: TransactionResponseDTO[] = [];
    items.forEach((w, i) => {
      if (w.currency !== displayCurrency) return;
      const data = txQueries[i]?.data;
      if (data !== undefined) txOfCurrency.push(...data);
    });

    const stats = splitIncomeExpense(txOfCurrency);
    const monthlyNet = sub(stats.income, stats.expenses);
    const topCats = topCategoriesByAmount(
      txOfCurrency.filter((t) => t.type === 'expense'),
      3,
    );

    return {
      totalsByCurrency,
      monthlyIncome: stats.income,
      monthlyExpenses: stats.expenses,
      monthlyNet,
      topCategories: topCats,
      availableCurrencies,
      isLoading: false,
      isError: false,
      refetch: async () => { await wallets.refetch(); await Promise.all(txQueries.map((q) => q.refetch())); },
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wallets.data, wallets.isLoading, wallets.isError, txQueries.map((q) => q.dataUpdatedAt).join(','), displayCurrency]);
};
```

**Tradeoff vs. spec DATA-03**: instead of using `useInfiniteQuery` and external drain, the hook uses `useQueries` with an internal cursor loop. This is simpler, keeps a single loading state per wallet, and avoids effect-driven `fetchNextPage` calls. The spec's intent ("drain before aggregating") is satisfied.

## 5. `pages/DashboardPage.tsx`

Compositional shell. No business logic.

```tsx
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { Button } from '../../../components/ui/button.js';
import { PageHeader } from '../../../components/common/PageHeader.js';
import { ErrorState } from '../../../components/common/ErrorState.js';
import { BalanceCard } from '../components/BalanceCard.js';
import { MonthlyStatsCard } from '../components/MonthlyStatsCard.js';
import { TopCategoriesCard } from '../components/TopCategoriesCard.js';
import { CurrencyToggle } from '../components/CurrencyToggle.js';
import { DashboardSkeleton } from '../components/DashboardSkeleton.js';
import { useMonthlyDashboard } from '../hooks/useMonthlyDashboard.js';
import { usePreferredCurrency } from '../../settings/usePreferredCurrency.js';
import { routes } from '../../../app/routes.js';
import { t } from '../../../lib/i18n.js';
import type { Currency } from '@smart-wallet/shared-types';

const resolveInitialCurrency = (
  preferred: Currency | null,
  available: Currency[],
): Currency | null => {
  if (preferred !== null && available.includes(preferred)) return preferred;
  if (available.length > 0) return available[0] ?? null;
  return null;
};

export const DashboardPage = () => {
  const { currency: preferred } = usePreferredCurrency();
  // displayCurrency starts null; set once wallets resolve.
  const [override, setOverride] = useState<Currency | null>(null);

  // First-pass call with `null` to read available currencies, then re-resolve.
  // We resolve displayCurrency inline from the hook's `availableCurrencies`.
  const probe = useMonthlyDashboard(null);
  const displayCurrency =
    override ?? resolveInitialCurrency(preferred, probe.availableCurrencies);
  const dash = useMonthlyDashboard(displayCurrency);

  if (dash.isLoading) return (
    <div className="flex flex-col pb-4">
      <PageHeader eyebrow={t.dashboard.eyebrow} title={t.dashboard.title} />
      <DashboardSkeleton />
    </div>
  );

  if (dash.isError) return (
    <div className="flex flex-col pb-4">
      <PageHeader eyebrow={t.dashboard.eyebrow} title={t.dashboard.title} />
      <ErrorState message={t.errors.generic} onRetry={() => { void dash.refetch(); }} />
    </div>
  );

  const hasWallets = dash.totalsByCurrency.length > 0;

  return (
    <div className="flex flex-col gap-5 pb-4">
      <PageHeader eyebrow={t.dashboard.eyebrow} title={t.dashboard.title} />
      <BalanceCard totals={dash.totalsByCurrency} />
      {hasWallets && dash.availableCurrencies.length > 1 && displayCurrency !== null && (
        <CurrencyToggle
          available={dash.availableCurrencies}
          value={displayCurrency}
          onChange={setOverride}
        />
      )}
      {hasWallets && displayCurrency !== null && (
        <>
          <MonthlyStatsCard
            currency={displayCurrency}
            income={dash.monthlyIncome}
            expenses={dash.monthlyExpenses}
            net={dash.monthlyNet}
          />
          <TopCategoriesCard
            currency={displayCurrency}
            items={dash.topCategories}
          />
        </>
      )}
      {hasWallets && (
        <Button asChild variant="promo" className="w-full gap-2">
          <Link to={routes.transactionsNew}>
            <Plus className="size-4" />
            {t.dashboard.addTransactionCta}
          </Link>
        </Button>
      )}
    </div>
  );
};
```

**Note**: `probe` call with `null` displayCurrency is a small inefficiency (extra render) but it's the cleanest way to avoid a chicken-and-egg with `availableCurrencies`. Both calls share the React Query cache, so there is no extra network. If profiling shows it's a problem later, refactor `useMonthlyDashboard` to expose `availableCurrencies` independently from the aggregation step.

## 6. `components/BalanceCard.tsx`

```tsx
import { Link } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { ColorBlock } from '../../../components/common/ColorBlock.js';
import { Eyebrow } from '../../../components/common/Eyebrow.js';
import { Button } from '../../../components/ui/button.js';
import { formatCurrency } from '../../../lib/currency.js';
import { routes } from '../../../app/routes.js';
import { t } from '../../../lib/i18n.js';
import type { Currency } from '@smart-wallet/shared-types';

interface BalanceCardProps {
  totals: Array<{ currency: Currency; balance: string }>;
}

export const BalanceCard = ({ totals }: BalanceCardProps) => {
  if (totals.length === 0) {
    return (
      <ColorBlock tone="cream" className="flex flex-col items-start gap-3 p-6">
        <Eyebrow>{t.dashboard.totalBalance}</Eyebrow>
        <p className="text-base text-foreground/70">{t.dashboard.noWallets}</p>
        <Button asChild size="sm" className="gap-1">
          <Link to={routes.walletsNew}>
            <Plus className="size-4" />
            {t.wallets.createCta}
          </Link>
        </Button>
      </ColorBlock>
    );
  }
  return (
    <ColorBlock tone="navy" className="p-6">
      <Eyebrow className="text-background/60">{t.dashboard.totalBalance}</Eyebrow>
      <div className={`mt-3 grid gap-4 ${totals.length === 1 ? 'grid-cols-1' : 'grid-cols-2'}`}>
        {totals.map((t) => (
          <div key={t.currency} className="flex flex-col gap-1">
            <span className="font-mono text-[11px] uppercase tracking-caption text-background/60">
              {t.currency}
            </span>
            <span className="text-3xl font-bold leading-none tracking-display text-background md:text-4xl">
              {formatCurrency(t.balance, t.currency)}
            </span>
          </div>
        ))}
      </div>
    </ColorBlock>
  );
};
```

Note: the inner `t` shadows the i18n import. Rename to `total` or destructure: `{ currency, balance }` → cleaner. (Apply phase will use destructure.)

## 7. `components/MonthlyStatsCard.tsx`

Triple-card row.

```tsx
interface MonthlyStatsCardProps {
  currency: Currency;
  income: string;
  expenses: string;
  net: string;
}

export const MonthlyStatsCard = ({ currency, income, expenses, net }: MonthlyStatsCardProps) => {
  const netSign = net.startsWith('-') ? '−' : '+';
  const netAbs = net.replace(/^-/, '');
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
      <ColorBlock tone="mint" className="p-5">
        <Eyebrow>{t.dashboard.monthlyIncome}</Eyebrow>
        <p className="mt-2 text-2xl font-bold leading-none tracking-display">
          {formatCurrency(income, currency)}
        </p>
      </ColorBlock>
      <ColorBlock tone="coral" className="p-5">
        <Eyebrow>{t.dashboard.monthlyExpenses}</Eyebrow>
        <p className="mt-2 text-2xl font-bold leading-none tracking-display">
          {formatCurrency(expenses, currency)}
        </p>
      </ColorBlock>
      <ColorBlock tone={netSign === '+' ? 'lime' : 'pink'} className="p-5">
        <Eyebrow>{t.dashboard.monthlyNet}</Eyebrow>
        <p className="mt-2 text-2xl font-bold leading-none tracking-display">
          {netSign}{formatCurrency(netAbs, currency)}
        </p>
      </ColorBlock>
    </div>
  );
};
```

## 8. `components/TopCategoriesCard.tsx`

```tsx
import { PREDEFINED_CATEGORIES, type WalletColor } from '@smart-wallet/shared-types';
import { useCategories } from '../../categories/queries.js';

const COLOR_DOT_CLASS: Record<WalletColor, string> = {
  lime: 'bg-block-lime',
  lilac: 'bg-block-lilac',
  cream: 'bg-block-cream',
  pink: 'bg-block-pink',
  mint: 'bg-block-mint',
  coral: 'bg-block-coral',
  navy: 'bg-foreground',
};

interface TopCategoriesCardProps {
  currency: Currency;
  items: CategoryAggregate[];
}

export const TopCategoriesCard = ({ currency, items }: TopCategoriesCardProps) => {
  const { data: categoriesData } = useCategories();
  const customById = new Map(categoriesData?.items.map((c) => [c.categoryId, c]) ?? []);
  const predefinedById = new Map(PREDEFINED_CATEGORIES.map((c) => [c.categoryId as string, c]));

  const resolve = (categoryId: string): { name: string; color: WalletColor } => {
    const custom = customById.get(categoryId);
    if (custom !== undefined) return { name: custom.name, color: custom.color };
    const predef = predefinedById.get(categoryId);
    if (predef !== undefined) return { name: predef.name, color: predef.color };
    return { name: categoryId.slice(0, 8), color: 'navy' };
  };

  return (
    <ColorBlock tone="cream" className="p-6">
      <Eyebrow>{t.dashboard.topExpenses}</Eyebrow>
      {items.length === 0 ? (
        <p className="mt-3 text-sm text-foreground/70">{t.dashboard.noExpensesYet}</p>
      ) : (
        <ul className="mt-4 flex flex-col gap-3">
          {items.map((it) => {
            const meta = resolve(it.categoryId);
            return (
              <li key={it.categoryId} className="flex items-center gap-3">
                <span className={`inline-block size-3 rounded-full ${COLOR_DOT_CLASS[meta.color]}`} />
                <span className="flex-1 truncate text-[15px]">{meta.name}</span>
                <span className="font-mono text-xs text-foreground/60">
                  {Math.round(it.share * 100)}%
                </span>
                <span className="text-[15px] font-semibold">
                  {formatCurrency(it.amount, currency)}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </ColorBlock>
  );
};
```

## 9. `components/CurrencyToggle.tsx`

Simple segmented control.

```tsx
interface CurrencyToggleProps {
  available: Currency[];
  value: Currency;
  onChange: (next: Currency) => void;
}

export const CurrencyToggle = ({ available, value, onChange }: CurrencyToggleProps) => (
  <div className="flex gap-1 rounded-full border border-input p-1 self-start">
    {available.map((c) => (
      <button
        key={c}
        type="button"
        onClick={() => onChange(c)}
        className={`rounded-full px-3 py-1.5 font-mono text-xs uppercase tracking-caption transition-colors ${
          c === value ? 'bg-foreground text-background' : 'text-foreground/60 hover:text-foreground'
        }`}
        aria-pressed={c === value}
      >
        {c}
      </button>
    ))}
  </div>
);
```

## 10. `components/DashboardSkeleton.tsx`

Match existing skeleton aesthetics (use `animate-pulse` + `bg-muted/40`).

## 11. `routes.ts` change

```diff
- home: '/',
+ home: '/',
+ dashboard: '/dashboard',
```

## 12. `AppRouter.tsx` change

```diff
- <Route path={routes.home} element={<Navigate to={routes.wallets} replace />} />
+ <Route path={routes.home} element={<Navigate to={routes.dashboard} replace />} />
+ <Route path={routes.dashboard} element={<DashboardPage />} />
```

## 13. `Sidebar.tsx` change

```diff
+ import { LayoutGrid, Wallet, Tag, Settings, Plus, LogOut } from 'lucide-react';
- import { Wallet, Tag, Settings, Plus, LogOut } from 'lucide-react';

  const navItems = [
+   { to: routes.dashboard, icon: LayoutGrid, label: 'Resumen' },
    { to: routes.wallets, icon: Wallet, label: 'Billeteras' },
    { to: routes.categories, icon: Tag, label: 'Categorías' },
    { to: routes.settings, icon: Settings, label: 'Ajustes' },
  ] as const;
```

## 14. `BottomTabBar.tsx` change

Tradeoff: 4 tabs + central FAB = 5 elements crowded on small screens. The center FAB is fixed; flank with 2 left (Resumen, Billeteras) and 2 right (Categorías, Ajustes). Width still works on 320px (each ~64px).

```diff
- <NavLink to={routes.wallets} className={tabClass}>
-   <Wallet className="size-5" />
-   <span>Billeteras</span>
- </NavLink>
+ <NavLink to={routes.dashboard} className={tabClass}>
+   <LayoutGrid className="size-5" />
+   <span>Resumen</span>
+ </NavLink>
+ <NavLink to={routes.wallets} className={tabClass}>
+   <Wallet className="size-5" />
+   <span>Billeteras</span>
+ </NavLink>
```

If 4 tabs + FAB is too tight visually, demote Categories label or use icon-only. **Decision**: keep all labels, JIT verifies. If overflow, fall back to icon-only on `<sm` breakpoint.

## 15. i18n addition

```ts
// inside t object
dashboard: {
  title: 'Resumen',
  eyebrow: 'Este mes',
  totalBalance: 'Balance total',
  monthlyIncome: 'Ingresos del mes',
  monthlyExpenses: 'Gastos del mes',
  monthlyNet: 'Balance del mes',
  topExpenses: 'Top categorías',
  noExpensesYet: 'Aún no hay gastos este mes',
  noWallets: 'Crea tu primera billetera para ver tu resumen',
  addTransactionCta: 'Agregar movimiento',
  sidebarLabel: 'Resumen',
},
```

## 16. Cross-cutting decisions

- **No tests this PR** — consistent with the rest of the web package today; smoke is manual.
- **No new dependencies** — `decimal.ts` is hand-rolled (BigInt cents).
- **React Query cache key** — the drain query uses a different key suffix (`'drain'`) than the existing infinite query for the same wallet+filters, by design. They don't share entries; that's fine because the infinite is used in `TransactionListPage`, the drain only in the dashboard, and each has a different shape (`pages[]` vs `items[]`).
- **WalletColor import in dashboard** — comes from `@smart-wallet/shared-types`. The web package already depends on `shared-types`; no domain re-export needed.

## 17. Risks revisited

| Risk | Mitigation |
|---|---|
| Probe call with `null` displayCurrency does extra render | Acceptable; React Query cache makes the network cost zero. Profile later if needed. |
| Wallet with hundreds of tx in one month | Drain loop pages through; acceptable for MVP volume. Server-side endpoint is the long-term fix. |
| Stale tx referencing deleted custom category | TopCategoriesCard renders `categoryId.slice(0,8)` fallback — no crash. |
| BigInt arithmetic edge cases | Restricted to `^-?\d+(\.\d{1,2})?$` regex; anything outside throws explicitly. Backend amounts are guaranteed to match this shape (validated by Zod schemas). |
| `Currency` toggle resets on remount | Acceptable for MVP. If users complain, persist via `usePreferredCurrency` write. |

## 18. LOC estimate (refined)

| File | LOC |
|---|---|
| `lib/decimal.ts` | ~45 |
| `features/dashboard/lib/aggregation.ts` | ~80 |
| `features/dashboard/hooks/useMonthlyDashboard.ts` | ~110 |
| `features/dashboard/pages/DashboardPage.tsx` | ~75 |
| `features/dashboard/components/BalanceCard.tsx` | ~50 |
| `features/dashboard/components/MonthlyStatsCard.tsx` | ~45 |
| `features/dashboard/components/TopCategoriesCard.tsx` | ~70 |
| `features/dashboard/components/CurrencyToggle.tsx` | ~25 |
| `features/dashboard/components/DashboardSkeleton.tsx` | ~25 |
| `app/routes.ts` | +1 |
| `app/AppRouter.tsx` | +2 |
| `components/layout/Sidebar.tsx` | +2 |
| `components/layout/BottomTabBar.tsx` | +5 |
| `lib/i18n.ts` | +13 |
| **Total** | **~548** |

Well under 800 budget. Single PR, no chaining.
