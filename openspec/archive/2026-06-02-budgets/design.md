# Design: Monthly Budgets

## Technical Approach

Hexagonal layering, single-table DynamoDB, read-time aggregation. `Budget` is a new aggregate in `packages/domain/src/budget/`, persisted under `PK=USER#<userId>` / `SK=BUDGET#<id>` — no new GSI. Spent and effective-limit values are computed inside `ListBudgets` by calling a new `TransactionRepository.sumExpensesByPeriod` once per budget (twice when `rollover=true`), all parallelized with `Promise.all`. Frontend lives in `features/budgets/` per the established feature-folder convention.

## Architecture Decisions

| Decision                                   | Choice                                                                                                            | Alternative rejected                | Rationale                                                                                           |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- | ----------------------------------- | --------------------------------------------------------------------------------------------------- |
| Where `spent` lives                        | Computed server-side in `ListBudgets`                                                                             | Materialized counter on Budget item | No coupling Transaction→Budget; eventual-consistency-free; ~15 budgets/user keeps cost low          |
| DDB partition for Budgets                  | Same single-table, `SK=BUDGET#<id>`, no GSI                                                                       | New GSI `BUDGET#…`                  | YAGNI — `Query begins_with(SK,'BUDGET#')` returns the full set for a user                           |
| Period model                               | Fixed calendar month UTC                                                                                          | Configurable rolling window         | MVP; can be added without breaking schema                                                           |
| Rollover algorithm                         | Read-time prev-month diff via 2nd `sumExpensesByPeriod` call                                                      | Snapshot at month boundary (cron)   | No infra (no scheduler, no snapshot table); prev-month numbers are immutable                        |
| Mutability of type / categoryId / currency | Immutable post-create — PATCH only accepts `limitCents` and `rollover`                                            | Allow all edits                     | Changing scope = different budget; avoids retroactive re-aggregation surprises                      |
| Sum query — `per_category`                 | GSI1 `BETWEEN 'CAT#<cid>#<fromIso>' AND 'CAT#<cid>#<toIso>~'` + FilterExpression on `type`/`currency`/`deletedAt` | Scan; PK partition + filter         | GSI1 already exists for `listByCategory`; tilde sorts after all ISO chars to make BETWEEN inclusive |
| Sum query — `global`                       | PK partition + `begins_with(SK,'TXN#')` + FilterExpression on `occurredAt` / `type` / `currency`                  | New GSI per currency                | Acceptable RCU cost at MVP volume; GSI2 deferred                                                    |
| Pagination of sum                          | Drain ALL pages via `LastEvaluatedKey` loop                                                                       | Single Query call                   | DDB `Limit` applies BEFORE `FilterExpression` — single call would undercount                        |
| Output money format                        | `{ amount, currency, formatted }` via `formatCentsForResponse`                                                    | Raw cents number                    | Aligned with all existing handlers                                                                  |
| Delivery                                   | 3 chained PRs: domain → api → web                                                                                 | Single PR                           | ~35 new files breaks the 400-line review budget                                                     |

## Data Flow

ListBudgets read path (rollover on):

    Handler  ──▶  container.listBudgets(userId)
                       │
                       ▼
                 ┌──────────────────────────┐
                 │ budgetRepo.listByUser    │ ─▶ DDB Query PK=USER# / begins_with(SK,'BUDGET#')
                 └──────────────────────────┘
                       │   budgets[]
                       ▼
                 ┌──────────────────────────────────────────┐
                 │ Promise.all over budgets, for each:      │
                 │   transactionRepo.sumExpensesByPeriod(   │  curMonth
                 │     userId, {from,to,currency,cat?})     │
                 │   + if rollover: same call for prevMonth │
                 └──────────────────────────────────────────┘
                       │
                       ▼
                 effectiveLimit = rollover
                   ? limit + max(0, prevLimit - prevSpent)
                   :  limit
                       │
                       ▼
                 Handler maps to DTO with formatCentsForResponse(...)

## File Changes

