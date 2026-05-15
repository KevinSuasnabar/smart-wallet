# Spec: transaction-edit-delete

> SDD phase: spec
> Project: smart-wallet
> Change: transaction-edit-delete
> Date: 2026-05-15
> Engram topic_key: `sdd/transaction-edit-delete/spec`

---

## 1. Glossary

| Term | Definition |
|------|------------|
| **Mutable fields** | The subset of a transaction's fields that PATCH may modify: `amount`, `description`, `categoryId`, `occurredAt`. Explicitly excludes `type`, `walletId`, `currency`, `userId`, `createdAt`, `transactionId`, and `updatedAt` (which the server controls). |
| **Original delta** | The signed balance delta of a transaction at the moment it was created: `+amountCents` for income, `-amountCents` for expense. Stored implicitly via `(type, amount)` on the transaction row. |
| **Adjustment** | The signed integer added to `wallet.balance` during PATCH or DELETE. For PATCH: `newDelta - oldDelta`. For DELETE: `-originalDelta`. |
| **Hard delete** | DynamoDB `DeleteItem` removing the transaction row entirely. The `deletedAt` field on the entity is NOT used by this change (see proposal §4.1). |
| **Idempotency-Key (PATCH)** | Optional HTTP header on PATCH. When present, the server computes `SHA-256(userId:walletId:transactionId:key)` and uses the same 3-op TransactWriteItems pattern as `addIdempotent`, returning 200 with current state on replay. |
| **Idempotency-Key (DELETE)** | Optional HTTP header on DELETE. **Accepted but ignored** server-side — DELETE is naturally idempotent at HTTP level. |
| **TransactionIdPathSchema** | New Zod schema validating `{ walletId: UUID v4, transactionId: UUID v4 }` from `event.pathParameters`. |
| **UpdateTransactionRequestSchema** | New Zod schema. All four mutable fields optional. At least one must be present (`.refine` rule). Same primitive validators as `AddTransactionRequestSchema`. |
| **Wallet liveness check** | Both PATCH and DELETE require the parent wallet to be active (`deletedAt IS NULL`). Enforced by the `ConditionExpression` `attribute_not_exists(deletedAt)` on the wallet Update item in TransactWriteItems. Mirrors `addIdempotent`. |
| **EditTransactionPage** | New React page at route `/wallets/:walletId/transactions/:transactionId/edit`. Loads the existing transaction, renders `TransactionForm` with `mode='edit'` and `initialValues`, submits PATCH. |
| **Mode `edit`** | A new optional prop on `TransactionForm` that disables the `type` selector and the wallet selector (cannot change either per proposal §3), changes the submit-button copy, and pre-populates fields from `initialValues`. |
| **Action row** | Two icon buttons (pencil + trash) attached to every `TransactionListItem` rendered in the `TransactionList` and `RecentTransactionsList` components. Minimum touch target 44×44 per existing REQ-UI-01. |

---

## 2. Requirements

### Backend — PATCH endpoint (BE-PATCH)

