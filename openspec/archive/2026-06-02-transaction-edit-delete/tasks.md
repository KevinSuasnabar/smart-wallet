# Tasks: transaction-edit-delete

> SDD phase: tasks
> Project: smart-wallet
> Change: transaction-edit-delete
> Date: 2026-05-15
> Engram topic_key: `sdd/transaction-edit-delete/tasks`

---

## Conventions

- `[ ]` = pending, `[x]` = completed
- Task ID: `T-{slice}-{nn}` (e.g., `T-01-03`)
- Each task: **Files**, **Deps**, **Acceptance** (REQ IDs + verification), **Est** (S ≤ 15 min, M 15–45 min, L 45–90 min)
- All user-facing copy in Spanish (voseo/rioplatense)

---

## Workload Forecast

| Metric                           | Estimate                                                                          |
| -------------------------------- | --------------------------------------------------------------------------------- |
| Total tasks                      | 22                                                                                |
| Total estimated time             | ~12–16 hours (solo dev, no tests)                                                 |
| Estimated changed lines (LOC)    | ~1015 (~450 PR1 + ~565 PR2)                                                       |
| Files created                    | 8 (3 use cases + 3 handlers + 1 page + 1 dialog)                                  |
| Files modified                   | 15 (entity, repo, container, schemas, serverless, form, list items, router, etc.) |
| **400-line budget risk**         | **HIGH** (already triggered Review Workload Guard)                                |
| **Chained PRs recommended**      | **Yes — 2-PR chain locked**                                                       |
| **Decision needed before apply** | **No** (delivery strategy resolved: backend → frontend)                           |

---

## Delivery plan

- **PR1 (slice 1)**: backend (shared-types + domain + api + serverless). Backend must be deployed to prod BEFORE PR2 is mergeable. User runs `pnpm deploy` after PR1 merges.
- **PR2 (slice 2)**: frontend UI. Depends on PR1 being deployed because the frontend hits real endpoints (or, optionally, the user tests PR2 locally against the prod backend before merging).

---

## Slice 1 — Backend (PR1)

### Foundation — shared types and domain errors (no behavior change yet)

- [ ] **T-01-01** Add `UpdateTransactionRequestSchema` and `TransactionIdPathSchema` to shared types
  - **Files**: `packages/shared-types/src/schemas/transaction.ts` (modified), `packages/shared-types/src/index.ts` (modified)
  - **Deps**: none
  - **Acceptance**: REQ-BE-DTO-01, REQ-BE-DTO-02, REQ-BE-DTO-03, REQ-BE-DTO-04. `z.object().strict()` rejects unknown fields. `.refine()` requires at least one. `pnpm --filter @smart-wallet/shared-types typecheck` green.
  - **Est**: S

- [ ] **T-01-02** Add `TransactionNotFound` to domain
  - **Files**: `packages/domain/src/transaction/TransactionError.ts` (modified), `packages/domain/src/transaction/index.ts` (modified)
  - **Deps**: none
  - **Acceptance**: REQ-BE-DOM-05. Class extends `TransactionError` with `httpStatus = 404` and `tag = 'TransactionNotFound'`. Exported. `pnpm --filter @smart-wallet/domain typecheck` green.
  - **Est**: S

### Entity additions

- [ ] **T-01-03** Add `applyEdits` and `signedDelta` methods to `Transaction`
  - **Files**: `packages/domain/src/transaction/Transaction.ts` (modified)
  - **Deps**: T-01-02 (uses `InvalidTransactionDescription`, `InvalidTransactionOccurredAt`)
  - **Acceptance**: REQ-BE-DOM-08. `applyEdits` validates description (≤ 256), occurredAt (−5y..+1d range). `signedDelta` returns positive for income, negative for expense. Existing tests (none) and typecheck pass.
  - **Est**: M

### Repository extensions

- [ ] **T-01-04** Extend `TransactionRepository` interface with `update`, `updateIdempotent`, `hardDelete`
  - **Files**: `packages/domain/src/transaction/TransactionRepository.ts` (modified)
  - **Deps**: T-01-02
  - **Acceptance**: REQ-BE-DOM-03. Interface adds the 3 method signatures + the 3 input interfaces. Domain typecheck green. DynamoDB impl will fail compile until T-01-05 lands (acceptable mid-slice).
  - **Est**: S

