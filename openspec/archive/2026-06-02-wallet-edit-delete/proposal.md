# Proposal: wallet-edit-delete

> SDD phase: propose
> Project: smart-wallet
> Change: wallet-edit-delete
> Date: 2026-05-15
> Engram topic_key: `sdd/wallet-edit-delete/proposal`

## 1. Intent

Today the user can create a wallet, list wallets, and view a wallet's detail, but cannot edit its name or currency, and cannot delete it. A wallet with a typo in the name is permanent. A wallet created by mistake or no longer in use stays in the list forever. The transactions of an obsolete wallet have no way to be cleaned up except one-by-one via the transaction delete that landed in `transaction-edit-delete`.

This change adds two endpoints — `PATCH /wallets/{walletId}` and `DELETE /wallets/{walletId}` — and the matching UI so the user can:

- Rename a wallet at any time.
- Change a wallet's currency **only when the wallet has no transactions**. Once any transaction exists, the currency is locked.
- Hard-delete a wallet and, in the same operation, hard-delete every transaction the wallet contained.

Success means: a user with a misnamed empty wallet can rename it and re-currency it; a user with an unwanted wallet (with or without transactions) can delete it cleanly; the wallet list reflects the change immediately; no transaction is ever left orphaned (pointing to a wallet that no longer exists).

## 2. In Scope

### Backend (`packages/api`, `packages/domain`, `packages/shared-types`, `packages/infra-sls`)

- **New endpoint `PATCH /wallets/{walletId}`**
  - Accepts a partial body: `name` (1–64 chars) and/or `currency` ('USD' | 'PEN').
  - At least one field required (refine).
  - **Currency mutation guard**: if `currency` is in the body and the wallet has any active transaction, return `409 wallet_currency_locked`.
  - **Not mutable**: `balance`, `createdAt`, `userId`, `walletId`, `deletedAt`.
  - Returns 200 with the updated `WalletResponseDTO`.
  - Errors: 400 invalid path/body, 401 no auth, 404 wallet not found, 409 currency locked.
- **New endpoint `DELETE /wallets/{walletId}`**
  - **Hard delete** of the wallet AND every transaction in it (cascade).
  - Returns 204 No Content on success.
  - Errors: 400 invalid path, 401 no auth, 404 wallet not found.
  - DELETE is naturally idempotent — a second call returns 404 (consistent with `DELETE /wallets/{wid}/transactions/{tid}`).
- **New domain methods** on `Wallet`
  - `applyEdits(edits: { name?, currency? }, clock): Result<void, WalletError>` — partial in-place mutation with field-level validation; rolls back on failure.
  - `signedDelta()` and `applyTransactionDelta` stay; no other entity changes.
- **New domain errors**
  - `WalletCurrencyLocked` (HTTP 409, `tag: 'domain.wallet.currency_locked'`).
- **New domain use cases** (in `packages/domain/src/wallet/usecases/`)
  - `UpdateWallet` — loads the wallet, validates the edits, runs the currency-lock check via `transactionRepo.listByWallet(userId, walletId, { limit: 1 })`, applies edits, persists.
  - `DeleteWallet` — verifies the wallet exists and is owned by the caller, then calls the repo's new cascade method.
- **`WalletRepository` extensions**
  - `update(wallet: Wallet): Promise<void>` — Put with `ConditionExpression: attribute_exists(PK)` so a vanished wallet fails fast.
  - `hardDeleteWithTransactions(userId, walletId): Promise<void>` — see §4.4 for the chunked algorithm.
- **Container wiring** for both new use cases.
- **`serverless.yml`** adds `patchWallet` and `deleteWallet` functions.
- **Shared types** in `packages/shared-types/src/schemas/wallet.ts`
  - `UpdateWalletRequestSchema` — strict, at-least-one, mirrors the structure of `UpdateTransactionRequestSchema` from the prior PR.
  - `UpdateWalletDTO`.

### Frontend (`packages/web`)

- **New page `EditWalletPage`** at route `/wallets/:walletId/edit`. Loads the wallet via the existing `useWallet(walletId)`, renders a small form with `name` and `currency` (with the currency field disabled and a helper line when the wallet has at least one transaction; the helper says "No se puede cambiar la moneda porque la billetera tiene movimientos").
- **Delete confirmation dialog** with strong copy: "Esta acción eliminará la billetera y todos sus movimientos. No se puede deshacer." Disable in-flight controls; on success → toast + navigate to `/wallets`.
- **Action buttons on `WalletDetailPage`** — pencil (edit) and trash (delete) icons next to the wallet header, mirroring the transaction-item pattern.
- **API client extensions** in `walletsApi`: `update(walletId, dto)` and `remove(walletId)`.
- **TanStack mutations**: `useUpdateWallet()` and `useDeleteWallet()`. Invalidate `walletKeys.all` AND `transactionKeys.all` (cascade delete clears transactions; failing to invalidate would leave stale tx lists in cached pages).
- **Error mapping** in `userMessageFor`: new `wallet_currency_locked` code → "No se puede cambiar la moneda porque la billetera tiene movimientos." in Spanish neutro.
- **i18n** additions under `t.wallets`: `editTitle`, `editEyebrow`, `editSubmit`, `editSuccess`, `editNoChanges`, `currencyLockedHelper`, `deleteDialogTitle`, `deleteDialogBody`, `deleteDialogConfirm`, `deleteSuccess`, `notFound`.