- **REQ-BE-PATCH-01**: The server accepts `PATCH /wallets/{walletId}/transactions/{transactionId}` with the standard Cognito JWT authorizer. Unauthenticated requests return 401.
- **REQ-BE-PATCH-02**: The path is validated against `TransactionIdPathSchema`. `walletId` and `transactionId` must be UUID v4. 400 on invalid format.
- **REQ-BE-PATCH-03**: The body is validated against `UpdateTransactionRequestSchema`. All four mutable fields are optional but at least one must be present. 400 on empty body or schema mismatch.
- **REQ-BE-PATCH-04**: If the request body contains any non-mutable field (`type`, `walletId`, `currency`, `userId`, `createdAt`, `transactionId`, `updatedAt`), the server returns 400 with reason `immutable_field`. The schema strips unknown keys via `z.object().strict()`.
- **REQ-BE-PATCH-05**: The use case `UpdateTransaction` loads the transaction by `(userId, transactionId)`. If not found, returns `TransactionNotFound` → 404.
- **REQ-BE-PATCH-06**: The use case loads the parent wallet. If the wallet is not found OR has `deletedAt != null`, returns `WalletNotFound` → 404. The handler maps this to 404 regardless of whether wallet or transaction is missing (no info leak).
- **REQ-BE-PATCH-07**: If `categoryId` is in the request body, the use case validates the new category via `categoryRepo.validateCategoryForTransaction()` against the transaction's existing `type`. On mismatch returns `CategoryTypeMismatch` → 409. On not-found returns `CategoryNotFound` → 404.
- **REQ-BE-PATCH-08**: If `amount` is in the request body, it is parsed via `parseAmountForCurrency(amount, wallet.currency)`. Zero or negative cents returns 400 `invalid_amount`.
- **REQ-BE-PATCH-09**: If `occurredAt` is in the request body, it must fall within `[now - 5 years, now + 1 day]`. Out of range returns 400 `invalid_occurred_at`.
- **REQ-BE-PATCH-10**: If `description` is in the request body, its length must be `0..256`. The empty string normalizes to `null`. 400 on overflow.
- **REQ-BE-PATCH-11**: The use case computes `adjustment = newDelta - oldDelta` where `oldDelta` is the existing transaction's signed amount and `newDelta` is the post-edit signed amount. If `amount` is unchanged in the body, `newDelta == oldDelta` and `adjustment == 0`.
- **REQ-BE-PATCH-12**: Persistence is a single `TransactWriteItems` containing: [0] `Update` on the transaction row applying the body diff and bumping `updatedAt`, [1] `Update` on the wallet row applying `balance += adjustment` and bumping `updatedAt`, with the wallet liveness ConditionExpression. All-or-nothing.
- **REQ-BE-PATCH-13**: On success, the server returns 200 with the full updated `TransactionResponseDTO` (same shape as POST response). Fields not in the body retain their pre-edit values.
- **REQ-BE-PATCH-14**: If the request includes a valid `Idempotency-Key` header (1–128 chars), the use case takes the idempotent path: compute hash, perform a 3-op TransactWriteItems mirror of `addIdempotent`, write an IdempotencyRecord with 24h TTL. The IdempotencyRecord stores `transactionSK` to support replay reads.
- **REQ-BE-PATCH-15**: On idempotent replay (same hash within TTL), the server returns 200 with the recorded transaction state at the time of the original write. The wallet balance is NOT mutated again.
- **REQ-BE-PATCH-16**: Idempotency-Key with length outside [1, 128] returns 400 `invalid_idempotency_key`.

### Backend — DELETE endpoint (BE-DELETE)