- [ ] **T-01-05** Implement `update`, `updateIdempotent`, `hardDelete` in `DynamoDBTransactionRepository`
  - **Files**: `packages/api/src/adapters/dynamodb/repositories/DynamoDBTransactionRepository.ts` (modified)
  - **Deps**: T-01-04
  - **Acceptance**: REQ-BE-DOM-04, REQ-BE-PATCH-12, REQ-BE-DELETE-06. 2-op `update` (tx Update + wallet Update), 3-op `updateIdempotent` (tx + wallet + IdempotencyRecord), 2-op `hardDelete` (tx Delete + wallet Update). Error narrowing via existing `isTransactionCanceledException` helper. `pnpm --filter @smart-wallet/api typecheck` green.
  - **Est**: L

### Idempotency helper extension (additive, non-breaking)

- [ ] **T-01-06** Extend `computeIdempotencyHash` with optional 4th arg `resourceId`
  - **Files**: `packages/api/src/shared/idempotency.ts` (modified)
  - **Deps**: none (parallel to T-01-05)
  - **Acceptance**: REQ-BE-PATCH-14. Signature: `(userId, walletId, key, resourceId?) => string`. When `resourceId` is present, hash is SHA-256(`userId:walletId:resourceId:key`).slice(0,32). Existing POST callers (no 4th arg) produce identical hashes to before. Add inline comment documenting the scope expansion.
  - **Est**: S

### Use cases

- [ ] **T-01-07** Create `GetTransaction` use case
  - **Files**: `packages/domain/src/transaction/usecases/GetTransaction.ts` (new), `packages/domain/src/transaction/index.ts` (re-export)
  - **Deps**: T-01-02
  - **Acceptance**: Use case validates UserId/TransactionId, calls `repo.findById`, returns `TransactionNotFound` if missing OR if transaction's walletId doesn't match input walletId (ownership/scope guard). Typecheck green.
  - **Est**: M

- [ ] **T-01-08** Create `UpdateTransaction` use case
  - **Files**: `packages/domain/src/transaction/usecases/UpdateTransaction.ts` (new), `packages/domain/src/transaction/index.ts` (re-export)
  - **Deps**: T-01-02, T-01-03, T-01-04
  - **Acceptance**: REQ-BE-PATCH-05 through REQ-BE-PATCH-15. Loads tx + wallet, validates ownership and wallet alignment, validates category type-match if categoryId changes, builds Money VO if amount changes, calls `applyEdits`, computes `adjustment = newDelta - oldDelta`, calls `repo.update` (no key) or `repo.updateIdempotent` (with key). Typecheck green.
  - **Est**: L

- [ ] **T-01-09** Create `DeleteTransaction` use case
  - **Files**: `packages/domain/src/transaction/usecases/DeleteTransaction.ts` (new), `packages/domain/src/transaction/index.ts` (re-export)
  - **Deps**: T-01-02, T-01-04
  - **Acceptance**: REQ-BE-DELETE-03 through REQ-BE-DELETE-06. Loads tx + wallet, validates ownership/wallet alignment, computes `reverseDelta = -tx.signedDelta()`, calls `repo.hardDelete`. Returns `Result<void, ...>`. Typecheck green.
  - **Est**: M

### Composition wiring

- [ ] **T-01-10** Wire 3 new use cases into `container.ts`
  - **Files**: `packages/api/src/composition/container.ts` (modified)
  - **Deps**: T-01-07, T-01-08, T-01-09, T-01-05
  - **Acceptance**: REQ-BE-DOM-07. Container exports `getTransaction`, `updateTransaction`, `deleteTransaction` factories wired with shared singletons. `Container` type includes the new keys. Typecheck green.
  - **Est**: S

### Handlers

- [ ] **T-01-11** Create `getTransaction` handler
  - **Files**: `packages/api/src/handlers/transaction/getTransaction.ts` (new)
  - **Deps**: T-01-01, T-01-07, T-01-10
  - **Acceptance**: Validates path via `TransactionIdPathSchema`, calls `container.getTransaction`, returns 200 with `TransactionResponseDTO` or domain error response. Lambda entry exports `main` with `withErrorHandler(withAuth(handler))`. Typecheck green.
  - **Est**: S

