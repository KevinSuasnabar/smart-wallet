# Proposal: category-delete-guard

> SDD phase: propose
> Project: smart-wallet
> Change: category-delete-guard
> Date: 2026-05-15
> Engram topic_key: `sdd/category-delete-guard/proposal`

## 1. Intent

Today a user can delete a custom category that has transactions associated. The transaction rows survive (we hard-delete only the category, not its transactions), but they end up referencing a `categoryId` that no longer exists. The transaction list UI looks up the category by id to render the human name; when it can't find one, it falls back to showing the raw UUID — the user reported "the transaction looks weird with a UUID instead of the name".

This change closes that integrity hole at the boundary: the backend refuses to delete a custom category that has at least one transaction, returning `409 Conflict`. The frontend surfaces a clear localized message ("Esta categoría tiene movimientos asociados. Elimina los movimientos primero o cámbialos de categoría.") and keeps the category in the list.

Success means: a user trying to delete a category-in-use sees a helpful error and the data stays consistent. A user trying to delete an unused category still succeeds normally. The orphaned-UUID symptom is gone.

This is also the smallest of the five SDDs the user requested (the rest — wallet edit/delete, wallet colors, fork-on-edit for predefined categories — land in follow-up changes).

## 2. In Scope

### Backend (`packages/api`, `packages/domain`)

- **New domain error** `CategoryHasTransactions` in `packages/domain/src/category/CategoryError.ts` with `httpStatus = 409` and `tag = 'domain.category.has_transactions'`. Added to the `CategoryError` union.
- **`DeleteCustomCategory` use case** gains a new dep: `transactionRepo: TransactionRepository`. Before soft-deleting the category, it queries `transactionRepo.listByCategory(userId, categoryId, { limit: 1 })`. If the result contains any item, returns `CategoryHasTransactions`.
- **Composition `container.ts`** wires `transactionRepo` into `deleteCustomCategory` (already declared at module scope).
- **Handler `deleteCustomCategory.ts`** maps the new error to a 409 response with body `{ error: 'category_has_transactions' }`. Existing branches (`CannotDeletePredefined`, `InvalidCategoryId`) are unchanged.

### Frontend (`packages/web`)

- **`userMessageFor`** in `lib/api/errors.ts` maps the `category_has_transactions` error code to the localized message string from i18n.
- **i18n** gains 1 new string under `t.categories`: `deleteHasTransactionsError: 'Esta categoría tiene movimientos asociados. Elimina los movimientos primero o cámbialos de categoría.'` (Spanish neutro per the language preference recorded in engram).
- **`CategoriesPage`** (or wherever the delete handler lives): on 409 with this code, the existing `userMessageFor` already takes care of toasting — no UI structural change needed beyond confirming the toast renders.

### What is NOT in scope (out of scope §3)

- Editing predefined categories — separate SDD `category-fork`.
- Color on categories — separate SDD `wallet-colors` covers this for wallets only; categories will get colors in a future change.
- Cascade-delete (delete category + its transactions) — explicitly NOT what the user wants: they asked for a "prohibit" model, not a cascade model.
- Migrating existing dangling transactions whose category was already deleted in prod — out of scope for this change. A separate one-off cleanup may surface them and reset them to a fallback predefined category, but that's a different ticket.

## 3. Out of Scope

- **Cascade delete category → transactions** — user explicitly chose the "prohibit" model. If the user later wants cascade, that's a different change.
- **Backfill / migration of orphaned transactions** — any transaction in prod that already references a deleted category will keep showing the UUID until either (a) the user re-creates a category with that UUID (impossible — UUIDs are server-generated and unique) or (b) we add an out-of-band cleanup job. This change only fixes new orphans by preventing them; it does not retroactively repair existing ones.
- **Performance optimization of the "has any transaction" check** — for the MVP scale (single user, low volume) a `listByCategory(limit: 1)` query is cheap. A count-only optimization (`Select: COUNT` on the GSI) is a future enhancement if it ever shows up in observability.
- **Soft-delete reactivation** — categories soft-deleted today stay soft-deleted. If a user wants to "restore" a soft-deleted category, that's a separate change.
- **Tests** — `strict_tdd: false` for the project. Manual smoke covers the user-visible path.

## 4. Architectural Decisions

### 4.1 "Has transactions" check uses the existing `listByCategory(limit: 1)`

The `TransactionRepository` interface already exposes `listByCategory(userId, categoryId, filter)` which queries the GSI1 index keyed by `CAT#{categoryId}#{occurredAt}#{txId}`. Querying with `limit: 1` returns the first matching item or empty. The use case only needs to know "any?", so checking `items.length > 0` is sufficient.

