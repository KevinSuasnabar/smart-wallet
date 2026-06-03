# Proposal: transaction-edit-delete

> SDD phase: propose
> Project: smart-wallet
> Change: transaction-edit-delete
> Date: 2026-05-15
> Engram topic_key: `sdd/transaction-edit-delete/proposal`

## 1. Intent

Today the `wallet-mvp` backend supports only **adding** transactions: `POST /wallets/{walletId}/transactions`. There is no way to correct a misplaced entry or remove a duplicate. From the UI side, once you tap "Agregar" you live with the result forever. For a personal-finance app this is unacceptable — typos and miscategorizations happen, and the cost of perfect data entry on a phone is too high for "you cannot fix it later" to be a real product stance.

This change adds two HTTP endpoints to the backend — `PATCH` and `DELETE` on a single transaction — and the corresponding UI affordances on the web app: an "Editar" action that reopens the transaction in the existing form pre-populated with current values, and an "Eliminar" action with a confirmation modal. Both operations are **atomic with wallet balance recalculation**: the wallet's running balance is adjusted in the same DynamoDB `TransactWriteItems` call that mutates the transaction, so the books never get out of sync.

Success means: a user who fumbles a transaction can correct it in two taps; a user who creates a wrong transaction can delete it; the wallet balance shown on every screen is the truth at every moment between those operations.

## 2. In Scope

### Backend (`packages/api`, `packages/domain`, `packages/shared-types`, `packages/infra-sls`)

- **New endpoint `PATCH /wallets/{walletId}/transactions/{transactionId}`**
  - Accepts a partial payload: `amount`, `description`, `categoryId`, `occurredAt` are all optional.
  - **Not mutable**: `type` (income/expense), `walletId`, `currency`, `userId`, `createdAt`, `transactionId`. If `type` were mutable, the category-type-match constraint would re-validate and the balance-delta sign would flip — the migration is non-trivial and out of scope (§3).
  - Idempotency-Key header supported (mirrors `POST`): same SHA-256 hash + IdempotencyRecord pattern. Replay returns 200 with current state.
  - Returns 200 with the full updated `TransactionResponseDTO`.
  - Errors: 400 (invalid payload), 401 (no auth), 404 (transaction not found or not owned), 409 (currency mismatch is impossible here since currency is not mutable, but category-type mismatch returns 409), 422 (occurredAt out of range, description too long).
- **New endpoint `DELETE /wallets/{walletId}/transactions/{transactionId}`**
  - **Hard delete** (per user decision §4.1): the DynamoDB item is removed, not flagged.
  - Wallet balance delta is reversed atomically in the same `TransactWriteItems`.
  - Returns 204 on success, 404 if the transaction does not exist or is not owned by the caller.
  - Idempotency-Key NOT required — deleting twice naturally yields 404 the second time. Per user decision (§4.4), we still **accept** an Idempotency-Key header on DELETE for client retry safety, but the contract treats DELETE as a regular idempotent verb (no IdempotencyRecord written).
- **New domain use cases** `UpdateTransaction` and `DeleteTransaction` (in `packages/domain/src/transaction/usecases/`)
  - Mirror the structure of `AddTransaction`: factory `makeUpdate…` / `makeDelete…` taking deps `{ walletRepo, transactionRepo, categoryRepo?, clock }`.
  - Coordinate: load tx + wallet → validate ownership → compute new vs. old balance delta → persist atomically.
- **`TransactionRepository` extensions** (interface + DynamoDB adapter)
  - `update(input: UpdateTransactionPersistInput): Promise<void>` — 2-op TransactWriteItems (Update tx + Update wallet balance delta).
  - `updateIdempotent(input): Promise<Result<…>>` — 3-op variant with IdempotencyRecord for replay safety, mirrors `addIdempotent`.
  - `hardDelete(input: HardDeleteInput): Promise<void>` — 2-op TransactWriteItems (Delete tx + Update wallet balance reverse delta).
