# Dashboard mensual — Tasks

**Branch**: `feat/dashboard-monthly` (already on it)
**Delivery**: single PR, `size:exception` not needed (~550 LOC).
**Order**: linear; each task is autonomous. Apply phase runs them top-to-bottom.

## Slice 1 — primitives & routing (~80 LOC)

- [ ] **T-01** Create `packages/web/src/lib/decimal.ts` with `add`, `sub`, `abs`, `cmp`, `isZero`, `ratio`. BigInt cents internally. Throws on invalid input. (~45 LOC)
- [ ] **T-02** Add `dashboard: '/dashboard'` to `packages/web/src/app/routes.ts`. (~1 line)
- [ ] **T-03** Add `t.dashboard` section to `packages/web/src/lib/i18n.ts` with 11 keys (Spanish neutro). (~13 lines)

## Slice 2 — feature folder skeleton + aggregation (~85 LOC)

- [ ] **T-04** Create `packages/web/src/features/dashboard/lib/aggregation.ts` with pure functions: `monthBoundaries`, `sumBalancesByCurrency`, `splitIncomeExpense`, `topCategoriesByAmount`. Use `decimal.ts` for arithmetic. (~80 LOC)

## Slice 3 — data hook (~110 LOC)

- [ ] **T-05** Create `packages/web/src/features/dashboard/hooks/useMonthlyDashboard.ts`. Uses `useWallets()` + `useQueries` with cursor-draining `queryFn` per wallet. Memoized return matches the `MonthlyDashboard` interface from design.md §4. (~110 LOC)

## Slice 4 — components (~215 LOC)

- [ ] **T-06** Create `BalanceCard.tsx` (navy tone, totals grid + zero-wallets state with CTA). Destructure to avoid `t` shadowing. (~50 LOC)
- [ ] **T-07** Create `MonthlyStatsCard.tsx` (mint/coral/lime|pink tones, sign prefix on net). (~45 LOC)
- [ ] **T-08** Create `TopCategoriesCard.tsx` (resolves names via `useCategories` + `PREDEFINED_CATEGORIES`, static COLOR_DOT_CLASS map for Tailwind JIT, fallback to UUID slice on orphan). (~70 LOC)
- [ ] **T-09** Create `CurrencyToggle.tsx` (segmented buttons, only rendered by parent when needed). (~25 LOC)
- [ ] **T-10** Create `DashboardSkeleton.tsx` (matches `WalletsListSkeleton` aesthetic — `animate-pulse` blocks). (~25 LOC)

## Slice 5 — page wiring (~75 LOC)

- [ ] **T-11** Create `pages/DashboardPage.tsx`. Uses `usePreferredCurrency` + local override state. Two-call pattern with `useMonthlyDashboard` (probe → resolved) sharing cache. Skeleton, ErrorState, empty-wallets branch, "Agregar movimiento" CTA. (~75 LOC)

## Slice 6 — routing & nav (~10 LOC)

- [ ] **T-12** Update `app/AppRouter.tsx`: import `DashboardPage`, register `<Route path={routes.dashboard} element={<DashboardPage />} />`, change home `<Navigate>` target from `routes.wallets` to `routes.dashboard`. (~3 lines)
- [ ] **T-13** Update `components/layout/Sidebar.tsx`: import `LayoutGrid` from lucide-react; prepend Resumen item to `navItems`. (~2 lines)
- [ ] **T-14** Update `components/layout/BottomTabBar.tsx`: import `LayoutGrid`; prepend Resumen NavLink before the Wallets NavLink. Verify 5-element layout on 320px viewport via dev tools. (~5 lines)

## Slice 7 — verification (~0 LOC, manual)

- [ ] **T-15** Run `pnpm --filter @smart-wallet/web typecheck` from the repo root. Resolve any errors before continuing.
- [ ] **T-16** Run `pnpm --filter @smart-wallet/web build` to ensure the production bundle compiles (Tailwind JIT catches missing class tokens here).
- [ ] **T-17** Manual smoke (local `pnpm --filter @smart-wallet/web dev`):
  - Login → land on `/dashboard` (no flicker through `/wallets`).
  - Empty user (no wallets) shows the unified empty CTA.
  - Create 2 wallets in different currencies → BalanceCard splits into 2 tiles; CurrencyToggle appears.
  - Add an expense → returns to `/dashboard` → numbers update without manual reload.
  - Toggle currency → numbers re-aggregate.
  - Mobile breakpoint (~375px): BottomTabBar shows 5 items (Resumen, Billeteras, FAB, Categorías, Ajustes) without overlap.
  - Click "Resumen" in sidebar while on another page → routes correctly + highlights active.
- [ ] **T-18** Commit with conventional message: `feat(web): dashboard mensual con resumen del mes`. NO Co-Authored-By, NO AI attribution. Single commit unless slice boundary is meaningful.
- [ ] **T-19** Push branch and open PR with title `feat(web): dashboard mensual` and body describing the SDD link, scope, and smoke results.

## Review Workload Forecast

- **Estimated changed lines**: ~550
- **Chained PRs recommended**: No
- **400-line budget risk**: Medium (over 400 but well under the 800 hard limit)
- **Decision needed before apply**: No — single PR with `size:exception` if reviewer asks. Cached `delivery_strategy` is single-PR for tightly-coupled UI work.

## Done definition

All requirements (29 reqs / 12 scenarios in spec.md) covered by code or accepted as OUT in proposal.md §2.
Smoke walkthrough T-17 passes on all 7 sub-bullets.
Branch pushed, PR ready for user to merge.
