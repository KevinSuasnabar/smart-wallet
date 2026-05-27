# Exploration: Monthly Budget Feature

**Change**: `budgets`
**Date**: 2026-05-27

## Summary

Full-stack feature spanning domain → api adapter → handlers → shared-types → web frontend.
~35 new files + ~10 modified. No new DynamoDB GSI required.

---

## Key Findings

### DynamoDB Queries

**Per-category sum (month)**

- GSI1: `GSI1PK = USER#<userId>` AND `GSI1SK BETWEEN 'CAT#<categoryId>#<from>' AND 'CAT#<categoryId>#<to>'`
- FilterExpression: `#type = 'expense' AND attribute_not_exists(deletedAt)`
- Must drain all pages (no Limit) — DDB applies Limit BEFORE FilterExpression

**Global sum (all categories, month)**

- Primary table: `PK = USER#<userId>` AND `begins_with(SK, 'TXN#')`
- FilterExpression: `occurredAt BETWEEN :from AND :to AND #type = 'expense' AND #currency = :currency AND attribute_not_exists(deletedAt)`
- No new GSI needed — single PK partition drain

### New TransactionRepository method

```ts
sumExpensesByPeriod(
  userId: UserId,
  filter: { from: Date; to: Date; categoryId?: string; currency: string }
): Promise<number> // returns integer cents
```

DDB adapter branches: categoryId present → GSI1 BETWEEN; absent → PK partition scan.

### Budget DynamoDB Schema

```
PK  = USER#<userId>
SK  = BUDGET#<budgetId>
```

Key builders: `budgetSK(id)` → `BUDGET#<id>`, `budgetSKPrefix()` → `'BUDGET#'`
Attributes: `budgetId`, `type` (`per_category|global`), `categoryId?`, `limitCents` (int), `currency`, `rollover` (bool), `createdAt`, `updatedAt`

### Rollover calculation (at read time, no job needed)

```
spentPrev = sumExpensesByPeriod(prevMonthStart, prevMonthEnd, ...)
leftover = max(0, limitCents - spentPrev)
effectiveLimitCents = rollover ? limitCents + leftover : limitCents
```

---

## Affected Files

### New — Domain

- `packages/domain/src/budget/BudgetId.ts`
- `packages/domain/src/budget/Budget.ts`
- `packages/domain/src/budget/BudgetError.ts`
- `packages/domain/src/budget/BudgetRepository.ts`
- `packages/domain/src/budget/usecases/CreateBudget.ts`
- `packages/domain/src/budget/usecases/ListBudgets.ts`
- `packages/domain/src/budget/usecases/UpdateBudget.ts`
- `packages/domain/src/budget/usecases/DeleteBudget.ts`
- `packages/domain/src/budget/index.ts`

### Modified — Domain

- `packages/domain/src/transaction/TransactionRepository.ts` — add `sumExpensesByPeriod`
- `packages/domain/src/index.ts` — add budget exports

### New — API

- `packages/api/src/adapters/dynamodb/mappers/BudgetMapper.ts`
- `packages/api/src/adapters/dynamodb/repositories/DynamoDBBudgetRepository.ts`
- `packages/api/src/handlers/budget/createBudget.ts`
- `packages/api/src/handlers/budget/listBudgets.ts`
- `packages/api/src/handlers/budget/updateBudget.ts`
- `packages/api/src/handlers/budget/deleteBudget.ts`

### Modified — API

- `packages/api/src/adapters/dynamodb/keyBuilders.ts`
- `packages/api/src/adapters/dynamodb/repositories/DynamoDBTransactionRepository.ts`
- `packages/api/src/adapters/dynamodb/index.ts`
- `packages/api/src/composition/container.ts`

### New — Infra-SLS

- `packages/infra-sls/src/handlers/budget/createBudget.ts`
- `packages/infra-sls/src/handlers/budget/listBudgets.ts`
- `packages/infra-sls/src/handlers/budget/updateBudget.ts`
- `packages/infra-sls/src/handlers/budget/deleteBudget.ts`

### Modified — Infra-SLS

- `packages/infra-sls/serverless.yml`

### New — Shared-types

- `packages/shared-types/src/schemas/budget.ts`

### Modified — Shared-types

- `packages/shared-types/src/index.ts`

### New — Web

- `packages/web/src/features/budgets/queries.ts`
- `packages/web/src/features/budgets/pages/BudgetsPage.tsx`
- `packages/web/src/features/budgets/pages/CreateBudgetPage.tsx`
- `packages/web/src/features/budgets/pages/EditBudgetPage.tsx`
- `packages/web/src/features/budgets/components/BudgetCard.tsx`
- `packages/web/src/features/budgets/components/BudgetForm.tsx`
- `packages/web/src/features/budgets/components/BudgetProgressBar.tsx`

### Modified — Web

- `packages/web/src/app/routes.ts`
- `packages/web/src/app/AppRouter.tsx`
- `packages/web/src/lib/i18n.ts`

---

## Risks

1. N+1 DDB queries in `listBudgets` (10 budgets + rollover → 20 parallel queries) — acceptable MVP scale
2. Global budget scan reads income records, discarded by FilterExpression — wastes RCUs, acceptable
3. Currency constraint: global budget needs explicit currency; sum filtered by that currency
4. Drain loop mandatory for correct sums (DDB Limit applies before FilterExpression)
5. ~35 new files exceeds 400-line PR budget → chained PRs: domain / api / web