- **Shared types** in `packages/shared-types/src/schemas/transaction.ts`
  - `UpdateTransactionRequestSchema` — all-optional Zod object covering the 4 mutable fields, with the same validators (`zDecimalString`, `zOccurredAt`, etc.) as `AddTransactionRequestSchema`.
  - `TransactionIdPathSchema` — extends `WalletIdPathSchema` with a `transactionId` UUID v4 field.
  - DTO types regenerated.
- **`serverless.yml` updates**
  - Two new function definitions following the `addTransaction` pattern (`patch` and `delete` HTTP methods, `cognitoJwt` authorizer).

### Frontend (`packages/web`)

- **Action row on each transaction list item** with two icons: pencil (edit) and trash (delete). Sized for thumb tap (44×44 minimum per design system).
- **Edit flow**: tap pencil → navigate to `/wallets/:walletId/transactions/:transactionId/edit` (or open a modal — design phase decides). Page reuses `TransactionForm` with `defaultValues` from the loaded transaction. Submit issues PATCH. Success → toast + invalidate queries + back to the list.
- **Delete flow**: tap trash → confirmation dialog ("¿Eliminar este movimiento? El saldo de la billetera se ajustará.") → confirm fires DELETE → toast + invalidate.
- **TanStack Query invalidations on success**: `transactionsByWallet(walletId)`, `transactionsByCategory(categoryId)` (if filters touched the category), `wallet(walletId)` (balance changed), `wallets` list (balance touches the list view).
- **Optimistic updates**: NO. The mutation touches `wallet.balance` derived state — risk of UI desync exceeds benefit. Refetch on success.
- **API client extensions** in `features/transactions/transactionsApi.ts`: `updateTransaction(args)` and `deleteTransaction(args)` typed against the shared schemas. Both attach a fresh UUID v4 `Idempotency-Key` on submission.
- **Error mapping** in `lib/api/errors.ts`: 404 → "Este movimiento ya no existe" toast; 409 → "La categoría no coincide con el tipo"; 422 → field errors.

### What this change does NOT change

- The `POST /wallets/{walletId}/transactions` endpoint and its handler are unchanged.
- The `Idempotency-Key` semantics for `POST` are unchanged.
- The CDK stack and Cognito setup are unchanged.
- Existing transaction queries (list by wallet, list by category) need only filter on `deletedAt` — but per §4.1 we hard-delete, so the filter logic stays as-is and no records will carry `deletedAt`.

## 3. Out of Scope

- **Editing `type`** (income ↔ expense). Would require re-validating category type-match and flipping the balance delta sign. The use case becomes essentially "delete + recreate". If the user really needs to change type, they delete and recreate manually. Future change `transaction-retype` if it ever justifies the engineering.
- **Editing `walletId`** (moving a transaction between wallets). Two balances would need to update atomically. Out of scope — same workaround: delete + recreate. A real "transfer" feature comes later in Tier 1 (`wallet-transfers`).
- **Bulk operations** (delete many, edit many). MVP is single-item operations.
- **Undo of delete** (toast with "Deshacer" button). Possible later with soft-delete; today's hard-delete is irreversible by design. Listed explicitly so the trade-off is visible.
- **Audit log** of edits/deletes. The current `createdAt`/`updatedAt` on the transaction is the only history — sufficient for personal use, insufficient for shared/team use.
- **Tests** (unit/integration/e2e). Per existing project convention `strict_tdd: false`. Test surface is documented in design phase.
- **Optimistic UI updates**. Risk > benefit for a mutation touching derived `wallet.balance`. Refetch-on-success only.

## 4. Architectural Decisions

### 4.1 Hard delete instead of the existing soft-delete scaffolding

**User decision** (logged here so future-you knows why).

The domain already implements `Transaction.softDelete(clock: Clock): void` (`packages/domain/src/transaction/Transaction.ts:187-192`) with the explicit comment "method exists for schema completeness and future use", and `TransactionProps.deletedAt: Date | null` is part of the entity shape. The repository queries already filter by `deletedAt`.