| File                                                                               | Action | Description                                                                                                                                                                          |
| ---------------------------------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `packages/domain/src/budget/Budget.ts`                                             | Create | Aggregate. `create()` validates, `rehydrate()` for adapters, `applyEdits({limitCents?, rollover?})` snapshot+rollback                                                                |
| `packages/domain/src/budget/BudgetId.ts`                                           | Create | UUID v4 VO mirroring `WalletId`                                                                                                                                                      |
| `packages/domain/src/budget/BudgetError.ts`                                        | Create | `InvalidBudgetId`, `InvalidBudgetType`, `InvalidBudgetLimit`, `InvalidBudgetCurrency`, `BudgetCategoryRequired`, `BudgetCategoryForbidden`, `BudgetNotFound`, `BudgetImmutableField` |
| `packages/domain/src/budget/BudgetRepository.ts`                                   | Create | Port: `save`, `update`, `delete`, `findById`, `listByUser`                                                                                                                           |
| `packages/domain/src/budget/usecases/CreateBudget.ts`                              | Create | Validates userId, generates BudgetId, `Budget.create(...)`, `save`                                                                                                                   |
| `packages/domain/src/budget/usecases/ListBudgets.ts`                               | Create | Per-budget `sumExpensesByPeriod` (×1 or ×2) in `Promise.all`, returns view-model                                                                                                     |
| `packages/domain/src/budget/usecases/UpdateBudget.ts`                              | Create | Loads, `applyEdits`, `update`. Rejects any forbidden field via `BudgetImmutableField`                                                                                                |
| `packages/domain/src/budget/usecases/DeleteBudget.ts`                              | Create | Loads, `delete`                                                                                                                                                                      |
| `packages/domain/src/budget/index.ts`                                              | Create | Re-exports                                                                                                                                                                           |
| `packages/domain/src/shared/period.ts`                                             | Create | `startOfMonth(d, clock?)`, `endOfMonth(d)` UTC helpers                                                                                                                               |
| `packages/domain/src/transaction/TransactionRepository.ts`                         | Modify | Add `sumExpensesByPeriod(userId, {from, to, currency, categoryId?}): Promise<number>`                                                                                                |
| `packages/domain/src/index.ts`                                                     | Modify | Export Budget public API and `makeXBudget` factories                                                                                                                                 |
| `packages/api/src/adapters/dynamodb/keyBuilders.ts`                                | Modify | Add `budgetSK`, `budgetSKPrefix`                                                                                                                                                     |
| `packages/api/src/adapters/dynamodb/repositories/DynamoDBBudgetRepository.ts`      | Create | Implements `BudgetRepository`. Mapper: `BudgetMapper.toItem` / `fromItem` (calls `Budget.rehydrate`)                                                                                 |
| `packages/api/src/adapters/dynamodb/mappers/BudgetMapper.ts`                       | Create | Symmetric mapper, item shape includes `PK, SK, type, currency, limitCents, rollover, categoryId?, createdAt, updatedAt`                                                              |
| `packages/api/src/adapters/dynamodb/repositories/DynamoDBTransactionRepository.ts` | Modify | Implement `sumExpensesByPeriod` — branches on `categoryId` presence; drains all pages                                                                                                |
| `packages/api/src/adapters/dynamodb/index.ts`                                      | Modify | Export `DynamoDBBudgetRepository`                                                                                                                                                    |
| `packages/api/src/handlers/budget/createBudget.ts`                                 | Create | `withErrorHandler(withAuth(...))`, validate, call container, map output via `formatCentsForResponse`                                                                                 |
| `packages/api/src/handlers/budget/listBudgets.ts`                                  | Create | Returns array of `{budgetId, type, categoryId?, currency, limit, spent, effectiveLimit, rollover, createdAt, updatedAt}` (all money via `formatCentsForResponse`)                    |
| `packages/api/src/handlers/budget/updateBudget.ts`                                 | Create | PATCH; schema accepts only `limitCents?`, `rollover?`                                                                                                                                |
| `packages/api/src/handlers/budget/deleteBudget.ts`                                 | Create | DELETE; 204 on success, `domainErrorToResponse` on miss                                                                                                                              |
| `packages/api/src/composition/container.ts`                                        | Modify | Instantiate `budgetRepo`; wire 4 use cases                                                                                                                                           |
| `packages/infra-sls/src/handlers/budget/*.ts`                                      | Create | 4 one-line proxy re-exports                                                                                                                                                          |
| `packages/infra-sls/serverless.yml`                                                | Modify | 4 new HTTP routes `/budgets`                                                                                                                                                         |
| `packages/shared-types/src/budgets.ts`                                             | Create | Zod schemas: `CreateBudgetRequestSchema`, `UpdateBudgetRequestSchema`, `BudgetDTO`, `ListBudgetsResponseSchema`                                                                      |
| `packages/shared-types/src/index.ts`                                               | Modify | Re-export budget schemas                                                                                                                                                             |
| `packages/web/src/features/budgets/queries.ts`                                     | Create | React Query: `useBudgets`, `useCreateBudget`, `useUpdateBudget`, `useDeleteBudget`                                                                                                   |
| `packages/web/src/features/budgets/budgetsApi.ts`                                  | Create | Fetcher functions                                                                                                                                                                    |
| `packages/web/src/features/budgets/pages/BudgetsPage.tsx`                          | Create | List + progress bars                                                                                                                                                                 |
| `packages/web/src/features/budgets/pages/CreateBudgetPage.tsx`                     | Create | Form                                                                                                                                                                                 |
| `packages/web/src/features/budgets/pages/EditBudgetPage.tsx`                       | Create | Form (limit/rollover only)                                                                                                                                                           |
| `packages/web/src/features/budgets/components/BudgetCard.tsx`                      | Create | Card with progress bar, uses `formatCurrency`                                                                                                                                        |
| `packages/web/src/features/budgets/components/BudgetForm.tsx`                      | Create | Shared form for create/edit                                                                                                                                                          |
| `packages/web/src/features/budgets/components/DeleteBudgetDialog.tsx`              | Create | Confirm dialog                                                                                                                                                                       |
| `packages/web/src/routes/AppRouter.tsx`                                            | Modify | Register `/budgets`, `/budgets/new`, `/budgets/:id/edit`                                                                                                                             |
| `packages/web/src/lib/i18n.ts`                                                     | Modify | Add `t.budgets.*` strings                                                                                                                                                            |

