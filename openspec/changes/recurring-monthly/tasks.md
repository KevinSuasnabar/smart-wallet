# Recurring monthly — Tasks

**Branch**: `feat/recurring-monthly`
**Delivery**: single PR with `size:exception` (~1800 LOC, coupled backend + frontend).
**Order**: linear bottom-up — domain → repo → handlers → infra → shared-types → web.

## Slice 1 — Shared types (~90 LOC)

- [ ] **T-01** Create `packages/shared-types/src/schemas/recurring.ts` with `RecurringIdPathSchema`, `CreateRecurringRequestSchema`, `UpdateRecurringRequestSchema` (strict + refine), `RecurringResponseSchema`, `ListRecurringResponseSchema`, `MaterializeRecurringResponseSchema` and their inferred DTO types.
- [ ] **T-02** Re-export the new schemas + types from `packages/shared-types/src/index.ts`.

## Slice 2 — Domain entity (~250 LOC)

- [ ] **T-03** Create `packages/domain/src/recurring/RecurringTransactionId.ts` (UUID VO, mirror `TransactionId`).
- [ ] **T-04** Create `packages/domain/src/recurring/RecurringError.ts` with 10 error classes + union type.
- [ ] **T-05** Create `packages/domain/src/recurring/dateMath.ts` with `nextDayOfMonthOnOrAfter`, `addOneMonth`, `daysInMonth`, `effectiveDay` (all UTC).
- [ ] **T-06** Create `packages/domain/src/recurring/RecurringTransaction.ts` with `create`, `rehydrate`, `applyEdits`, `materializeOne`, `applyMaterializationOutcome`, getters. Mirror Transaction's structure.

## Slice 3 — Repository interface (~60 LOC)

- [ ] **T-07** Create `packages/domain/src/recurring/RecurringTransactionRepository.ts` with the interface from design.md §3.1 + input types.

## Slice 4 — Use cases (~300 LOC)

- [ ] **T-08** Create `packages/domain/src/recurring/usecases/CreateRecurring.ts` (validate wallet + category, construct, persist).
- [ ] **T-09** Create `packages/domain/src/recurring/usecases/ListRecurring.ts` (delegate to repo).
- [ ] **T-10** Create `packages/domain/src/recurring/usecases/GetRecurring.ts` (findById, 404 if null).
- [ ] **T-11** Create `packages/domain/src/recurring/usecases/UpdateRecurring.ts` (load, applyEdits, re-validate category if changed, persist).
- [ ] **T-12** Create `packages/domain/src/recurring/usecases/DeleteRecurring.ts` (404 guard, hardDelete).
- [ ] **T-13** Create `packages/domain/src/recurring/usecases/MaterializeRecurrings.ts` (loop algorithm with `e.name === 'RecurringRaceLost'` discriminator).
- [ ] **T-14** Re-export from `packages/domain/src/index.ts` (entity, errors, use case factories).

## Slice 5 — DDB repo (~400 LOC)

- [ ] **T-15** Update `packages/api/src/adapters/dynamodb/keyBuilders.ts`: add `recurringSK`, `recurringSKPrefix`, `recurringGsi1SK`, `recurringGsi1SKPrefix`.
- [ ] **T-16** Create `packages/api/src/adapters/dynamodb/mappers/RecurringMapper.ts` with `recurringToItem`, `itemToRecurring` (Result return).
- [ ] **T-17** Create `packages/api/src/adapters/dynamodb/repositories/DynamoDBRecurringTransactionRepository.ts` with all 7 methods, local `RecurringRaceLost` class (name discriminator), TransactWriteItems for `materializeOne` (3 ops), `listPending` using GSI1 `BETWEEN 'RECURNEXT#' AND :max`.
- [ ] **T-18** Re-export from `packages/api/src/adapters/dynamodb/index.ts`.

## Slice 6 — Handlers (~250 LOC)

- [ ] **T-19** Create `packages/api/src/handlers/recurring/createRecurring.ts`.
- [ ] **T-20** Create `packages/api/src/handlers/recurring/listRecurring.ts`.
- [ ] **T-21** Create `packages/api/src/handlers/recurring/getRecurring.ts`.
- [ ] **T-22** Create `packages/api/src/handlers/recurring/patchRecurring.ts`.
- [ ] **T-23** Create `packages/api/src/handlers/recurring/deleteRecurring.ts`.
- [ ] **T-24** Create `packages/api/src/handlers/recurring/materializeRecurrings.ts`.

## Slice 7 — Container + Infra (~60 LOC)

