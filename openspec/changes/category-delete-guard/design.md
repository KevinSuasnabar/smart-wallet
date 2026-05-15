# Design: category-delete-guard

> SDD phase: design
> Project: smart-wallet
> Change: category-delete-guard
> Date: 2026-05-15
> Engram topic_key: `sdd/category-delete-guard/design`

---

## 1. Files affected

### New

(none)

### Modified

```
packages/domain/src/category/
  CategoryError.ts                 # +CategoryHasTransactions class, +union member

packages/domain/src/category/usecases/
  DeleteCustomCategory.ts          # +transactionRepo dep, +has-transactions check

packages/api/src/composition/
  container.ts                     # +transactionRepo in deleteCustomCategory deps

packages/api/src/handlers/category/
  deleteCustomCategory.ts          # +import CategoryHasTransactions, +409 branch

packages/web/src/lib/
  i18n.ts                          # +t.categories.deleteHasTransactionsError

packages/web/src/lib/api/
  errors.ts                        # +code mapping for category_has_transactions
```

Total: 6 files modified, 0 new. Estimated ~80–100 LOC delta.

---

## 2. Backend patches

### 2.1 `CategoryError.ts` — add class + union member

Append after the last existing class (`CategoryTypeMismatch`):

```ts
/**
 * A custom category cannot be deleted while it has at least one active
 * transaction referencing it. Detected via TransactionRepository.listByCategory
 * with limit 1.
 */
export class CategoryHasTransactions extends DomainError {
  readonly tag = 'domain.category.has_transactions' as const;
  readonly httpStatus = 409 as const;

  constructor(message = 'Cannot delete a category that has transactions') {
    super(message);
  }
}
```

Then extend the union:

```ts
export type CategoryError =
  | InvalidCategoryId
  | InvalidCategoryName
  | InvalidCategoryType
  | CannotDeletePredefined
  | CategoryTypeMismatch
  | CategoryHasTransactions;   // ← new
```

### 2.2 `DeleteCustomCategory.ts` — add dep + check

```ts
import type { TransactionRepository } from '../../transaction/TransactionRepository.js';
import { CategoryHasTransactions } from '../CategoryError.js';

export interface DeleteCustomCategoryDeps {
  categoryRepo: CategoryRepository;
  transactionRepo: TransactionRepository;   // NEW
  clock: Clock;
}
```

Insert the new check **between** the existing "category not found" branch and the existing `softDelete` call:

```ts
// ... existing: load category, return InvalidCategoryId if null ...

const txCheck = await deps.transactionRepo.listByCategory(
  userId,
  categoryId.toString(),
  { limit: 1 },
);
if (txCheck.items.length > 0) {
  return err(new CategoryHasTransactions());
}

// ... existing: softDelete ...
```

The `listByCategory` signature uses `categoryId: string` (the second positional arg is the raw string, not the VO — confirmed in `TransactionRepository.ts`). `CategoryId.toString()` returns the stable string form. The filter object uses `limit: 1` to bound cost.

### 2.3 `container.ts` — wire the new dep

```ts
deleteCustomCategory: makeDeleteCustomCategory({
  categoryRepo,
  transactionRepo,   // ← new
  clock,
}),
```

`transactionRepo` is already constructed at module scope (used by `addTransaction`, `updateTransaction`, etc.). No new singleton needed.

### 2.4 `deleteCustomCategory.ts` handler — add 409 branch

Import:

```ts
import {
  CannotDeletePredefined,
  InvalidCategoryId,
  CategoryHasTransactions,   // ← new
} from '@smart-wallet/domain';
```

Add branch BEFORE the fallthrough to `domainErrorToResponse`:

```ts
if (error instanceof CannotDeletePredefined) {
  return badRequest('cannot_delete_predefined_category');
}

if (error instanceof InvalidCategoryId) {
  return notFound('category_not_found');
}

// NEW
if (error instanceof CategoryHasTransactions) {
  return conflict('category_has_transactions');
}

return domainErrorToResponse(error);
```

We need a `conflict` response helper. Inspect `shared/response.ts`:

- If it already exports `conflict()`, use it.
- If not, add `export const conflict = (code: string) => ({ statusCode: 409, headers: jsonHeaders, body: JSON.stringify({ error: code }) })` next to `badRequest`, `notFound`, etc.

Alternative without new helper: rely on `domainErrorToResponse`. `CategoryHasTransactions` has `httpStatus = 409` and `tag = 'domain.category.has_transactions'`, so `domainErrorToResponse(error)` returns `{ statusCode: 409, body: { error: 'domain.category.has_transactions', ... } }`. That works, BUT the error code shape differs (`domain.category.has_transactions` vs `category_has_transactions`).

**Decision**: use the `conflict(...)` helper (adding it if missing) so the response body's `error` field matches the existing handler conventions (snake_case slug without `domain.` prefix). The frontend code-mapping in §3.2 expects `category_has_transactions`.

---

## 3. Frontend patches

### 3.1 `i18n.ts` — add string

Inside the existing `t.categories` block:

```ts
categories: {
  // ... existing
  deleteHasTransactionsError:
    'Esta categoría tiene movimientos asociados. Elimina los movimientos primero o cámbialos de categoría.',
},
```

Spanish neutro (no voseo) per the recorded preference. Verbs: `elimina`, `cámbialos`.

### 3.2 `errors.ts` — map the code

Extend `userMessageFor`:

```ts
export const userMessageFor = (err: unknown): string => {
  if (err instanceof ApiError) {
    if (err.code === 'category_has_transactions')           // ← new, FIRST
      return t.categories.deleteHasTransactionsError;
    if (err.status === 401) return t.errors.unauthorized;
    if (err.status === 404) return t.errors.notFound;
    if (err.code === 'validation_failed') return t.errors.validation;
    if (err.code === 'currency_mismatch') return t.errors.currencyMismatch;
    if (err.code === 'category_type_mismatch') return t.errors.categoryTypeMismatch;
    if (err.status >= 500) return t.errors.server;
    return t.errors.generic;
  }
  if (err instanceof TypeError && err.message.includes('fetch')) return t.errors.network;
  return t.errors.generic;
};
```

**Order matters**: the code check goes **before** the status check. If the status check fired first, `err.status === 404` could theoretically catch a not-found that happens to be a category (which it does for predefined-rejected paths) before the code mapping runs. Since `category_has_transactions` is 409, it doesn't intersect with 404, but keeping the code-checks above status-checks is defensive against future precedence bugs.

### 3.3 No structural UI change

`DeleteCategoryConfirm.tsx` already calls `toast.error(userMessageFor(err))` on mutation failure. With the new mapping, the toast renders the localized string automatically. No prop, hook, or layout change.

The dialog also does NOT close on error (the existing code only calls `onOpenChange(false)` inside `onSuccess`). So the user sees the toast and the dialog stays open — they can dismiss it manually if they want. That's acceptable. A future enhancement could auto-close on 409 too, but it's out of scope here.

---

## 4. Cross-cutting decisions

### 4.1 The has-transactions check ignores soft-deleted transactions

`listByCategory` already filters by `attribute_not_exists(deletedAt)`. A category that only has soft-deleted transactions is therefore deletable — which is the correct semantic ("soft-deleted = gone from user's perspective").

In practice, the project's transaction flow today uses **hard delete** for transactions (per the user's decision in `transaction-edit-delete`), so there are no soft-deleted transactions in real data. The filter is still correct because it doesn't see deleted ones.

### 4.2 Race condition: a transaction is added concurrently between check and softDelete

If a user (or another tab) creates a transaction referencing C while the delete request for C is mid-flight:

- Check runs: 0 items → proceeds.
- New tx written: now refers to C.
- `softDelete` of C completes.
- User has an orphaned tx referencing a soft-deleted C.

This is a TOCTOU window of milliseconds. Personal-use app, single user, low likelihood. **Not mitigated in this change.** A correct mitigation would be:

- Option (a): TransactWriteItems with a ConditionExpression on the category's `deletedAt = NULL` AND a `listByCategory` projection... not possible — DDB conditions don't span items.
- Option (b): Wrap softDelete in a `ConditionExpression` like "delete only if no recent transactions" — not expressible.
- Option (c): Add a `categoryRefCount` attribute to the category row that increments on add and decrements on delete, and put a `ConditionExpression: categoryRefCount = 0` on the softDelete. Doable but adds write contention on every tx insert.

For MVP, accept the window. Document the trade-off here so future readers know we considered it.

### 4.3 Predefined categories: behavior fully preserved

The `categoryId.kind === 'predefined'` check inside the use case fires BEFORE the new has-transactions check (see existing code at `DeleteCustomCategory.ts:35`). A predefined ID will always 400 — never reach the new code path. Tested via `SCN-CAT-DEL-PREDEFINED` in spec.

### 4.4 The new error class lives in the category-domain

`CategoryHasTransactions` is a **category invariant** ("a category in use cannot be deleted"), even though detecting it queries the transaction-domain. The error class lives in `category/CategoryError.ts` because:

1. The user-facing meaning is "you can't delete this category".
2. The `CategoryError` union covers it without changing the use case's `Result<void, CategoryError | UserError>` shape.
3. No cross-domain import: the use case imports `TransactionRepository` (an interface — already a cross-package edge for `validateCategoryForTransaction`).

### 4.5 No new test surface added (per `strict_tdd: false`)

Smoke covers the user-visible paths:

1. Create custom category + add tx + try delete → 409 + toast.
2. Hard-delete the tx + retry delete → 204.
3. Delete unused custom category → 204.
4. Try delete predefined → 400.

These are added to the manual smoke checklist in tasks. They are NOT added to `smoke-edit-delete-prod.sh` because that script is scoped to transaction-edit-delete; categories deserve their own script in a future change if needed.

---

## 5. Risks and mitigations

| Risk | Mitigation |
|------|------------|
| `conflict()` helper doesn't exist yet in `shared/response.ts` | Add it alongside `badRequest`, `notFound`. ~5 LOC. Verified during apply. |
| The has-transactions check uses `listByCategory` which projects all transaction attributes — bandwidth wasted on a query that only needs "exists?" | At `limit: 1`, the read is one item. Defer optimization until proven. |
| New `transactionRepo` dep in `DeleteCustomCategory` breaks consumer tests | No tests exist (`strict_tdd: false`). Future test-writing will be designed against the post-change signature. |
| Frontend code-check ordering subtly affects existing 404 flow | The new code check fires before status checks. Existing 404 path (when `err.code` is NOT `category_has_transactions`) still maps to `t.errors.notFound`. No change. |
| User concurrently creates a transaction → orphan | Documented as accepted TOCTOU trade-off in §4.2. Personal-use single-user app. |

---

## 6. Estimated impact

| Surface | LOC delta |
|---------|-----------|
| `packages/domain/src/category/CategoryError.ts` | +10 |
| `packages/domain/src/category/usecases/DeleteCustomCategory.ts` | +15 |
| `packages/api/src/composition/container.ts` | +1 |
| `packages/api/src/handlers/category/deleteCustomCategory.ts` | +8 |
| `packages/api/src/shared/response.ts` | +5 (if `conflict` doesn't exist) |
| `packages/web/src/lib/i18n.ts` | +2 |
| `packages/web/src/lib/api/errors.ts` | +2 |
| **Total** | **~43** |

Well under the 400-line budget. Single PR. No chained-PR decision needed.
