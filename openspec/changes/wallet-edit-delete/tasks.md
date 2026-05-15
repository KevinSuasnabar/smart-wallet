# Tasks: wallet-edit-delete

> SDD phase: tasks
> Project: smart-wallet
> Change: wallet-edit-delete
> Date: 2026-05-15
> Engram topic_key: `sdd/wallet-edit-delete/tasks`

---

## Workload Forecast

| Metric | Value |
|---|---|
| Total tasks | 17 |
| Total estimated time | ~7–9 hours |
| Estimated changed lines | ~740 |
| Files created | 6 |
| Files modified | 14 |
| **400-line budget** | **High** — single PR with `size:exception` (per design §9) |
| **Chained PRs** | **No** — backend/frontend coupling makes the split worse than the size |
| **Decision needed before apply** | **No** |

---

## Slice 1 — single PR

### Foundation — shared types & domain primitives (additive)

- [ ] **T-01-01** Add `UpdateWalletRequestSchema` + `UpdateWalletDTO` to shared types
  - **Files**: `packages/shared-types/src/schemas/wallet.ts` (modified), `packages/shared-types/src/index.ts` (modified)
  - **Acceptance**: REQ-WAL-DTO-01, REQ-WAL-DTO-02, REQ-WAL-DTO-03. Strict + at-least-one refine. Shared-types build green.
  - **Est**: S

- [ ] **T-01-02** Add `WalletCurrencyLocked` error class + union member
  - **Files**: `packages/domain/src/wallet/WalletError.ts`
  - **Acceptance**: REQ-WAL-DOM-03. Domain build green.
  - **Est**: S

- [ ] **T-01-03** Add `Wallet.applyEdits` method
  - **Files**: `packages/domain/src/wallet/Wallet.ts`
  - **Deps**: T-01-02 (uses `InvalidWalletName`, `InvalidWalletCurrency`)
  - **Acceptance**: REQ-WAL-DOM-01, REQ-WAL-DOM-02. Rolls back snapshot on error. Updates `updatedAt` on success.
  - **Est**: M

### Repository surface

- [ ] **T-01-04** Extend `WalletRepository` interface with `update` and `hardDeleteWithTransactions`
  - **Files**: `packages/domain/src/wallet/WalletRepository.ts`
  - **Acceptance**: REQ-WAL-REPO-01, REQ-WAL-REPO-02 (interface only — impl in T-01-05).
  - **Est**: S

- [ ] **T-01-05** Implement `update` and `hardDeleteWithTransactions` in `DynamoDBWalletRepository`
  - **Files**: `packages/api/src/adapters/dynamodb/repositories/DynamoDBWalletRepository.ts`
  - **Deps**: T-01-04
  - **Acceptance**: REQ-WAL-REPO-01, REQ-WAL-REPO-02, REQ-WAL-REPO-03, REQ-WAL-REPO-04. Update uses PutCommand + ConditionExpression. Cascade uses paginated Query + chunked TransactWriteItems with 99-tx + 1-wallet pattern. Last-chunk wallet Delete has ConditionExpression for concurrent-removal detection. API typecheck green.
  - **Est**: L

### Use cases

- [ ] **T-01-06** Create `UpdateWallet` use case
  - **Files**: `packages/domain/src/wallet/usecases/UpdateWallet.ts` (new), `packages/domain/src/wallet/index.ts` (re-export)
  - **Deps**: T-01-02, T-01-03, T-01-04
  - **Acceptance**: REQ-WAL-DOM-04. Currency-lock check only fires when currency changes. Domain build green.
  - **Est**: M

- [ ] **T-01-07** Create `DeleteWallet` use case
  - **Files**: `packages/domain/src/wallet/usecases/DeleteWallet.ts` (new), `packages/domain/src/wallet/index.ts` (re-export)
  - **Deps**: T-01-04
  - **Acceptance**: REQ-WAL-DOM-05, REQ-WAL-DOM-06. Maps `isWalletConcurrentlyRemoved` exception to `WalletNotFound`. Domain build green.
  - **Est**: M

### Composition + HTTP

- [ ] **T-01-08** Wire `updateWallet` + `deleteWallet` into container
  - **Files**: `packages/api/src/composition/container.ts`
  - **Deps**: T-01-06, T-01-07, T-01-05
  - **Acceptance**: REQ-WAL-COMP-01. API typecheck green.
  - **Est**: S

- [ ] **T-01-09** Create `patchWallet` handler + shim
  - **Files**: `packages/api/src/handlers/wallet/patchWallet.ts` (new), `packages/infra-sls/src/handlers/wallet/patchWallet.ts` (new shim)
  - **Deps**: T-01-01, T-01-06, T-01-08
  - **Acceptance**: REQ-WAL-HTTP-01, REQ-WAL-HTTP-02, REQ-WAL-HTTP-04. Maps `WalletNotFound` to 404, `WalletCurrencyLocked` to 409, other domain errors via `domainErrorToResponse`. Returns 200 + DTO on success. API typecheck green.
  - **Est**: M

