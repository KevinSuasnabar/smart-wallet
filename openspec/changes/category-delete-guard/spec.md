# Spec: category-delete-guard

> SDD phase: spec
> Project: smart-wallet
> Change: category-delete-guard
> Date: 2026-05-15
> Engram topic_key: `sdd/category-delete-guard/spec`

---

## 1. Glossary

| Term | Definition |
|------|------------|
| **Active transaction** | A transaction row whose `deletedAt` attribute does not exist (i.e., not soft-deleted). The existing `listByCategory` query already filters by `attribute_not_exists(deletedAt)`. |
| **Has-transactions check** | A `listByCategory(userId, categoryId, { limit: 1 })` call. Returns `{ items: [...] }`. If `items.length > 0`, the category has at least one active transaction. |
| **`CategoryHasTransactions`** | New domain error class. `tag = 'domain.category.has_transactions'`, `httpStatus = 409`. Member of the `CategoryError` union. |
| **Error precedence** | The fixed order in which the DELETE handler evaluates failures: path-validation 400 → predefined 400 → not-found 404 → **has-transactions 409** → success 204. |
| **`category_has_transactions`** | The HTTP response body's `error` field value mapped by the handler and consumed by the frontend. |

---

## 2. Requirements

### Domain layer (CAT-DEL-DOM)

- **REQ-CAT-DEL-DOM-01**: A new error class `CategoryHasTransactions` exists in `packages/domain/src/category/CategoryError.ts`. It extends `DomainError` with `tag: 'domain.category.has_transactions' as const` and `httpStatus: 409 as const`. Constructor accepts an optional message; default: `'Cannot delete a category that has transactions'`.
- **REQ-CAT-DEL-DOM-02**: The `CategoryError` union includes `CategoryHasTransactions` alongside the existing variants.
- **REQ-CAT-DEL-DOM-03**: `DeleteCustomCategoryDeps` includes `transactionRepo: TransactionRepository` in addition to `categoryRepo` and `clock`.
- **REQ-CAT-DEL-DOM-04**: The `DeleteCustomCategory` use case, after the existing predefined-rejection and category-not-found checks, performs a has-transactions check via `transactionRepo.listByCategory(userId, categoryId, { limit: 1 })`. If the result's `items.length > 0`, the use case returns `err(new CategoryHasTransactions(...))` WITHOUT calling `softDelete`.
- **REQ-CAT-DEL-DOM-05**: If the has-transactions check returns `items.length === 0`, the use case proceeds with `category.softDelete(deps.clock)` followed by `categoryRepo.softDelete(category)` exactly as before. No regression in the empty-category path.
- **REQ-CAT-DEL-DOM-06**: The use case's return type is unchanged: `Result<void, CategoryError | UserError>`. `CategoryHasTransactions` joins the existing `CategoryError` union and therefore needs no signature change.

### Composition (CAT-DEL-COMP)

- **REQ-CAT-DEL-COMP-01**: `packages/api/src/composition/container.ts` updates the `deleteCustomCategory` factory invocation to pass `transactionRepo` (already declared at module scope) alongside the existing `categoryRepo` and `clock` deps.

### HTTP handler (CAT-DEL-HTTP)

- **REQ-CAT-DEL-HTTP-01**: `packages/api/src/handlers/category/deleteCustomCategory.ts` imports `CategoryHasTransactions` from `@smart-wallet/domain`.
- **REQ-CAT-DEL-HTTP-02**: On `result.error instanceof CategoryHasTransactions`, the handler returns HTTP 409 with body `{ error: 'category_has_transactions' }`. The status is 409, not the generic 4xx path. The body matches the existing handler conventions (`error` key with snake_case slug).
- **REQ-CAT-DEL-HTTP-03**: The existing branches (`CannotDeletePredefined` → 400, `InvalidCategoryId` → 404, fallthrough → `domainErrorToResponse`) remain unchanged. The new branch is added AFTER `InvalidCategoryId` and BEFORE the fallthrough.
- **REQ-CAT-DEL-HTTP-04**: A successful delete still returns 204 No Content. No body. No regression.