### What is NOT in this change

- **Colors on wallets** — separate SDD `wallet-colors`.
- **Soft-delete option** — the user already chose hard delete for transactions; cascade hard-delete for wallets is consistent. The domain's existing `softDelete` on `Wallet` is left intact for possible future audit but is not called here.
- **Currency conversion / rebalance** — when currency change is allowed (empty wallet), no balance recalc needed because balance is 0. We explicitly **do not** implement "change currency and recompute everything in the new currency" — that requires an FX feed and is out of scope (proposal §3).
- **Bulk operations** (delete many wallets) — not requested.
- **Undo of delete** — destructive by design; no undo affordance.
- **Tests** — `strict_tdd: false` for the project. Manual smoke covers the user-visible paths.

## 3. Out of Scope

- **Re-pricing transactions when currency changes** — currency change is allowed only on empty wallets, so there's nothing to re-price.
- **Multi-currency totals** (showing all wallets summed in one currency) — future change.
- **Soft-deleted wallet recovery** — irreversible by design.
- **Wallet visibility / archive** (a "hide but keep" affordance distinct from delete) — not requested.
- **Backfill of orphaned transactions in prod** — none exist (the foreign-key constraint enforced by this change applies going forward); a separate one-off cleanup would handle pre-existing edge cases.

## 4. Architectural Decisions

### 4.1 Hard delete + cascade hard delete (consistent with `transaction-edit-delete`)

The user chose hard delete for transactions in the prior change. Wallet delete continues the same model: the wallet item is removed from DynamoDB, AND every transaction belonging to that wallet is removed in the same logical operation.

Trade-offs accepted:

- ✗ Not auditable / not recoverable. The domain still has `Wallet.softDelete()` (and `Transaction.softDelete()`) for hypothetical future audit features, but neither is called.
- ✗ Reports needing history reconstruction will be wrong post-delete.
- ✓ Cleaner DynamoDB storage; no `attribute_not_exists(deletedAt)` filter complications.
- ✓ Consistent with the prior change's mental model.

### 4.2 Currency-lock check uses the existing `listByWallet(limit: 1)` query

Mirrors the pattern of `category-delete-guard`. The query is bounded (single item read), the GSI is unchanged, and no new repo method is required.

When `UpdateWallet` runs and the body contains `currency`:

```
if (input.edits.currency !== undefined && input.edits.currency !== wallet.currency) {
  const probe = await transactionRepo.listByWallet(userId, walletId, { limit: 1 });
  if (probe.items.length > 0) return err(new WalletCurrencyLocked());
}
```

Notes:

- We only run the probe if the currency is actually changing. A PATCH with `currency: 'USD'` on a wallet that's already USD is a no-op for that field and skips the check.
- The check fires AFTER the name validation. Both errors can co-occur conceptually (bad name + locked currency); we surface the first one (name) so the user fixes the simpler problem first. Order is deterministic.

### 4.3 Cascade delete: chunked `TransactWriteItems`, not `BatchWriteItem`

DynamoDB's `TransactWriteItems` has a hard limit of 100 ops per call. `BatchWriteItem` allows 25 items per call but is **not atomic**. For correctness we use TransactWrite chunks:

```
async hardDeleteWithTransactions(userId, walletId):
  1. Query: PK = USER#{userId} AND begins_with(SK, "TXN#{walletId}#")
            Paginated until LastEvaluatedKey === undefined
  2. Collect all SKs into an array (≤ a few hundred in practice)
  3. Slice into chunks of 99 (leave room for one wallet op in the final chunk)
  4. For each chunk except the last: TransactWriteItems[Delete tx for each SK]
  5. Final chunk: TransactWriteItems[Delete tx for each SK in final batch, Delete wallet]
     Wallet Delete has ConditionExpression attribute_exists(PK) → 404 if a concurrent delete already removed it
  6. If a chunk fails, retry that chunk (DynamoDB throttling is the most likely cause)
```

For wallets with ≤ 99 transactions (the common case), the entire cascade runs in **one atomic TransactWriteItems call** — tx deletes + wallet delete together. Larger wallets need multiple calls and lose end-to-end atomicity, but per-chunk atomicity is preserved and a partial failure leaves the system in a recoverable state (the user can retry; the wallet still exists with the surviving tx).

Decision recorded: **accept non-atomic >99-tx wallets** for MVP. Personal-use scale will rarely exceed this; if it does, a future change can switch to a "soft mark for deletion" pattern + async sweeper.

### 4.4 No partial cascade reversal