- [ ] **T-01-12** Create `patchTransaction` handler
  - **Files**: `packages/api/src/handlers/transaction/patchTransaction.ts` (new)
  - **Deps**: T-01-01, T-01-06, T-01-08, T-01-10
  - **Acceptance**: REQ-BE-PATCH-02, REQ-BE-PATCH-03, REQ-BE-PATCH-04, REQ-BE-PATCH-14, REQ-BE-PATCH-16. Path + body validation, Idempotency-Key header extraction with length check, hash computation with transactionId scope, calls `container.updateTransaction` with edits + optional hash, maps result to 200 + DTO or domain error. Typecheck green.
  - **Est**: M

- [ ] **T-01-13** Create `deleteTransaction` handler
  - **Files**: `packages/api/src/handlers/transaction/deleteTransaction.ts` (new)
  - **Deps**: T-01-01, T-01-09, T-01-10
  - **Acceptance**: REQ-BE-DELETE-02, REQ-BE-DELETE-07, REQ-BE-DELETE-08. Path validation, Idempotency-Key length check (accepted but not used), calls `container.deleteTransaction`, returns 204 on success or domain error. Typecheck green.
  - **Est**: S

### Routes

- [ ] **T-01-14** Add 3 new functions to `serverless.yml` and add PATCH to CORS allowedMethods
  - **Files**: `packages/infra-sls/serverless.yml` (modified)
  - **Deps**: T-01-11, T-01-12, T-01-13
  - **Acceptance**: REQ-BE-ROUTES-01, REQ-BE-ROUTES-02. Three new function entries (`getTransaction`, `patchTransaction`, `deleteTransaction`) at the correct paths with `cognitoJwt` authorizer. CORS `allowedMethods` includes `PATCH` and `DELETE` (DELETE already there). `pnpm --filter @smart-wallet/infra-sls package` succeeds (no deploy yet).
  - **Est**: S

### Backend verification

- [ ] **T-01-15** Typecheck across all backend packages
  - **Files**: none (verification)
  - **Deps**: T-01-01 through T-01-14
  - **Acceptance**: `pnpm --filter @smart-wallet/shared-types typecheck`, `pnpm --filter @smart-wallet/domain typecheck`, `pnpm --filter @smart-wallet/api typecheck`, `pnpm --filter @smart-wallet/infra-sls typecheck` all exit 0.
  - **Est**: S

- [ ] **T-01-16** Local smoke test against DynamoDB Local
  - **Files**: none (verification)
  - **Deps**: T-01-15
  - **Acceptance**: With `pnpm ddb:up && pnpm ddb:init && cd packages/infra-sls && pnpm dev` running:
    1. Create a wallet + add a transaction (existing flow still works).
    2. `GET /wallets/{wid}/transactions/{tid}` returns 200 with the transaction body.
    3. `PATCH` with `{ "amount": "120.00" }` returns 200, body shows updated amount, GET on the wallet shows updated balance.
    4. `PATCH` with `{ "type": "income" }` returns 400.
    5. `PATCH` with `{}` returns 400.
    6. `DELETE` returns 204, GET on the transaction returns 404, GET on the wallet shows balance restored.
    7. `DELETE` again returns 404.
  - **Est**: M

- [ ] **T-01-17** Deploy backend to AWS prod (`pnpm deploy`)
  - **Files**: none (deployment)
  - **Deps**: T-01-16, **user authorization required**
  - **Acceptance**: User runs `AWS_PROFILE=tomishi-account pnpm --filter @smart-wallet/infra-sls deploy --stage prod`. Lambda functions visible in console. `pnpm smoke:prod` (existing 12-step smoke against POST/GET/list) still passes — proves no regression in addTransaction.
  - **Est**: M (mostly waiting on deploy)

### PR1 closeout

