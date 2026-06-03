# Spec: wallet-edit-delete

> SDD phase: spec
> Project: smart-wallet
> Change: wallet-edit-delete
> Date: 2026-05-15
> Engram topic_key: `sdd/wallet-edit-delete/spec`

---

## 1. Glossary

| Term                            | Definition                                                                                                                                                                          |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Mutable wallet fields**       | The subset of a wallet's fields that PATCH may modify: `name`, `currency`. Excludes `walletId`, `userId`, `balance`, `createdAt`, `updatedAt`, `deletedAt`.                         |
| **Currency-lock**               | A wallet's currency cannot be changed once it has at least one active transaction. Detected via `transactionRepo.listByWallet(userId, walletId, { limit: 1 })`.                     |
| **Active transaction**          | A transaction whose `deletedAt` is absent (the project hard-deletes transactions, so this is the only kind).                                                                        |
| **Cascade hard-delete**         | Removing a wallet item AND every transaction item belonging to it in a single logical operation. Implemented as chunked `TransactWriteItems` (≤ 99 tx ops + 1 wallet op per chunk). |
| **`WalletCurrencyLocked`**      | New domain error. `tag: 'domain.wallet.currency_locked'`, `httpStatus: 409`.                                                                                                        |
| **`UpdateWalletRequestSchema`** | New Zod schema. All fields optional, `.strict()` rejects unknown keys, `.refine()` requires at-least-one.                                                                           |

---

## 2. Requirements

### Domain layer (WAL-DOM)

- **REQ-WAL-DOM-01**: `Wallet` gains a method `applyEdits(edits: { name?: string; currency?: string }, clock: Clock): Result<void, WalletError>`. Validates each provided field with the existing validators (name 1–64 chars trimmed; currency in `VALID_CURRENCIES`). On any field failure, rolls back the entity to its pre-call state.
- **REQ-WAL-DOM-02**: `Wallet.applyEdits` does NOT check "is this wallet allowed to change currency given its transactions?" — that's a use-case concern (the entity doesn't know about transactions).
- **REQ-WAL-DOM-03**: A new error class `WalletCurrencyLocked` lives in `packages/domain/src/wallet/WalletError.ts`. `tag: 'domain.wallet.currency_locked' as const`, `httpStatus: 409 as const`. Default message: `'Cannot change currency of a wallet with transactions'`. Joins the `WalletError` union.
- **REQ-WAL-DOM-04**: A new use case `UpdateWallet` (in `packages/domain/src/wallet/usecases/`) takes deps `{ walletRepo, transactionRepo, clock }` and input `{ userId, walletId, edits: { name?, currency? } }`. Returns `Result<Wallet, WalletError | UserError>`. Steps:
  1. Validate `userId` + `walletId` VOs.
  2. Load wallet; if null or `deletedAt != null`, return `WalletNotFound`.
  3. If `edits.currency` is present AND differs from `wallet.currency`, query `transactionRepo.listByWallet(userId, walletId, { limit: 1 })`. If `items.length > 0`, return `WalletCurrencyLocked`.
  4. Call `wallet.applyEdits(edits, clock)`. Propagate errors.
  5. Call `walletRepo.update(wallet)`.
  6. Return `ok(wallet)`.
- **REQ-WAL-DOM-05**: A new use case `DeleteWallet` (in same dir) takes deps `{ walletRepo, clock }` and input `{ userId, walletId }`. Returns `Result<void, WalletError | UserError>`. Steps:
  1. Validate `userId` + `walletId` VOs.
  2. Load wallet; if null or `deletedAt != null`, return `WalletNotFound`.
  3. Call `walletRepo.hardDeleteWithTransactions(userId, walletId)`.
  4. Return `ok(undefined)`.
- **REQ-WAL-DOM-06**: The existing `Wallet.softDelete` method is NOT removed and is NOT called by this change.

### Repository (WAL-REPO)

- **REQ-WAL-REPO-01**: `WalletRepository` interface gains `update(wallet: Wallet): Promise<void>`. The DynamoDB implementation uses a `PutCommand` with `ConditionExpression: 'attribute_exists(PK)'` so a vanished wallet surfaces as an error (caught by the use case via try/catch or upstream).
- **REQ-WAL-REPO-02**: `WalletRepository` interface gains `hardDeleteWithTransactions(userId: UserId, walletId: WalletId): Promise<void>`. The DynamoDB implementation:
  1. Paginated Query for all SKs starting with `TXN#{walletId}#` under `PK = USER#{userId}`.
  2. Chunks the SKs into groups of 99.
  3. For each non-final chunk: `TransactWriteItems[Delete tx for each SK]`.
  4. For the final chunk: `TransactWriteItems[Delete tx for each SK in chunk, Delete wallet]`. The wallet Delete has `ConditionExpression: attribute_exists(PK)`.
  5. If the wallet has zero transactions: a single `TransactWriteItems[Delete wallet]`.
