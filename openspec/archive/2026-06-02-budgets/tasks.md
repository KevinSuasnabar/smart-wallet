# Tasks: Monthly Budgets

## Review Workload Forecast

| Field                   | Value                                      |
| ----------------------- | ------------------------------------------ |
| Estimated changed lines | ~900–1100 (35+ files)                      |
| 400-line budget risk    | High                                       |
| Chained PRs recommended | Yes                                        |
| Suggested split         | PR1 (domain) → PR2 (api+infra) → PR3 (web) |
| Delivery strategy       | auto-chain                                 |
| Chain strategy          | feature-branch-chain                       |

Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: feature-branch-chain
400-line budget risk: High

### Suggested Work Units

| Unit | Goal                                                                               | Likely PR                 | Notes                                                    |
| ---- | ---------------------------------------------------------------------------------- | ------------------------- | -------------------------------------------------------- |
| 1    | Domain layer (Budget aggregate + use cases + TransactionRepository port extension) | PR1 `feat/budgets-domain` | Base: `main`. Standalone, no runtime deps                |
| 2    | API adapter + handlers + infra-sls + shared-types                                  | PR2 `feat/budgets-api`    | Base: `feat/budgets-domain`. Depends on PR1 domain types |
| 3    | Web frontend (pages, components, routing, i18n)                                    | PR3 `feat/budgets-web`    | Base: `feat/budgets-api`. Depends on PR2 API contract    |

---

## PR1 — Domain Layer (`feat/budgets-domain`)

### Phase 1: Value Objects & Errors

- [ ] 1.1 Create `packages/domain/src/budget/BudgetId.ts` — UUID value object; mirror `WalletId` pattern
- [ ] 1.2 Create `packages/domain/src/budget/BudgetError.ts` — `BudgetNotFoundError`, `BudgetValidationError`, `BudgetImmutableFieldError` extending `DomainError`

### Phase 2: Aggregate & Repository Port

- [ ] 2.1 Create `packages/domain/src/budget/Budget.ts` — fields: `id`, `userId`, `type`, `categoryId?`, `limitCents`, `currency`, `rollover`, `createdAt`, `updatedAt`
- [ ] 2.2 Implement `Budget.create(input): Result<Budget, BudgetValidationError>` — validate: `limitCents > 0` integer; `currency` in `['PEN','USD']`; `type` in `['per_category','global']`; `per_category` requires `categoryId`; `global` forbids `categoryId`
- [ ] 2.3 Implement `Budget.rehydrate(raw): Budget` — no validation, for persistence reconstitution
- [ ] 2.4 Create `packages/domain/src/budget/BudgetRepository.ts` — port interface with: `save(budget)`, `findById(userId, budgetId)`, `listByUser(userId)`, `delete(userId, budgetId)`
- [ ] 2.5 Add `sumExpensesByPeriod(userId, { from, to, currency, categoryId? }): Promise<number>` to `packages/domain/src/transaction/TransactionRepository.ts`

### Phase 3: Use Cases

- [ ] 3.1 Create `packages/domain/src/budget/usecases/CreateBudget.ts` — `makeCreateBudget({ budgetRepo })(input): Promise<Result<Budget, BudgetValidationError>>`; calls `Budget.create()` then `budgetRepo.save()`
- [ ] 3.2 Create `packages/domain/src/budget/usecases/ListBudgets.ts` — deps: `{ budgetRepo, transactionRepo, clock }`; calls `budgetRepo.listByUser`; `Promise.all` over budgets calling `sumExpensesByPeriod` for current month (and previous month when `rollover=true`); computes `effectiveLimitCents = rollover ? limit + max(0, prevLimit - prevSpent) : limit`; returns `Array<{ budget, spentCents, effectiveLimitCents }>`
- [ ] 3.3 Create `packages/domain/src/budget/usecases/UpdateBudget.ts` — `makeUpdateBudget({ budgetRepo })(input)`; only `limitCents` and `rollover` are patchable; reject `type`, `categoryId`, `currency` with `BudgetImmutableFieldError`; 404 if not found
- [ ] 3.4 Create `packages/domain/src/budget/usecases/DeleteBudget.ts` — `makeDeleteBudget({ budgetRepo })(input)`; 404 if not found; calls `budgetRepo.delete()`

### Phase 4: Barrel Exports

- [ ] 4.1 Create `packages/domain/src/budget/index.ts` — export all budget types, errors, repository interface, and use-case factories
- [ ] 4.2 Add `export * from './budget/index.js'` to `packages/domain/src/index.ts`

---

## PR2 — API Adapter + Handlers + Infra-SLS + Shared Types (`feat/budgets-api`)

### Phase 5: Shared Types

- [ ] 5.1 Create `packages/shared-types/src/schemas/budget.ts` — Zod schemas: `CreateBudgetBodySchema`, `UpdateBudgetBodySchema` (only `limitCents`, `rollover`), `BudgetPathSchema` (`budgetId`)
- [ ] 5.2 Export budget schemas from `packages/shared-types/src/index.ts`

### Phase 6: DynamoDB Key Builders & Mapper

- [ ] 6.1 Add `budgetSK(id: string): string` and `budgetSKPrefix(): string` to `packages/api/src/adapters/dynamodb/keyBuilders.ts`
- [ ] 6.2 Create `packages/api/src/adapters/dynamodb/mappers/BudgetMapper.ts` — `toItem(budget): DDBItem` and `fromItem(item): Budget`; calls `Budget.rehydrate()`, never `Budget.create()`

### Phase 7: DynamoDB Repository Implementations