Rationale:
- **No new repo method needed.** Adds one new dep to the use case (the existing `transactionRepo` already in the container) instead of a new method on the interface.
- **Cheap**: GSI1 query with `Limit: 1` reads at most one item. Cost is bounded.
- **Correct in the presence of soft-deletes**: `listByCategory` already filters by `attribute_not_exists(deletedAt)`. So "has transactions" really means "has *active* transactions" — which is what the user wants. If the user has a category whose all transactions were hard-deleted (see PR #16/#17), the category is now deletable, which is correct.

Alternative considered: add a `countByCategory(userId, categoryId)` method to the repo that does a `Select: COUNT` query. Better in theory (no item read) but adds interface surface for marginal benefit at MVP scale. Defer until measurements justify it.

### 4.2 Error class lives in the category-domain, not the transaction-domain

`CategoryHasTransactions` is a **category invariant** ("a category in use cannot be deleted"), even though detecting it requires reading transactions. The error class lives in `packages/domain/src/category/CategoryError.ts` because:
- The failure semantics are "you can't delete this category", not "the transaction is broken".
- It joins the `CategoryError` union, so the use case's `Result<void, CategoryError | UserError>` shape is preserved.
- The HTTP code (409 Conflict) aligns with "the resource is in a state that conflicts with the requested operation" — a category constraint.

### 4.3 Predefined categories: behavior unchanged

Predefined categories already return `CannotDeletePredefined` (400). The new guard only fires AFTER that check, for custom categories. The error precedence:

1. Path validation (Zod): `400 invalid_category_id` if shape is wrong.
2. `categoryId.kind === 'predefined'`: `400 cannot_delete_predefined_category`.
3. Custom not found / not owned: `404 category_not_found`.
4. **NEW**: custom found but has transactions: `409 category_has_transactions`.
5. Success: `204 No Content`.

Order matters because we want the most specific failure first. A predefined ID that somehow had transactions would still be 400 (predefined trumps the new guard) — but that's an impossible state in practice.

### 4.4 No optimistic UI removal

Today the categories page (presumably) refetches after delete; we keep that pattern. A user who hits 409 doesn't see the category disappear and then reappear — it simply stays visible with the toast.

### 4.5 Frontend message — Spanish neutro per the new preference

The user pivoted from voseo to español neutro (recorded in engram under `preferences/language`). The new string follows that:

> "Esta categoría tiene movimientos asociados. Elimina los movimientos primero o cámbialos de categoría."

Notice "elimina" / "cámbialos" — neutral imperative (NOT "eliminá" / "cambialos" which would be voseo).

## 5. Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| The `listByCategory` query reads through unwanted projected attributes for the "any?" check. | Low | At MVP scale (≤ 1 item read) the cost is negligible. Defer optimization. |
| A user with many transactions runs into Lambda latency on the GSI query before the delete. | Low | The query has `Limit: 1`, so latency is bounded regardless of partition size. |
| `CategoryError` union grows; downstream pattern-matchers that don't handle the new variant could silently 500 if they use exhaustive matches. | Low | The only consumer of the union is `domainErrorToResponse` (which uses the `tag`/`httpStatus` contract, not a switch) and the handler (which has an explicit fallback). |
| Existing orphaned transactions in prod (categories deleted before this fix) still display UUIDs. | Medium (user-visible) | Documented as out-of-scope §3. A future cleanup may reset orphans to a fallback predefined category. Not blocking. |
| Frontend toast text appears even when the user expected a confirm-dialog pattern. | Low | Today the categories page deletes immediately on click (no confirmation), so a toast is the right surface. If we later add a confirmation, the same error path still works. |

## 6. Success Criteria

1. `DELETE /categories/{id}` on a custom category with at least one active transaction returns `409` with `{ error: 'category_has_transactions' }`.
2. `DELETE /categories/{id}` on a custom category with no transactions still returns `204` (existing behavior).
3. `DELETE /categories/{id}` on a predefined ID still returns `400 cannot_delete_predefined_category` (existing behavior).
4. The frontend renders a clear localized toast ("Esta categoría tiene movimientos asociados…") on 409 with this code.
5. After a failed delete, the category remains in the list and the user can interact with it normally.
6. `pnpm typecheck` green across `domain`, `api`, `web`.
7. Manual smoke against the local backend covers all four scenarios (success, predefined, not-found, has-transactions).