- **REQ-WAL-REPO-03**: If the wallet Delete in the final chunk fails because the wallet doesn't exist (concurrent deletion), the repo propagates the `TransactionCanceledException`. The use case maps it to `WalletNotFound`.
- **REQ-WAL-REPO-04**: The repo does NOT attempt to revert deleted transaction chunks on later-chunk failure. A retry is the user's recourse.

### Composition (WAL-COMP)

- **REQ-WAL-COMP-01**: `container.ts` exposes:
  - `updateWallet: makeUpdateWallet({ walletRepo, transactionRepo, clock })`
  - `deleteWallet: makeDeleteWallet({ walletRepo, clock })`

### HTTP handlers (WAL-HTTP)

- **REQ-WAL-HTTP-01**: New handler `patchWallet.ts` at `packages/api/src/handlers/wallet/`. Middleware chain `withErrorHandler(withAuth(handler))`. Validates path via `WalletIdPathSchema` and body via `UpdateWalletRequestSchema`. Calls `container.updateWallet`. On success returns 200 with the updated wallet DTO.
- **REQ-WAL-HTTP-02**: `patchWallet.ts` maps domain errors:
  - `WalletNotFound` → 404 (`wallet_not_found`)
  - `WalletCurrencyLocked` → 409 (`wallet_currency_locked`)
  - `InvalidWalletName` / `InvalidWalletCurrency` → 400 (passed through `domainErrorToResponse`)
- **REQ-WAL-HTTP-03**: New handler `deleteWallet.ts`. Validates path via `WalletIdPathSchema`. Calls `container.deleteWallet`. On success returns 204 No Content. `WalletNotFound` → 404 (`wallet_not_found`).
- **REQ-WAL-HTTP-04**: Both handlers add re-export shims in `packages/infra-sls/src/handlers/wallet/` (matching the existing pattern).

### Shared types (WAL-DTO)

- **REQ-WAL-DTO-01**: `UpdateWalletRequestSchema` exported from `packages/shared-types/src/schemas/wallet.ts`:
  ```ts
  z.object({
    name: z.string().trim().min(1).max(64).optional(),
    currency: zCurrency.optional(),
  })
    .strict()
    .refine((d) => d.name !== undefined || d.currency !== undefined, {
      message: 'At least one mutable field must be provided',
    });
  ```
- **REQ-WAL-DTO-02**: `UpdateWalletDTO` exported as `z.infer<typeof UpdateWalletRequestSchema>`. Re-exported from `packages/shared-types/src/index.ts`.
- **REQ-WAL-DTO-03**: No changes to `CreateWalletRequestSchema`, `WalletResponseSchema`, `WalletIdPathSchema`.

### Routes (WAL-ROUTES)

- **REQ-WAL-ROUTES-01**: `serverless.yml` adds:
  ```yaml
  patchWallet:
    handler: src/handlers/wallet/patchWallet.main
    events:
      - httpApi:
          path: /wallets/{walletId}
          method: patch
          authorizer: { name: cognitoJwt }
  deleteWallet:
    handler: src/handlers/wallet/deleteWallet.main
    events:
      - httpApi:
          path: /wallets/{walletId}
          method: delete
          authorizer: { name: cognitoJwt }
  ```
- **REQ-WAL-ROUTES-02**: CORS `allowedMethods` already includes `PATCH` and `DELETE` (added in `transaction-edit-delete`). No change.

### Frontend — pages (WAL-FE-PAGES)

- **REQ-WAL-FE-PAGES-01**: New route `/wallets/:walletId/edit` resolves to `EditWalletPage` inside the protected `AppLayout`.
- **REQ-WAL-FE-PAGES-02**: `EditWalletPage` loads the wallet via `useWallet(walletId)`. Loading state shows a small skeleton; error state shows `ErrorState` with retry.
- **REQ-WAL-FE-PAGES-03**: On loaded state, the page renders a form with two fields:
  - `name`: text input (1–64 chars).
  - `currency`: `CurrencySelect`. If the wallet has at least one transaction (queried via `useWalletTransactions(walletId, { limit: 1 })`), the field is **disabled** and a helper text appears below it: "No se puede cambiar la moneda porque la billetera tiene movimientos."
- **REQ-WAL-FE-PAGES-04**: Submit computes a diff vs the loaded wallet. If no fields changed, a toast `t.wallets.editNoChanges` appears and no request is sent.
- **REQ-WAL-FE-PAGES-05**: On success: toast `t.wallets.editSuccess`, navigate back (to `routes.walletDetail(walletId)` or `location.state.from` if present).
- **REQ-WAL-FE-PAGES-06**: On 404 (wallet was deleted between load and submit): toast `t.wallets.notFound`, navigate to `/wallets`.
- **REQ-WAL-FE-PAGES-07**: On 409 `wallet_currency_locked`: toast `t.wallets.currencyLockedError` ("No se puede cambiar la moneda…"). Form stays open with values intact.