In the SDD propose phase, the option of "use the soft-delete that's already there" was raised and rejected by the user in favor of hard-delete:

> "Hard delete + recalcular balance (Recommended)" — chosen over "Soft delete (marcar como deleted)".

Then a second confirmation after surfacing the domain pre-work also chose hard-delete.

Trade-offs accepted by going hard-delete:

- ✗ Not auditable — no record that anything was ever there.
- ✗ Not recoverable — no "undo" affordance possible in the UI (hence §3 out-of-scope).
- ✗ Reports that need history reconstruction across time will be wrong.
- ✓ Cheaper storage (no TTL or cleanup job needed).
- ✓ Slightly cleaner queries (no `attribute_not_exists(deletedAt)` filter on indexes that already filter elsewhere).

Implementation impact:

- The existing `softDelete()` method on `Transaction` is **left intact** — removing it would mean modifying scaffolding that's used elsewhere as a documented "future hook". Coexistence is fine: nothing in this change calls it.
- A new method on `TransactionRepository` named `hardDelete(input)` performs the actual DynamoDB `Delete` + balance reverse update.
- The use case `DeleteTransaction` calls `repo.hardDelete()` directly. Hard delete is a persistence concern, not a domain lifecycle concern, so the entity has no `hardDelete()` method.

### 4.2 PATCH idempotency mirrors POST

**User decision**. PATCH supports an Idempotency-Key header using the existing pattern: SHA-256(`userId:walletId:transactionId:idempotencyKey`) → IdempotencyRecord item with 24h TTL → 3-op TransactWriteItems coordinated with the same error narrowing as `addIdempotent`.

Trade-off accepted:

- ✗ Adds backend complexity for what is naturally an idempotent verb when sent with the same body.
- ✓ Robust against double-click / network-retry hazards on flaky mobile networks.
- ✓ Consistency: every mutating endpoint accepts Idempotency-Key the same way.

The hash scope intentionally includes `transactionId` so the same idempotency key cannot accidentally collide across PATCHes targeting different transactions.

### 4.3 DELETE does NOT use IdempotencyRecord

DELETE is naturally idempotent at the protocol level: the second DELETE returns 404 because the row is gone. Writing an IdempotencyRecord adds storage with no semantic gain. We accept the `Idempotency-Key` header for client compatibility but ignore it server-side. Documented in §2 explicitly so a future developer who scans the handler for a missing record reference understands the decision was deliberate.

### 4.4 Atomic balance update via TransactWriteItems — reuse the established pattern

Both PATCH and DELETE perform the wallet balance recalculation in the same `TransactWriteItems` call that mutates the transaction. This mirrors the pattern locked in for `POST /transactions` (see `DynamoDBTransactionRepository.add()` and `addIdempotent()`).

For PATCH: compute `adjustment = newDelta - oldDelta` where `oldDelta` is the signed amount-cents of the existing transaction and `newDelta` reflects the post-edit amount. `wallet.balance += adjustment`.

For DELETE: the adjustment is simply the reverse of the original delta: `adjustment = -1 * originalDelta` (income → subtract, expense → add).

A wallet that is itself soft-deleted (has `deletedAt != null`) MUST reject mutations from this change. The wallet ConditionExpression `attribute_not_exists(deletedAt)` already enforces this in `addIdempotent`; we replicate it in `update*` and `hardDelete`.

### 4.5 Edit UI: dedicated route, not modal

The transaction form has six fields and a date picker that opens a popover. Cramming that into a modal on mobile risks scroll traps. A dedicated `/wallets/:walletId/transactions/:transactionId/edit` page reuses the existing `AddTransactionPage` shell and the existing `TransactionForm` component (with new `mode` and `defaultValues` props), which means small surface area changes.

Trade-off: a separate route is a navigation step, not an in-place edit. Acceptable; reverts to list afterward.

### 4.6 `TransactionForm` is extended to accept `mode` and `initialValues`

Today `TransactionForm` is the "add" form. We extend it with two optional props:

- `mode?: 'add' | 'edit'` (defaults to `'add'`)
- `initialValues?: Partial<AddTransactionDTO>` (used as `defaultValues`)

In edit mode:

- The `type` selector is disabled (cannot change type per §3).
- The wallet selector is disabled (cannot change wallet per §3).
- Submit text changes via i18n.

This keeps one form component instead of forking. Reviewing diff: small.

### 4.7 No backwards-compat shim for the route

The new edit route is new. No old URL needs to keep working. Straightforward addition to `AppRouter.tsx`.

## 5. Risks

| Risk                                                                                                                                                                                                              | Severity   | Mitigation                                                                                                                                                                                                                      |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `TransactWriteItems` partial-failure semantics misunderstood — partial state could leave balance and transaction out of sync.                                                                                     | **High**   | TransactWriteItems is all-or-nothing by DynamoDB contract. The existing `addIdempotent` already relies on this; we reuse the exact same error narrowing (`CancellationReasons`).                                                |
| Repository test-surface drift — we're adding `update`, `updateIdempotent`, `hardDelete`. Without tests, regressions in `add` / `addIdempotent` could be silent.                                                   | **Medium** | Apply phase manually smoke-tests the existing `POST` path after the new methods are added. Test-writing is a follow-on change.                                                                                                  |
| `Idempotency-Key` reuse confusion — a client that reuses the same key for POST and PATCH would scope differently.                                                                                                 | **Low**    | Hash scopes are explicit: POST scope `(userId, walletId, key)`, PATCH scope `(userId, walletId, transactionId, key)`. Different inputs → different hashes → no collision possible.                                              |
| User edits a transaction whose category was deleted between load and submit.                                                                                                                                      | **Low**    | `UpdateTransaction` use case calls `categoryRepo.validateCategoryForTransaction()` at mutation time — same guard as `AddTransaction`. Returns `CategoryNotFound` → 404 → UI toast.                                              |
| Race condition: two PATCHes to the same transaction at once (e.g., user clicks fast).                                                                                                                             | **Low**    | With Idempotency-Key, two PATCHes with the SAME key resolve to one row mutation + one replay. Two PATCHes with DIFFERENT keys serialize at DynamoDB. Last-write-wins on differing payloads — acceptable for personal use.       |
| `applyTransactionDelta` is currently only used in-memory post-write for the `add` path. PATCH/DELETE must also keep `wallet.balance` in-memory consistent if the caller continues to use the in-memory aggregate. | **Low**    | In this change, neither the PATCH nor DELETE use cases read `wallet` again after the persistence call. The aggregate is discarded post-mutation. We keep `applyTransactionDelta` as an option, but the use cases don't call it. |
| Frontend `useUpdateTransaction` / `useDeleteTransaction` invalidation list is incomplete and a stale query gets surfaced (e.g., dashboard not refreshing).                                                        | **Medium** | Design phase enumerates the complete invalidation list. Spec phase ties each REQ to the invalidations.                                                                                                                          |

## 6. Success Criteria

1. `PATCH /wallets/{walletId}/transactions/{transactionId}` with a partial body succeeds, the transaction reflects the new values, and the wallet balance reflects `oldDelta → newDelta` exactly.
2. `DELETE /wallets/{walletId}/transactions/{transactionId}` succeeds, the row is gone from DynamoDB, and the wallet balance reflects `-originalDelta`.
3. Both endpoints survive an Idempotency-Key replay: PATCH returns 200 with the current state; DELETE returns 404 on the second call (because the row is gone — natural idempotency).
4. UI: from the transaction list, the user can tap pencil → edit → submit → see updated values. Tap trash → confirm → row is gone, balance updated.
5. Smoke checklist enumerated in tasks completes without sync issues between balance and transactions across 5 sequential operations (add, edit, edit, delete, add).
6. `pnpm --filter @smart-wallet/api typecheck` and `pnpm --filter @smart-wallet/web typecheck` both green.
7. Existing `addTransaction` smoke (the 12-step `smoke-prod.sh`) still passes after deploy — proves no regression.