### Frontend (CAT-DEL-FE)

- **REQ-CAT-DEL-FE-01**: A new i18n string lives at `t.categories.deleteHasTransactionsError`:
  > "Esta categoría tiene movimientos asociados. Elimina los movimientos primero o cámbialos de categoría."
  The phrasing follows español neutro (no voseo).
- **REQ-CAT-DEL-FE-02**: `packages/web/src/lib/api/errors.ts`'s `userMessageFor(err)` maps `err.code === 'category_has_transactions'` to `t.categories.deleteHasTransactionsError`. All existing branches stay verbatim.
- **REQ-CAT-DEL-FE-03**: The categories page's delete handler does not change. Today it surfaces `userMessageFor(err)` via `toast.error` on any non-204 response; the new mapping makes the user-visible toast helpful instead of generic.
- **REQ-CAT-DEL-FE-04**: After a failed delete (409), the category row remains in the list. No optimistic removal. The TanStack Query invalidation runs only on success.

---

## 3. Scenarios

### SCN-CAT-DEL-OK: Unused custom category is deletable

**Given** a user has a custom category C with no active transactions,
**When** they `DELETE /categories/{C.id}`,
**Then** the server returns 204 No Content, C is soft-deleted in DynamoDB (gains a `deletedAt` attribute), and a subsequent `GET /categories` does not include C in the custom list.

---

### SCN-CAT-DEL-HAS-TX: Category with transactions is NOT deletable

**Given** a user has a custom category C and at least one active transaction T whose `categoryId === C.id`,
**When** they `DELETE /categories/{C.id}`,
**Then** the server returns 409 with body `{ "error": "category_has_transactions" }`. C is **not** soft-deleted (`deletedAt` remains absent). T is unaffected.

---

### SCN-CAT-DEL-HAS-MANY: Bulk-count is bounded

**Given** a user has a custom category C and 200 active transactions referencing it,
**When** they `DELETE /categories/{C.id}`,
**Then** the server returns 409 in the same latency window as a 1-transaction case. The has-transactions check uses `limit: 1` and reads at most one item; the user's transaction volume does not affect cost.

---

### SCN-CAT-DEL-PREDEFINED: Predefined ID still rejected at 400

**Given** a user sends `DELETE /categories/expense:food` (predefined ID),
**When** the request reaches the handler,
**Then** the server returns 400 with body `{ "error": "cannot_delete_predefined_category" }`. The new has-transactions check is NEVER reached — the predefined-rejection precedes it.

---

### SCN-CAT-DEL-NOT-FOUND: Custom not-found still 404

**Given** a user sends `DELETE /categories/{some-uuid-they-do-not-own}`,
**When** the use case loads `findCustomById` and receives null,
**Then** the server returns 404 with body `{ "error": "category_not_found" }`. The has-transactions check is not reached.

---

### SCN-CAT-DEL-AFTER-TX-DELETED: Re-attempt succeeds

**Given** a user previously hit 409 on `DELETE /categories/{C.id}` because C had transactions, then later hard-deletes all transactions referencing C (via the existing `DELETE /wallets/{wid}/transactions/{tid}` endpoint),
**When** they `DELETE /categories/{C.id}` again,
**Then** the server returns 204 (the has-transactions check now sees zero items).

---

### SCN-CAT-DEL-FE-TOAST: Frontend shows localized error

**Given** a user clicks "Eliminar" on a category that has transactions,
**When** the mutation receives `{ status: 409, error: 'category_has_transactions' }`,
**Then** the toast displays "Esta categoría tiene movimientos asociados. Elimina los movimientos primero o cámbialos de categoría." The category row stays visible in the list. No spinner stays spinning.

---

### SCN-CAT-DEL-FE-OK: Successful delete still removes the row

**Given** a user clicks "Eliminar" on a category with no transactions,
**When** the mutation receives `204`,
**Then** a success toast appears and the category disappears from the list on the next refetch. No regression vs current behavior.