### Frontend — affordances (WAL-FE-AFF)

- **REQ-WAL-FE-AFF-01**: `WalletDetailPage` renders two icon buttons in its top action bar (next to or near the back button): pencil → navigates to `/wallets/:walletId/edit` with `state.from = currentPath`; trash → opens `DeleteWalletDialog`.
- **REQ-WAL-FE-AFF-02**: `DeleteWalletDialog` is a controlled `Dialog` with title `t.wallets.deleteDialogTitle` ("Eliminar billetera"), body `t.wallets.deleteDialogBody` ("Esta acción eliminará la billetera y todos sus movimientos. No se puede deshacer."), Cancel + destructive Confirm buttons. While the DELETE request is in flight, both buttons disable and overlay/Escape dismissal is blocked.
- **REQ-WAL-FE-AFF-03**: On successful delete, the dialog closes, `toast.success(t.wallets.deleteSuccess)` fires, and the user is navigated to `routes.wallets` with `replace: true` so the back button does not return to the now-404 detail page.

### Frontend — queries (WAL-FE-Q)

- **REQ-WAL-FE-Q-01**: `walletsApi` gains `update(walletId: string, dto: UpdateWalletDTO): Promise<WalletResponseDTO>` (PATCH) and `remove(walletId: string): Promise<void>` (DELETE).
- **REQ-WAL-FE-Q-02**: `useUpdateWallet()` is a mutation. On success: invalidate `walletKeys.all`. On error: surface via `userMessageFor`.
- **REQ-WAL-FE-Q-03**: `useDeleteWallet()` is a mutation. On success: invalidate `walletKeys.all` AND `transactionKeys.all` (because cascade delete clears transactions; stale caches would otherwise show ghost rows).
- **REQ-WAL-FE-Q-04**: Neither mutation uses optimistic updates.

### Frontend — error mapping (WAL-FE-ERR)

- **REQ-WAL-FE-ERR-01**: `userMessageFor` in `lib/api/errors.ts` maps `err.code === 'wallet_currency_locked'` to `t.wallets.currencyLockedError`. Branch added before the status-based fallbacks.
- **REQ-WAL-FE-ERR-02**: `wallet_not_found` is not explicitly mapped — falls through to the generic `t.errors.notFound`. (The pages handle 404 explicitly with their own toast.)

### Frontend — i18n (WAL-FE-I18N)

- **REQ-WAL-FE-I18N-01**: New strings under `t.wallets` (Spanish neutro):
  - `editEyebrow: 'Editar'`
  - `editTitle: 'Editar billetera'`
  - `editSubmit: 'Guardar cambios'`
  - `editSuccess: 'Billetera actualizada'`
  - `editNoChanges: 'No hay cambios'`
  - `notFound: 'Esta billetera ya no existe'`
  - `currencyLockedHelper: 'No se puede cambiar la moneda porque la billetera tiene movimientos.'`
  - `currencyLockedError: 'No se puede cambiar la moneda porque la billetera tiene movimientos.'`
  - `deleteDialogTitle: 'Eliminar billetera'`
  - `deleteDialogBody: 'Esta acción eliminará la billetera y todos sus movimientos. No se puede deshacer.'`
  - `deleteDialogConfirm: 'Eliminar'`
  - `deleteSuccess: 'Billetera eliminada'`

---

## 3. Scenarios

### SCN-WAL-PATCH-NAME: Rename succeeds

**Given** a wallet W with name "Cash" and any number of transactions,
**When** the user `PATCH /wallets/{W.id}` with `{ "name": "Effective" }`,
**Then** the server returns 200 with W's body showing `name: "Effective"`, `updatedAt` bumped. Subsequent `GET /wallets` reflects the new name.

---

### SCN-WAL-PATCH-CURRENCY-EMPTY: Currency change on empty wallet

**Given** a wallet W with currency USD and zero transactions,
**When** the user `PATCH /wallets/{W.id}` with `{ "currency": "PEN" }`,
**Then** the server returns 200 with W's currency now PEN. A new transaction added next will be in PEN.

---

### SCN-WAL-PATCH-CURRENCY-LOCKED: Currency change on used wallet

**Given** a wallet W with currency USD and ≥ 1 active transaction,
**When** the user `PATCH /wallets/{W.id}` with `{ "currency": "PEN" }`,
**Then** the server returns 409 with `{ "error": "wallet_currency_locked" }`. W is unchanged.

---