- [ ] **T-01-18** Open PR1 on GitHub
  - **Files**: none
  - **Deps**: T-01-17 (or branch ready, deploy after merge — user's call)
  - **Acceptance**: Branch `feat/transaction-edit-delete-backend` pushed, PR opened with summary linking to spec/design, smoke results pasted.
  - **Est**: S

---

## Slice 2 — Frontend (PR2)

> Begins after PR1 is merged AND backend is deployed. Branch from updated main: `feat/transaction-edit-delete-frontend`.

### Foundation — i18n + API client

- [ ] **T-02-01** Add 9 new strings to `t.transactions` in i18n
  - **Files**: `packages/web/src/lib/i18n.ts` (modified)
  - **Deps**: none
  - **Acceptance**: REQ-FE-I18N-01. All 9 strings present: `editEyebrow`, `editTitle`, `editSubmit`, `editSuccess`, `editNoChanges`, `editNotFound`, `deleteDialogTitle`, `deleteDialogBody`, `deleteDialogConfirm`, `deleteSuccess`. Typecheck green.
  - **Est**: S

- [ ] **T-02-02** Add `apiPatch` and `apiDelete` to the fetch wrapper
  - **Files**: `packages/web/src/lib/api/fetch.ts` (modified)
  - **Deps**: none
  - **Acceptance**: Both functions mirror `apiPost` exactly (auth header, error handling). `apiPatch` accepts optional `headers` for the Idempotency-Key. `apiDelete` returns void. Typecheck green.
  - **Est**: S

### API client + queries

- [ ] **T-02-03** Add `getTransaction`, `updateTransaction`, `deleteTransaction` to `transactionsApi`
  - **Files**: `packages/web/src/features/transactions/transactionsApi.ts` (modified)
  - **Deps**: T-02-02
  - **Acceptance**: REQ-FE-API-01, REQ-FE-API-02. `updateTransaction` attaches a fresh `Idempotency-Key: crypto.randomUUID()` header per call. `deleteTransaction` does not (server ignores it anyway). All three typed against shared schemas. Typecheck green.
  - **Est**: S

- [ ] **T-02-04** Add `useTransaction`, `useUpdateTransaction`, `useDeleteTransaction` to queries
  - **Files**: `packages/web/src/features/transactions/queries.ts` (modified)
  - **Deps**: T-02-03
  - **Acceptance**: REQ-FE-QUERY-01, REQ-FE-QUERY-02, REQ-FE-QUERY-03, REQ-FE-QUERY-04, REQ-FE-INV-01. Three hooks created. Mutations invalidate `['transactions']` and `['wallets']` on success. No optimistic updates. Typecheck green.
  - **Est**: M

### Form extension

- [ ] **T-02-05** Extend `TransactionForm` with `mode` + `initialValues` props
  - **Files**: `packages/web/src/features/transactions/components/TransactionForm.tsx` (modified)
  - **Deps**: T-02-01
  - **Acceptance**: REQ-FE-FORM-01, REQ-FE-FORM-02, REQ-FE-FORM-03, REQ-FE-FORM-04. Optional `mode?: 'add' | 'edit'` (default `'add'`) and `initialValues?: Partial<AddTransactionDTO>`. In edit: `type` Select disabled, wallet rendered as static text instead of selector, submit copy from i18n. Existing `AddTransactionPage` usage unchanged. Typecheck green.
  - **Est**: M

### Edit page + dialog

- [ ] **T-02-06** Create `DeleteTransactionDialog` component
  - **Files**: `packages/web/src/features/transactions/components/DeleteTransactionDialog.tsx` (new)
  - **Deps**: T-02-01
  - **Acceptance**: REQ-FE-UI-03, REQ-FE-UI-04. Controlled `Dialog` with `open`, `onOpenChange`, `onConfirm`, `pending` props. When `pending`, both buttons disabled and dialog cannot be dismissed by overlay/Escape. Title + body + buttons from i18n.
  - **Est**: M

- [ ] **T-02-07** Create `EditTransactionPage`
  - **Files**: `packages/web/src/features/transactions/pages/EditTransactionPage.tsx` (new)
  - **Deps**: T-02-04, T-02-05
  - **Acceptance**: REQ-FE-EDIT-01 through REQ-FE-EDIT-10. Loads tx via `useTransaction`, renders skeleton/error states, on load renders `TransactionForm` with initialValues. Submit computes diff, sends PATCH only if non-empty; no-changes → toast. Success → toast + navigate back via `location.state.from`. 404 → toast + navigate back. Typecheck green.
  - **Est**: L

### List item action row + wiring

- [ ] **T-02-08** Add action row to `TransactionListItem` (pencil + trash)
  - **Files**: `packages/web/src/features/transactions/components/TransactionListItem.tsx` (modified)
  - **Deps**: T-02-01
  - **Acceptance**: REQ-FE-UI-01, REQ-FE-UI-02, REQ-FE-UI-05. Two icon buttons (44×44 min) sit to the right of the amount. Pencil navigates to edit route with `state.from`. Trash invokes `onDelete(transactionId)` callback. Layout doesn't overflow on `xs` viewports. Typecheck green.
  - **Est**: M

- [ ] **T-02-09** Wire delete dialog + mutation into `TransactionListPage`
  - **Files**: `packages/web/src/features/transactions/pages/TransactionListPage.tsx` (modified)
  - **Deps**: T-02-04, T-02-06, T-02-08
  - **Acceptance**: Page holds `pendingDelete` state, renders `DeleteTransactionDialog` at page level, passes `onDelete` callback to list items. Confirm fires `useDeleteTransaction` with success/error toasts. Typecheck green.
  - **Est**: M

- [ ] **T-02-10** Wire delete dialog + mutation into `WalletDetailPage` (via `RecentTransactionsList`)
  - **Files**: `packages/web/src/features/wallets/pages/WalletDetailPage.tsx` (modified), `packages/web/src/features/transactions/components/RecentTransactionsList.tsx` (modified)
  - **Deps**: T-02-04, T-02-06, T-02-08
  - **Acceptance**: REQ-FE-UI-05. Same dialog pattern at page level. `RecentTransactionsList` accepts the `onDelete` callback and threads it to its items. Typecheck green.
  - **Est**: M

### Router wiring

- [ ] **T-02-11** Add `editTransaction` route to `routes.ts` + `AppRouter.tsx`
  - **Files**: `packages/web/src/app/routes.ts` (modified), `packages/web/src/app/AppRouter.tsx` (modified)
  - **Deps**: T-02-07
  - **Acceptance**: `routes.editTransaction(walletId, transactionId)` helper returns `/wallets/${walletId}/transactions/${transactionId}/edit`. Route declared inside `ProtectedRoute` → `AppLayout`. Typecheck green.
  - **Est**: S

### Frontend verification

- [ ] **T-02-12** Typecheck + lint on `packages/web`
  - **Files**: none
  - **Deps**: T-02-01 through T-02-11
  - **Acceptance**: `pnpm --filter @smart-wallet/web typecheck` and `pnpm --filter @smart-wallet/web lint` exit 0. Pre-existing lint errors (in transactions/\*) NOT introduced by this change — record any new ones as follow-up.
  - **Est**: S

- [ ] **T-02-13** Manual smoke against prod backend
  - **Files**: none
  - **Deps**: T-02-12, PR1 deployed (T-01-17)
  - **Acceptance**: With `pnpm --filter @smart-wallet/web dev` running:
    1. Open `/wallets/{any}/transactions` → action row visible on each item (pencil + trash).
    2. Tap pencil on a tx → edit page loads with values pre-filled, `type` disabled, wallet shown as text.
    3. Change amount → submit → success toast, navigate back, list shows new amount, wallet balance updated.
    4. Open edit page, submit without changes → "No hay cambios" toast, no network call.
    5. Tap trash → confirm dialog → confirm → row disappears, wallet balance updates.
    6. Tap trash → confirm dialog → cancel → no change.
    7. Open two tabs of the same tx edit page. Delete from one. Submit from the other → "Este movimiento ya no existe" toast, navigate back.
    8. Open a transaction edit page via direct URL paste (fresh tab) → loads correctly.
    9. Existing flows: add new transaction still works; wallet list still works; categories still work.
  - **Est**: M

### PR2 closeout

- [ ] **T-02-14** Open PR2 on GitHub (branch `feat/transaction-edit-delete-frontend`)
  - **Files**: none
  - **Deps**: T-02-13
  - **Acceptance**: Branch pushed, PR opened with reference to PR1 (already merged) and the spec/design. Smoke checklist results pasted.
  - **Est**: S

---

## Dependency graph (high-level)

```
PR1 (backend):
  T-01-01 (shared types) ──────┐
  T-01-02 (TransactionNotFound)┤
                               ├── T-01-03 (applyEdits/signedDelta)
                               │
  T-01-04 (repo interface) ────┼── T-01-05 (DynamoDB impl)
                               │
  T-01-06 (idempotency helper) ┘

  T-01-07 (GetTransaction) ──────┐
  T-01-08 (UpdateTransaction) ───┼── T-01-10 (container)
  T-01-09 (DeleteTransaction) ───┘

  T-01-10 ── T-01-11 (GET handler)
          ── T-01-12 (PATCH handler)
          ── T-01-13 (DELETE handler)

  T-01-11,12,13 ── T-01-14 (serverless.yml)

  All above ── T-01-15 (typecheck) ── T-01-16 (local smoke) ── T-01-17 (deploy)
                                                            ── T-01-18 (open PR1)

PR2 (frontend, after PR1 deployed):
  T-02-01 (i18n) ─┐
  T-02-02 (apiPatch/apiDelete) ── T-02-03 (transactionsApi) ── T-02-04 (queries)
                                                                 │
  T-02-05 (TransactionForm extension) ───────────────────────────┤
                                                                 │
  T-02-04 ── T-02-06 (DeleteDialog) ─┐                          │
                                     ├─ T-02-07 (EditTransactionPage)
  T-02-05 ─────────────────────────  ┘                          │
                                                                 │
  T-02-04 ─┐                                                    │
  T-02-06 ─┼── T-02-09 (TransactionListPage wire)               │
  T-02-08 ─┤                                                    │
           │                                                    │
  T-02-04 ─┼── T-02-10 (WalletDetailPage wire)                  │
  T-02-06 ─┘                                                    │
                                                                 │
  T-02-07 ── T-02-11 (router)                                    │
                                                                 │
  All above ── T-02-12 (typecheck/lint) ── T-02-13 (smoke) ── T-02-14 (open PR2)
```

---

## Suggested apply order

**PR1 (backend) — linear within slice 1**:

1. T-01-01 shared types
2. T-01-02 TransactionNotFound
3. T-01-03 Transaction.applyEdits + signedDelta
4. T-01-04 repo interface
5. T-01-06 idempotency helper (parallel-safe with 04, do in this slot)
6. T-01-05 DynamoDB repo impl
7. T-01-07 GetTransaction use case
8. T-01-08 UpdateTransaction use case
9. T-01-09 DeleteTransaction use case
10. T-01-10 container
11. T-01-11 GET handler
12. T-01-12 PATCH handler
13. T-01-13 DELETE handler
14. T-01-14 serverless.yml
15. T-01-15 typecheck
16. T-01-16 local smoke
17. T-01-17 prod deploy (USER ACTION)
18. T-01-18 open PR1 (USER ACTION)

**PR2 (frontend) — linear within slice 2**:

1. T-02-01 i18n
2. T-02-02 apiPatch / apiDelete
3. T-02-03 transactionsApi
4. T-02-04 queries
5. T-02-05 TransactionForm extension
6. T-02-06 DeleteTransactionDialog
7. T-02-07 EditTransactionPage
8. T-02-08 TransactionListItem action row
9. T-02-09 TransactionListPage wire
10. T-02-10 WalletDetailPage + RecentTransactionsList wire
11. T-02-11 router + routes
12. T-02-12 typecheck + lint
13. T-02-13 manual smoke
14. T-02-14 open PR2 (USER ACTION)

---

## Pre-apply checks

Before T-01-01 starts:

- ✅ Current branch is `feat/transaction-edit-delete-backend` (rename from current `feat/transaction-edit-delete`).
- ⚠️ Working tree clean (no uncommitted changes).
- ⚠️ `fix/transaction-form-wallet-field` and `feat/settings-page` should be merged to main first so the rebase is clean. NOT strictly required (the apply touches different files), but cleaner.

Before T-02-01 starts:

- ⚠️ PR1 merged to main and backend deployed.
- ✅ New branch `feat/transaction-edit-delete-frontend` created from updated main.
- ⚠️ User runs `git pull` and verifies smoke-prod.sh against the deployed backend (sanity check).

---

## Out of scope for this change (reaffirmation)

- Tests (unit / integration / e2e) — `strict_tdd: false`. Test surface documented in design §12.
- Editing `type` or `walletId` — design §3, design §11.6.
- Soft delete — proposal §4.1, design §3.1.
- Optimistic UI updates — design §11.4 says no.
- "Undo delete" — out of scope (hard delete).
- Bulk operations — out of scope.
- Audit log — out of scope.