If chunk 3 of 5 fails, we do NOT attempt to "undo" chunks 1 and 2. Restoring deleted DynamoDB items is impossible without backups. Failure → return a 5xx; the user retries; the cascade picks up where it left off (chunks 1-2 already deleted are skipped because their items don't exist anymore; chunk 3+ runs).

The retry path is **idempotent**: the query in step 1 returns only the surviving transactions, so a retried delete won't double-delete and won't try to delete already-gone items.

### 4.5 Wallet entity gets `applyEdits` (like Transaction did)

Same pattern as `Transaction.applyEdits()` from the previous change. The use case calls `wallet.applyEdits({ name?, currency? }, clock)`, which validates each present field (name length 1-64 trim; currency in `VALID_CURRENCIES`) and rolls back on first error.

Currency-change validation at the entity level only checks "is it a valid currency" — the "is this allowed" check (does the wallet have transactions?) lives in the use case because the entity doesn't know about transactions.

### 4.6 No idempotency-key on PATCH or DELETE

Unlike PATCH on transactions, PATCH on wallets does not use idempotency keys. Rationale:

- The wallet PATCH body is small (name, currency) and the operation is naturally idempotent under last-write-wins semantics on a personal-use app.
- DELETE is naturally idempotent at HTTP level (second call → 404).
- Adding idempotency keys to wallet operations would only deliver value at concurrency volumes that don't apply.

If we add a multi-user mode later, this can be revisited.

### 4.7 Frontend: dedicated edit page, like transactions

Mirror the `EditTransactionPage` route pattern. Reasons:

- Deep-linkable; the user can refresh / share the edit URL.
- Same skeleton + error + form layout the user already knows from transaction edit.
- A modal would compete with the existing CreateWallet flow's full-page form and feel inconsistent.

The form is small (2 fields), so the page is short. We pad with the helper text when currency is locked.

### 4.8 Frontend: delete fires from `WalletDetailPage`, navigates to `/wallets`

The delete affordance lives on the detail page (next to the existing back button or in the header), not on the list page card. Reasons:

- Deletion is destructive; requiring the user to enter the wallet first adds a small friction that prevents click-misses on the list.
- The list page's `WalletCard` already serves a single purpose (navigation); adding action buttons clutters it.

On success: toast → `navigate(routes.wallets, { replace: true })` so the back button doesn't return the user to a 404 page.

## 5. Risks

| Risk                                                                                                                      | Severity   | Mitigation                                                                                                                                                                                                                                                                               |
| ------------------------------------------------------------------------------------------------------------------------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A wallet with >99 transactions hits the TransactWriteItems limit mid-cascade. Partial state.                              | Medium     | Chunk-and-retry algorithm (§4.3). Partial cascade is recoverable on retry. Errors propagate to the UI as toast; the user retries delete.                                                                                                                                                 |
| The cascade query (`listByWallet` paginated) is expensive for very large wallets.                                         | Low        | Pagination is bounded; cost is `O(tx-count)` reads. Personal-use scale is small.                                                                                                                                                                                                         |
| The currency-lock check has a TOCTOU window between the probe and the persist. Another tab adds a transaction in the gap. | Low        | Same accepted trade-off as `category-delete-guard` §4.2. Personal-use, single user — window of milliseconds. The persisted state will be "currency changed and now there's a transaction in the old currency" — a real but extremely rare data-integrity bug. Documented; not mitigated. |
| The frontend's optimistic invalidation could surface a "wallet deleted, transactions still loading" flash.                | Low        | Invalidate before navigation. The `/wallets` page refetches cleanly.                                                                                                                                                                                                                     |
| The `Wallet.softDelete()` method stays in the codebase unused.                                                            | Low (debt) | Kept intentionally — see `Transaction.softDelete()` precedent. Audit/undo features may reuse it.                                                                                                                                                                                         |
| `EditWalletPage` and `EditTransactionPage` diverge over time.                                                             | Low        | Both small; not worth abstracting today. If a third edit-page lands, factor a shared shell.                                                                                                                                                                                              |

## 6. Success Criteria

1. `PATCH /wallets/{walletId}` with `{ "name": "New name" }` returns 200 with the updated wallet body. List query shows the new name on refetch.
2. `PATCH /wallets/{walletId}` with `{ "currency": "PEN" }` on an EMPTY wallet returns 200 and the wallet's currency is now PEN.
3. `PATCH /wallets/{walletId}` with `{ "currency": "PEN" }` on a wallet with transactions returns `409 wallet_currency_locked`. The wallet is unchanged.
4. `PATCH /wallets/{walletId}` with `{}` returns 400.
5. `PATCH /wallets/{walletId}` with `{ "balance": "999" }` returns 400 (unknown / immutable field).
6. `DELETE /wallets/{walletId}` returns 204 and the wallet AND all its transactions are gone from DynamoDB. `GET /wallets` no longer includes it. `GET /wallets/{wid}/transactions` returns 404.
7. A second `DELETE /wallets/{walletId}` returns 404.
8. The frontend renders an edit page with the currency field disabled and a helper when the wallet has transactions.
9. The frontend's delete dialog cannot be dismissed during the in-flight request.
10. On successful delete, the user is navigated to `/wallets` and a success toast appears.
11. `pnpm typecheck` is green across shared-types, domain, api, infra-sls, and web.
12. Local smoke against the dev server covers all eight scenarios above (4 backend + 4 UI flows).