### SCN-WAL-PATCH-BOTH: Rename and currency on empty wallet

**Given** a wallet W with name "Cash", currency USD, zero transactions,
**When** the user `PATCH /wallets/{W.id}` with `{ "name": "Soles", "currency": "PEN" }`,
**Then** the server returns 200 with W's name and currency both updated.

---

### SCN-WAL-PATCH-NOOP-CURRENCY: PATCH currency to the same value is a no-op

**Given** a wallet W with currency USD and ≥ 1 transaction,
**When** the user `PATCH /wallets/{W.id}` with `{ "currency": "USD" }`,
**Then** the server returns 200 (no transaction probe was run, no field actually changed). `updatedAt` advances.

---

### SCN-WAL-PATCH-EMPTY-BODY: Empty body rejected

**Given** a valid path,
**When** the user `PATCH /wallets/{W.id}` with `{}`,
**Then** the server returns 400 with a validation error.

---

### SCN-WAL-PATCH-IMMUTABLE: Body containing immutable field rejected

**Given** a valid path,
**When** the user `PATCH /wallets/{W.id}` with `{ "balance": "999.00" }`,
**Then** the server returns 400 (strict schema rejects unknown key `balance`).

---

### SCN-WAL-DEL-EMPTY: Delete empty wallet

**Given** a wallet W with zero transactions,
**When** the user `DELETE /wallets/{W.id}`,
**Then** the server returns 204. `GET /wallets` no longer includes W. `GET /wallets/{W.id}` returns 404.

---

### SCN-WAL-DEL-WITH-TX: Delete wallet with cascade

**Given** a wallet W with 5 active transactions,
**When** the user `DELETE /wallets/{W.id}`,
**Then** the server returns 204. The wallet item is gone from DynamoDB. All 5 transactions are gone. `GET /wallets/{W.id}/transactions` returns 404. `GET /wallets` no longer includes W.

---

### SCN-WAL-DEL-LARGE: Delete wallet with 250 transactions

**Given** a wallet W with 250 active transactions,
**When** the user `DELETE /wallets/{W.id}`,
**Then** the server runs ~3 `TransactWriteItems` calls (99 + 99 + (52+wallet)), succeeds end-to-end, returns 204. All 250 transactions and the wallet are gone.

---

### SCN-WAL-DEL-IDEMPOTENT: Second DELETE returns 404

**Given** a wallet W was just deleted,
**When** the user `DELETE /wallets/{W.id}` again,
**Then** the server returns 404 with `{ "error": "wallet_not_found" }`.

---

### SCN-WAL-FE-EDIT-FLOW: User edits a wallet name

**Given** a signed-in user on `/wallets/W.id`,
**When** they tap the pencil → the page navigates to `/wallets/W.id/edit`, the form is pre-populated, they change `name`, submit,
**Then** a toast "Billetera actualizada" appears, they navigate back to the detail page, the wallet shows the new name.

---

### SCN-WAL-FE-CURRENCY-LOCKED-UI: UI prevents impossible currency change

**Given** a wallet W with ≥ 1 transaction,
**When** the user opens the edit page,
**Then** the currency `Select` is disabled and a helper "No se puede cambiar la moneda…" is shown below it. The user cannot trigger the 409 path through the UI (defense in depth — the server still enforces it).

---

### SCN-WAL-FE-NO-CHANGES: Submit without modifying any field

**Given** the user is on the edit page and has not changed any field,
**When** they submit,
**Then** no network request is sent, a toast "No hay cambios" appears, the page stays.

---

### SCN-WAL-FE-DELETE-FLOW: User deletes a wallet

**Given** the user is on `/wallets/W.id`,
**When** they tap the trash icon → `DeleteWalletDialog` opens → they confirm,
**Then** the DELETE request fires, both dialog buttons disable, on 204 the dialog closes, a toast "Billetera eliminada" appears, the user is navigated to `/wallets` (history replace) and W is gone from the list.

---

### SCN-WAL-FE-DELETE-CANCEL: User cancels delete

**Given** the dialog is open,
**When** the user taps Cancel or presses Escape (before confirming),
**Then** the dialog closes; no request is sent; the wallet remains.

---

### SCN-WAL-FE-DELETE-PROTECTS-IN-FLIGHT: Dialog cannot be dismissed mid-request

**Given** the user has confirmed delete and the request is in flight,
**When** they press Escape or click the overlay,
**Then** the dialog stays open; both buttons remain disabled until the request settles.

---

### SCN-WAL-FE-EDIT-CONCURRENT-DELETE: Wallet vanishes between load and submit

**Given** the user opens the edit page,
**When** another tab DELETEs the wallet, and the first tab submits an edit,
**Then** the server returns 404, the toast `t.wallets.notFound` appears, the user is navigated to `/wallets`.