- [ ] **T-25** Wire the 6 use cases into `packages/api/src/composition/container.ts` with `recurringRepo` singleton.
- [ ] **T-26** Add 6 function entries to `packages/infra-sls/serverless.yml` (mirror existing transaction pattern). Verify exact path `/recurring/materialize` precedes greedy `/recurring/{recurringId}` per APIGW v2 spec (it does — exact > greedy).
- [ ] **T-27** Add the same 6 routes as re-export shims under `packages/infra-sls/src/handlers/recurring/` if the repo uses that pattern (verify by checking `packages/infra-sls/src/handlers/transaction/`).

## Slice 8 — Web data layer (~120 LOC)

- [ ] **T-28** Create `packages/web/src/features/recurring/recurringApi.ts` (6 functions).
- [ ] **T-29** Create `packages/web/src/features/recurring/queries.ts` (6 React Query hooks with invalidations).

## Slice 9 — Web routes + nav + i18n (~70 LOC)

- [ ] **T-30** Update `packages/web/src/app/routes.ts`: add `recurring`, `recurringNew`, `recurringEdit`.
- [ ] **T-31** Update `packages/web/src/lib/i18n.ts`: add `t.recurring` section with 19 keys (Spanish neutro).
- [ ] **T-32** Update `packages/web/src/components/layout/Sidebar.tsx`: add "Recurrentes" item with `Repeat` icon after Billeteras.
- [ ] **T-33** Update `packages/web/src/components/layout/BottomTabBar.tsx`: add a 5th NavLink (Recurrentes). Switch label visibility to `hidden sm:inline` on all 5 tabs to fit 320px viewport.

## Slice 10 — Web pages + components (~430 LOC)

- [ ] **T-34** Create `packages/web/src/features/recurring/components/RecurringForm.tsx` (mirror TransactionForm pattern; add dayOfMonth field with helper text; LOOSE_DECIMAL_REGEX form schema; normalize amount on submit).
- [ ] **T-35** Create `packages/web/src/features/recurring/components/RecurringListItem.tsx` (Card with type-colored sign, wallet + category meta, edit/delete buttons).
- [ ] **T-36** Create `packages/web/src/features/recurring/components/RecurringListSkeleton.tsx`.
- [ ] **T-37** Create `packages/web/src/features/recurring/components/EmptyRecurringState.tsx`.
- [ ] **T-38** Create `packages/web/src/features/recurring/components/DeleteRecurringDialog.tsx`.
- [ ] **T-39** Create `packages/web/src/features/recurring/pages/RecurringListPage.tsx` (PageHeader, list, empty/loading/error states, CTA to create).
- [ ] **T-40** Create `packages/web/src/features/recurring/pages/CreateRecurringPage.tsx`.
- [ ] **T-41** Create `packages/web/src/features/recurring/pages/EditRecurringPage.tsx` with diff-and-PATCH + noChanges toast.
- [ ] **T-42** Update `packages/web/src/app/AppRouter.tsx`: register the 3 new routes.

## Slice 11 — Dashboard auto-materialize (~20 LOC)

- [ ] **T-43** Update `packages/web/src/features/dashboard/pages/DashboardPage.tsx`: add `useMaterializeRecurrings()` + `useRef` guard + `useEffect` fire-and-forget (silent onError to console).

## Slice 12 — Verification (~0 LOC, manual)

- [ ] **T-44** `pnpm --filter @smart-wallet/domain typecheck`
- [ ] **T-45** `pnpm --filter @smart-wallet/shared-types typecheck`
- [ ] **T-46** `pnpm --filter @smart-wallet/api typecheck`
- [ ] **T-47** `pnpm --filter @smart-wallet/web typecheck`
- [ ] **T-48** `pnpm --filter @smart-wallet/web build` (Tailwind JIT catches missing tokens).
- [ ] **T-49** `pnpm --filter @smart-wallet/infra-sls build` if such target exists, else just `serverless print --stage prod` smoke check.
- [ ] **T-50** Single commit `feat(api,web): movimientos recurrentes mensuales con materialización on-demand`. NO Co-Authored-By, NO AI attribution.
- [ ] **T-51** Push and prepare PR body (user opens PR via the URL; `gh` is not installed locally).

## Review Workload Forecast

- **Estimated changed lines**: ~1800
- **Chained PRs recommended**: Yes (if reviewer asks). Default plan: single PR.
- **400-line budget risk**: High. Apply `size:exception` per cached delivery strategy.
- **Decision needed before apply**: No — proceed with single PR + `size:exception`.

## Done definition

All 65 spec requirements + 18 scenarios covered by code, OR explicitly listed as OUT in proposal §2.
Typecheck + build pass across all packages.
Branch pushed; PR body ready for user.