- **REQ-BE-DELETE-01**: The server accepts `DELETE /wallets/{walletId}/transactions/{transactionId}` with the Cognito JWT authorizer. Unauthenticated requests return 401.
- **REQ-BE-DELETE-02**: The path is validated against `TransactionIdPathSchema`. 400 on invalid format.
- **REQ-BE-DELETE-03**: The use case `DeleteTransaction` loads the transaction by `(userId, transactionId)`. If not found, returns `TransactionNotFound` → 404.
- **REQ-BE-DELETE-04**: The use case loads the parent wallet. If not found or `deletedAt != null`, returns `WalletNotFound` → 404 (same no-info-leak rule as PATCH).
- **REQ-BE-DELETE-05**: The use case computes `adjustment = -originalDelta` (reverse the original transaction's balance impact).
- **REQ-BE-DELETE-06**: Persistence is a single `TransactWriteItems` containing: [0] `Delete` on the transaction row with `ConditionExpression: attribute_exists(PK) AND attribute_exists(SK)` (so a concurrent delete returns a TransactionCanceledException that the use case maps to `TransactionNotFound`), [1] `Update` on the wallet row applying `balance += adjustment` and bumping `updatedAt`, with the wallet liveness ConditionExpression.
- **REQ-BE-DELETE-07**: On success, the server returns 204 No Content. Body is empty.
- **REQ-BE-DELETE-08**: The `Idempotency-Key` header is accepted but not used. No IdempotencyRecord is written. Length validation (1–128 chars) is still enforced — out-of-range returns 400 `invalid_idempotency_key`, same as PATCH.

### Backend — Domain model and repository (BE-DOM)

- **REQ-BE-DOM-01**: A new use case `UpdateTransaction` lives at `packages/domain/src/transaction/usecases/UpdateTransaction.ts`. Factory `makeUpdateTransaction(deps): (input) => Promise<Result<...>>` mirrors the shape of `makeAddTransaction`.
- **REQ-BE-DOM-02**: A new use case `DeleteTransaction` lives at `packages/domain/src/transaction/usecases/DeleteTransaction.ts` with the same factory shape.
- **REQ-BE-DOM-03**: `TransactionRepository` (interface) gains three methods:
  - `update(input: UpdateTransactionPersistInput): Promise<void>`
  - `updateIdempotent(input: UpdateIdempotentInput): Promise<Result<{ transaction: Transaction; replay: boolean }, ...>>`
  - `hardDelete(input: HardDeleteInput): Promise<void>`
- **REQ-BE-DOM-04**: `DynamoDBTransactionRepository` implements all three. `update` is 2-op TransactWriteItems, `updateIdempotent` is 3-op, `hardDelete` is 2-op. Error narrowing reuses the existing `TransactionCanceledException` parser.
- **REQ-BE-DOM-05**: A new domain error `TransactionNotFound` lives in `packages/domain/src/transaction/TransactionError.ts`. Mapped to HTTP 404 in `domainErrorToResponse`.
- **REQ-BE-DOM-06**: The existing `Transaction.softDelete()` method is NOT removed and NOT called by this change (per proposal §4.1).
- **REQ-BE-DOM-07**: The composition `container.ts` exposes `updateTransaction` and `deleteTransaction` factories wired with the same shared singletons (`walletRepo`, `transactionRepo`, `categoryRepo`, `clock`).
- **REQ-BE-DOM-08**: `Transaction` gains a domain method `applyEdits(edits: PartialEdits, clock: Clock): Result<Transaction, TransactionError>` that returns a new (or mutated) entity with the post-edit field values + bumped `updatedAt`. All field-level validators (description length, occurredAt range) run inside this method. The use case calls this before persistence.

### Backend — Shared types (BE-DTO)

- **REQ-BE-DTO-01**: `packages/shared-types/src/schemas/transaction.ts` exports `UpdateTransactionRequestSchema` as a `z.object({...}).strict().refine(...)` where:
  - `amount: zDecimalString.optional()`
  - `description: z.string().max(256).optional()` (the empty string is allowed and means "clear to null")
  - `categoryId: zCategoryIdLike.optional()`
  - `occurredAt: zOccurredAt.optional()`
  - `.refine` ensures at least one field is present.
  - `.strict` rejects unknown keys (REQ-BE-PATCH-04).
- **REQ-BE-DTO-02**: `packages/shared-types/src/schemas/transaction.ts` exports `TransactionIdPathSchema = z.object({ walletId: z.string().uuid(), transactionId: z.string().uuid() })`.
- **REQ-BE-DTO-03**: DTO type aliases `UpdateTransactionDTO` and `TransactionIdPathDTO` are exported alongside the schemas.
- **REQ-BE-DTO-04**: No changes to `AddTransactionRequestSchema` or `TransactionResponseSchema`.

### Backend — Routes (BE-ROUTES)

- **REQ-BE-ROUTES-01**: `packages/infra-sls/serverless.yml` defines two new functions matching the existing pattern:
  ```yaml
  patchTransaction:
    handler: src/handlers/transaction/patchTransaction.main
    events:
      - httpApi:
          path: /wallets/{walletId}/transactions/{transactionId}
          method: patch
          authorizer: { name: cognitoJwt }
  deleteTransaction:
    handler: src/handlers/transaction/deleteTransaction.main
    events:
      - httpApi:
          path: /wallets/{walletId}/transactions/{transactionId}
          method: delete
          authorizer: { name: cognitoJwt }
  ```
- **REQ-BE-ROUTES-02**: The serverless CORS config already includes `DELETE` in `allowedMethods` (existing config). `PATCH` MUST be added if not already present.

### Frontend — UI affordances (FE-UI)

- **REQ-FE-UI-01**: Every `TransactionListItem` renders an action row containing two icon buttons: a pencil icon (edit) and a trash icon (delete). Both are positioned to the right of the amount, aligned vertically with the content. Minimum touch target 44×44 (REQ-UI-01).
- **REQ-FE-UI-02**: The pencil button navigates to `/wallets/{walletId}/transactions/{transactionId}/edit`. The trash button opens a confirmation dialog.
- **REQ-FE-UI-03**: The delete confirmation dialog uses the existing `Dialog` primitive and shows: title "Eliminar movimiento", body "Esta acción no se puede deshacer. El saldo de la billetera se ajustará automáticamente.", actions "Cancelar" (closes) and "Eliminar" (destructive button, confirms).
- **REQ-FE-UI-04**: While the delete mutation is in flight, the "Eliminar" button shows `t.app.loading` ("Cargando…") and is disabled. The "Cancelar" button is disabled. The dialog cannot be dismissed by overlay click or Escape during the request.
- **REQ-FE-UI-05**: The action row is also rendered by `RecentTransactionsList` (the truncated list shown on `WalletDetailPage`).

### Frontend — Edit page (FE-EDIT)

- **REQ-FE-EDIT-01**: A new route `/wallets/:walletId/transactions/:transactionId/edit` resolves to `EditTransactionPage` inside the protected `AppLayout`.
- **REQ-FE-EDIT-02**: `EditTransactionPage` loads the transaction via a new TanStack query `useTransaction(walletId, transactionId)`. Loading state shows a `Skeleton`; error state shows an `ErrorState` with a "Volver" link.
- **REQ-FE-EDIT-03**: On successful load, the page renders `TransactionForm` with `mode='edit'` and `initialValues` populated from the loaded transaction.
- **REQ-FE-EDIT-04**: In `mode='edit'`, the `TransactionForm` disables the `type` selector and the wallet selector. The submit button shows the i18n string `t.transactions.editSubmit` ("Guardar cambios").
- **REQ-FE-EDIT-05**: On submit, the form computes a diff (only fields whose value differs from `initialValues`) and sends a PATCH with that diff. If no fields changed, the form does NOT submit; instead, a toast "No hay cambios" appears (no network request, no state mutation).
- **REQ-FE-EDIT-06**: A fresh UUID v4 `Idempotency-Key` is attached to every submit attempt. If the user retries (manual second submit), a NEW key is generated — the server treats the retry as a separate write because the input changed (a retry implies user intent for a fresh apply, not a replay).
- **REQ-FE-EDIT-07**: On success: success toast "Movimiento actualizado", query invalidations (see FE-INV), and navigate back to the previous list (the wallet detail page or the transactions list, depending on where the user came from — use React Router's `location.state.from` like `LoginPage` does).
- **REQ-FE-EDIT-08**: On 404 (transaction was deleted between load and submit), an error toast "Este movimiento ya no existe" appears and the page navigates back to the wallet detail.
- **REQ-FE-EDIT-09**: On 409 `category_type_mismatch`, an error toast appears under the category field via `form.setError`; the page does not navigate.
- **REQ-FE-EDIT-10**: On other errors, the toast uses the existing `userMessageFor(err)` mapping.

### Frontend — TanStack queries (FE-QUERY)

- **REQ-FE-QUERY-01**: A new query hook `useTransaction(walletId, transactionId)` is added to `features/transactions/queries.ts`. Key: `['transactions', 'detail', walletId, transactionId]`. Fetcher: `transactionsApi.getTransaction(walletId, transactionId)`.
- **REQ-FE-QUERY-02**: A new mutation hook `useUpdateTransaction()` is added. On success, it invalidates: `['transactions']` (broad — catches both by-wallet and by-category lists) and `['wallets']` (balance changed in both list view and detail).
- **REQ-FE-QUERY-03**: A new mutation hook `useDeleteTransaction()` is added with the same invalidations as `useUpdateTransaction`.
- **REQ-FE-QUERY-04**: Neither mutation uses optimistic updates. The previous list/detail values stay until the refetch returns (skeleton flashing acceptable for personal use; better than a race-conditioned stale balance).

### Frontend — API client (FE-API)

- **REQ-FE-API-01**: `transactionsApi.updateTransaction(args: { walletId, transactionId, body })` issues `PATCH /wallets/{walletId}/transactions/{transactionId}` with body and a generated `Idempotency-Key` header. Returns the typed `TransactionResponseDTO`.
- **REQ-FE-API-02**: `transactionsApi.deleteTransaction(args: { walletId, transactionId })` issues `DELETE /wallets/{walletId}/transactions/{transactionId}`. Returns void.
- **REQ-FE-API-03**: `transactionsApi.getTransaction(walletId, transactionId)` issues `GET /wallets/{walletId}/transactions/{transactionId}`. **Note**: this read endpoint does not exist on the backend today. We do NOT need to add it — instead, `useTransaction` is implemented as `select` over the cached list query if available, and falls back to refetching the list with a filter. **OR** the design phase chooses to add `GET /wallets/{walletId}/transactions/{transactionId}` as a third endpoint in this change. The spec defers this decision to design.

### Frontend — Invalidations (FE-INV)

- **REQ-FE-INV-01**: On successful PATCH or DELETE, the following query keys are invalidated:
  - `['transactions']` — covers both `transactionsByWallet` and `transactionsByCategory` infinite queries.
  - `['wallets']` — covers the wallet list and any wallet detail.
- **REQ-FE-INV-02**: The dashboard (future) and any other consumer of transactions or wallets relies on the broad `['transactions']` and `['wallets']` invalidation prefixes — no additional invalidations are required from this change.

### Frontend — i18n (FE-I18N)

- **REQ-FE-I18N-01**: New strings under `t.transactions`:
  - `editTitle`: "Editar movimiento"
  - `editSubmit`: "Guardar cambios"
  - `editSuccess`: "Movimiento actualizado"
  - `editNoChanges`: "No hay cambios"
  - `editNotFound`: "Este movimiento ya no existe"
  - `deleteDialogTitle`: "Eliminar movimiento"
  - `deleteDialogBody`: "Esta acción no se puede deshacer. El saldo de la billetera se ajustará automáticamente."
  - `deleteDialogConfirm`: "Eliminar"
  - `deleteSuccess`: "Movimiento eliminado"

### Frontend — Form behavior (FE-FORM)

- **REQ-FE-FORM-01**: `TransactionForm` accepts two new optional props: `mode?: 'add' | 'edit'` (default `'add'`) and `initialValues?: Partial<AddTransactionDTO>`.
- **REQ-FE-FORM-02**: When `mode === 'edit'`:
  - The `type` `Select` is `disabled`.
  - The wallet `WalletSelect` is `disabled`.
  - The submit button label is `t.transactions.editSubmit`.
  - The form's `defaultValues` are the merge of `initialValues` over the existing defaults.
- **REQ-FE-FORM-03**: When `mode === 'add'`, behavior is identical to today (no regression).
- **REQ-FE-FORM-04**: The page that uses `TransactionForm` in edit mode is responsible for the diff-and-PATCH logic (REQ-FE-EDIT-05). The form itself remains a "submit all values" component — keeping it simple.

---

## 3. Scenarios

### SCN-BE-PATCH-OK: Successful field update

**Given** an existing transaction T (type=expense, amount=100.00 USD, in wallet W with balance −500.00 USD),
**When** the user PATCHes T with `{ amount: "120.00" }`,
**Then** the server returns 200 with T's new state (amount=120.00, updatedAt bumped), and `W.balance` is now −520.00 USD (oldDelta=−10000¢, newDelta=−12000¢, adjustment=−2000¢).

### SCN-BE-PATCH-NOOP: PATCH with same value is a no-op for balance

**Given** an existing transaction T with amount=100.00,
**When** the user PATCHes T with `{ description: "Almuerzo en Pollería" }` (no amount change),
**Then** the server returns 200, T's description is updated, T's `updatedAt` is bumped, and the wallet's balance is unchanged (adjustment=0).

### SCN-BE-PATCH-NOT-FOUND: PATCH a deleted transaction

**Given** a transaction T that was DELETEd 1 minute ago,
**When** the user PATCHes T,
**Then** the server returns 404 with `code: TransactionNotFound`. The wallet balance is not touched.

### SCN-BE-PATCH-CATEGORY-MISMATCH: Cross-type category

**Given** an existing expense transaction T and an income-type category C-income,
**When** the user PATCHes T with `{ categoryId: C-income.id }`,
**Then** the server returns 409 with `code: CategoryTypeMismatch`. T is unchanged.

### SCN-BE-PATCH-REPLAY: Idempotent retry

**Given** the user PATCHes T with body B and `Idempotency-Key: abc123` and the server returns 200 with state S,
**When** the user submits the same PATCH with the same key (network retry) within 24h,
**Then** the server returns 200 with state S, no new write, no balance change.

### SCN-BE-PATCH-CONCURRENT: Two PATCHes, different keys, last wins

**Given** the user PATCHes T at time t1 with body B1 and key K1, then at t2 > t1 with body B2 and key K2,
**When** both arrive serialized at DynamoDB,
**Then** the final state is B2 (last write wins) and the wallet balance reflects the adjustments of both writes accumulated.

### SCN-BE-PATCH-EMPTY-BODY: Empty body rejected

**Given** a valid path,
**When** the user PATCHes with `{}`,
**Then** the server returns 400 with `code: validation_error`, detail "at least one mutable field required".

### SCN-BE-PATCH-IMMUTABLE-FIELD: Unknown / immutable key

**Given** a valid path,
**When** the user PATCHes with `{ "type": "income" }`,
**Then** the server returns 400 with `code: validation_error` (strict schema rejection). The transaction is unchanged.

### SCN-BE-DELETE-OK: Successful delete

**Given** an existing expense transaction T (amount=100.00 USD) in wallet W (balance=−500.00 USD),
**When** the user DELETEs T,
**Then** the server returns 204, T no longer exists in DynamoDB, and `W.balance` is now −400.00 USD (reversed delta = +10000¢).

### SCN-BE-DELETE-IDEMPOTENT: Second DELETE returns 404

**Given** the user DELETEs T successfully,
**When** the user DELETEs T a second time,
**Then** the server returns 404 with `code: TransactionNotFound`. The wallet balance is not changed.

### SCN-BE-DELETE-WALLET-DEAD: Cannot delete from a soft-deleted wallet

**Given** a transaction T in a wallet W that was soft-deleted,
**When** the user DELETEs T,
**Then** the server returns 404 (no-info-leak; the user shouldn't be reasoning about wallet state from this endpoint).

---

### SCN-FE-EDIT-FLOW: User edits a transaction

**Given** a signed-in user on the transactions list of wallet W with transaction T (amount=100.00 USD, description="Almuerzo"),
**When** the user taps the pencil icon next to T,
**Then** the app navigates to `/wallets/W.id/transactions/T.id/edit`, the form is pre-populated with T's current values, the `type` selector is disabled, and the wallet selector is disabled.

**When** the user changes the amount to "120.00" and submits,
**Then** the PATCH succeeds (REQ-BE-PATCH-12), a toast "Movimiento actualizado" appears, the wallet balance refetches and shows the new value, and the user is navigated back to the previous list.

### SCN-FE-EDIT-NO-CHANGES: Submit without modifying any field

**Given** the user is on the edit page and has not changed any field,
**When** the user submits,
**Then** no network request is sent, a toast "No hay cambios" appears, and the page stays on the edit form.

### SCN-FE-EDIT-CONCURRENT-DELETE: Transaction deleted between load and submit

**Given** the user opens the edit page for transaction T,
**When** another tab (or the user, with two devices) DELETEs T, and the user tries to submit the edit form,
**Then** the server returns 404, an error toast "Este movimiento ya no existe" appears, and the page navigates back to the wallet detail.

### SCN-FE-DELETE-FLOW: User deletes a transaction

**Given** a signed-in user on the transactions list,
**When** the user taps the trash icon next to T,
**Then** a `Dialog` opens with title "Eliminar movimiento", body explaining the balance will adjust, and two buttons: "Cancelar" and "Eliminar" (destructive).

**When** the user taps "Eliminar",
**Then** the DELETE request is sent, the dialog buttons disable while in-flight, on success the dialog closes, a toast "Movimiento eliminado" appears, T is removed from the list (via invalidation refetch), and the wallet balance updates.

### SCN-FE-DELETE-CANCEL: User dismisses the confirmation

**Given** the user has opened the delete confirmation dialog,
**When** the user taps "Cancelar" or presses Escape,
**Then** the dialog closes, no network request is sent, and the transaction list is unchanged.

### SCN-FE-DELETE-IN-FLIGHT-PROTECT: Cannot dismiss during in-flight delete

**Given** the user has confirmed delete and the request is in flight,
**When** the user presses Escape or clicks the overlay,
**Then** the dialog stays open, both buttons remain disabled, and the user must wait for the request to settle.