## Interfaces / Contracts

```ts
// Domain port addition
sumExpensesByPeriod(
  userId: UserId,
  filter: { from: Date; to: Date; currency: Currency; categoryId?: string },
): Promise<number>; // cents
```

```ts
// ListBudgets output (domain view-model)
interface ListBudgetsItem {
  budget: Budget;
  spentCents: number;
  prevSpentCents?: number; // only when rollover
  effectiveLimitCents: number;
}
```

```ts
// HTTP DTO (shared-types)
interface BudgetDTO {
  budgetId: string;
  type: 'per_category' | 'global';
  categoryId?: string;
  currency: 'PEN' | 'USD';
  limit: Money; // formatCentsForResponse
  spent: Money;
  effectiveLimit: Money;
  rollover: boolean;
  createdAt: string;
  updatedAt: string;
}
```

```ts
// DDB item shape
{ PK: 'USER#<u>', SK: 'BUDGET#<id>', type, currency, limitCents, rollover,
  categoryId?, createdAt, updatedAt }
```

## Testing Strategy

No automated tests in MVP (per proposal). Manual verification matrix:

| Layer  | What to Verify                                                                                                | How                                      |
| ------ | ------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| Domain | `Budget.create` rejects: empty currency, non-int limit, `per_category` w/o categoryId, `global` w/ categoryId | Manual REPL via API                      |
| API    | `sumExpensesByPeriod` drains pages; income/wrong-currency excluded                                            | Seed >100 expense tx, hit `GET /budgets` |
| API    | PATCH rejects `type`/`categoryId`/`currency` with 400                                                         | curl with each field                     |
| Web    | Progress bar renders, rollover bumps effectiveLimit visibly                                                   | Manual UI smoke                          |

## Migration / Rollout

No data migration. Feature is purely additive. Rollout = deploy domain → deploy api → deploy web (chained PRs). Rollback per proposal §7.

## Open Questions

None — all deferred to "Out of Scope" in proposal.