- [ ] 7.1 Create `packages/api/src/adapters/dynamodb/repositories/DynamoDBBudgetRepository.ts` — `PK=USER#<userId>` / `SK=BUDGET#<budgetId>`; list via `begins_with(SK, 'BUDGET#')`; implements `BudgetRepository` port; uses `ddb`, `TABLE_NAME` from `DynamoDBClient.ts`
- [ ] 7.2 Implement `sumExpensesByPeriod` in `packages/api/src/adapters/dynamodb/repositories/DynamoDBTransactionRepository.ts`:
  - per-category: GSI1 BETWEEN `CAT#<c>#<fromIso>` AND `CAT#<c>#<toIso>~` + FilterExpression on `type=expense` and `currency`
  - global: PK partition scan with `begins_with(SK,'TXN#')` + FilterExpression on `occurredAt BETWEEN`, `type=expense`, `currency`
  - BOTH paths MUST drain all pages via `LastEvaluatedKey` loop — partial pages give wrong totals

### Phase 8: API Handlers

- [ ] 8.1 Create `packages/api/src/handlers/budget/createBudget.ts` — `export const main = withErrorHandler(withAuth(handler))`; validate body with `CreateBudgetBodySchema`; call `container.createBudget`; return 201 with budget DTO
- [ ] 8.2 Create `packages/api/src/handlers/budget/listBudgets.ts` — call `container.listBudgets(userId)`; map each item to HTTP DTO using `formatCentsForResponse`; return 200
- [ ] 8.3 Create `packages/api/src/handlers/budget/updateBudget.ts` — validate path with `BudgetPathSchema` + body with `UpdateBudgetBodySchema`; call `container.updateBudget`; `domainErrorToResponse` for 400/404; return 200
- [ ] 8.4 Create `packages/api/src/handlers/budget/deleteBudget.ts` — validate path with `BudgetPathSchema`; call `container.deleteBudget`; 404 on not found; return 204

### Phase 9: Container Wiring & Barrel Exports

- [ ] 9.1 Wire `budgetRepo` (DynamoDBBudgetRepository) + `createBudget`, `listBudgets`, `updateBudget`, `deleteBudget` use-case instances in `packages/api/src/composition/container.ts`
- [ ] 9.2 Export `BudgetMapper` and `DynamoDBBudgetRepository` from `packages/api/src/adapters/dynamodb/index.ts`

### Phase 10: Infra-SLS Proxies & Serverless Config

- [ ] 10.1 Create one-line re-exports in `packages/infra-sls/src/handlers/budget/`: `createBudget.ts`, `listBudgets.ts`, `updateBudget.ts`, `deleteBudget.ts` — each re-exports `main` from corresponding `api` handler
- [ ] 10.2 Add 4 budget routes to `packages/infra-sls/serverless.yml`: `POST /budgets`, `GET /budgets`, `PATCH /budgets/{budgetId}`, `DELETE /budgets/{budgetId}`; each points to the matching infra-sls proxy handler

---

## PR3 — Web Frontend (`feat/budgets-web`)

### Phase 11: API Client & React Query

- [ ] 11.1 Create `packages/web/src/features/budgets/queries.ts` — React Query hooks: `useListBudgets()`, `useCreateBudget()`, `useUpdateBudget()`, `useDeleteBudget()`; uses `budgetsApi` for HTTP calls
- [ ] 11.2 Create `packages/web/src/features/budgets/budgetsApi.ts` — thin fetch wrappers for all 4 endpoints

### Phase 12: Components

- [ ] 12.1 Create `packages/web/src/features/budgets/components/BudgetProgressBar.tsx` — presentational; props: `spentCents`, `effectiveLimitCents`; color thresholds: green <75%, amber 75–99%, red ≥100%; no hardcoded strings
- [ ] 12.2 Create `packages/web/src/features/budgets/components/BudgetCard.tsx` — presentational; renders budget name, type, `formatCurrency(limitCents, currency)`, and `<BudgetProgressBar>`; all labels from `t.budgets`
- [ ] 12.3 Create `packages/web/src/features/budgets/components/BudgetForm.tsx` — controlled form for create/edit; fields: `type`, `categoryId` (conditional on `per_category`), `currency`, `limitCents`, `rollover`; on edit mode hides immutable fields; all labels from `t.budgets`

### Phase 13: Pages

- [ ] 13.1 Create `packages/web/src/features/budgets/pages/BudgetsPage.tsx` — calls `useListBudgets()`; renders list of `<BudgetCard>`; FAB or button navigates to `/budgets/new`; delete confirmation dialog inline
- [ ] 13.2 Create `packages/web/src/features/budgets/pages/CreateBudgetPage.tsx` — renders `<BudgetForm>` in create mode; on success navigates to `/budgets`
- [ ] 13.3 Create `packages/web/src/features/budgets/pages/EditBudgetPage.tsx` — reads `budgetId` from route params; prefills `<BudgetForm>` with existing data (only `limitCents` + `rollover` editable); on success navigates to `/budgets`

### Phase 14: Routing & i18n

- [ ] 14.1 Add `t.budgets` section to `packages/web/src/lib/i18n.ts` — keys: page title, card labels, form labels, progress states (under budget, warning, over budget), empty state, delete confirmation, action labels (create, save, cancel, delete)
- [ ] 14.2 Add routes `/budgets`, `/budgets/new`, `/budgets/:budgetId/edit` to `packages/web/src/app/routes.ts`
- [ ] 14.3 Register budget pages in `packages/web/src/app/AppRouter.tsx` — lazy-import each page component; wire to routes from 14.2
- [ ] 14.4 Add budgets navigation entry to sidebar and bottom tab bar (follow existing nav pattern for placement)