- [ ] **T-01-10** Create `deleteWallet` handler + shim
  - **Files**: `packages/api/src/handlers/wallet/deleteWallet.ts` (new), `packages/infra-sls/src/handlers/wallet/deleteWallet.ts` (new shim)
  - **Deps**: T-01-07, T-01-08
  - **Acceptance**: REQ-WAL-HTTP-03, REQ-WAL-HTTP-04. Returns 204 on success, 404 on `WalletNotFound`. API typecheck green.
  - **Est**: S

- [ ] **T-01-11** Add `patchWallet` + `deleteWallet` to `serverless.yml`
  - **Files**: `packages/infra-sls/serverless.yml`
  - **Deps**: T-01-09, T-01-10
  - **Acceptance**: REQ-WAL-ROUTES-01, REQ-WAL-ROUTES-02. `pnpm package` succeeds.
  - **Est**: S

### Frontend — data layer

- [ ] **T-01-12** Extend `walletsApi` with `update` + `remove`
  - **Files**: `packages/web/src/features/wallets/walletsApi.ts`
  - **Acceptance**: REQ-WAL-FE-Q-01. Web typecheck green.
  - **Est**: S

- [ ] **T-01-13** Add `useUpdateWallet` + `useDeleteWallet` mutations
  - **Files**: `packages/web/src/features/wallets/queries.ts`
  - **Deps**: T-01-12
  - **Acceptance**: REQ-WAL-FE-Q-02, REQ-WAL-FE-Q-03, REQ-WAL-FE-Q-04. Invalidations correct. Web typecheck green.
  - **Est**: S

### Frontend — UI

- [ ] **T-01-14** Add i18n strings + error mapping
  - **Files**: `packages/web/src/lib/i18n.ts`, `packages/web/src/lib/api/errors.ts`
  - **Acceptance**: REQ-WAL-FE-I18N-01, REQ-WAL-FE-ERR-01, REQ-WAL-FE-ERR-02. All strings in Spanish neutro.
  - **Est**: S

- [ ] **T-01-15** Create `DeleteWalletDialog` component
  - **Files**: `packages/web/src/features/wallets/components/DeleteWalletDialog.tsx` (new)
  - **Deps**: T-01-14
  - **Acceptance**: REQ-WAL-FE-AFF-02. Locks during in-flight (Escape/overlay/buttons disabled).
  - **Est**: S

- [ ] **T-01-16** Create `EditWalletPage` + wire into routes
  - **Files**: `packages/web/src/features/wallets/pages/EditWalletPage.tsx` (new), `packages/web/src/app/routes.ts` (modified), `packages/web/src/app/AppRouter.tsx` (modified)
  - **Deps**: T-01-13, T-01-14
  - **Acceptance**: REQ-WAL-FE-PAGES-01..07. Currency disabled + helper when wallet has tx. Diff-and-PATCH submit. 404/409 toasts handled. Web typecheck green.
  - **Est**: L

- [ ] **T-01-17** Wire delete action + dialog into `WalletDetailPage`; add edit action button
  - **Files**: `packages/web/src/features/wallets/pages/WalletDetailPage.tsx`
  - **Deps**: T-01-15, T-01-16
  - **Acceptance**: REQ-WAL-FE-AFF-01, REQ-WAL-FE-AFF-03. Edit pencil navigates with `state.from`. Trash opens dialog. Success → toast + navigate `/wallets` replace. Web typecheck green.
  - **Est**: M

### Verification

- [ ] **T-01-18** Cross-package typecheck + lint
  - **Acceptance**: `pnpm --filter @smart-wallet/{shared-types,domain,api,infra-sls,web} typecheck` exits 0 across all. `web` lint: no NEW warnings introduced.
  - **Est**: S

- [ ] **T-01-19** Local smoke against `serverless offline` + DDB Local
  - **Acceptance**: Manual run of 8 scenarios:
    1. PATCH `{ "name": "new" }` → 200 + name updated.
    2. PATCH `{ "currency": "PEN" }` on empty wallet → 200 + currency PEN.
    3. PATCH `{ "currency": "PEN" }` on wallet with tx → 409 `wallet_currency_locked`.
    4. PATCH `{}` → 400.
    5. PATCH `{ "balance": 100 }` → 400.
    6. DELETE empty wallet → 204 + wallet gone.
    7. DELETE wallet with 3 transactions → 204 + wallet + all 3 tx gone.
    8. DELETE again → 404.
  - **Est**: M

- [ ] **T-01-20** Commit + push branch + open PR
  - **Files**: none (git)
  - **Acceptance**: Branch `feat/wallet-edit-delete` pushed. PR opened with summary + spec link + smoke results.
  - **Est**: S

---

## Out-of-band tasks (not in this PR)

- Add wallet-edit/delete scenarios to a future `smoke-wallets-prod.sh` (none exists today).
- Decide if a wallet with > 1000 transactions should switch to a "mark for deletion + async sweeper" pattern.

---

## Apply order (linear)

T-01-01 → T-01-02 → T-01-03 → T-01-04 → T-01-05 → T-01-06 → T-01-07 → T-01-08 → T-01-09 → T-01-10 → T-01-11 → T-01-12 → T-01-13 → T-01-14 → T-01-15 → T-01-16 → T-01-17 → T-01-18 → T-01-19 → T-01-20.
