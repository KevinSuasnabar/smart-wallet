# Tasks: wallet-colors

> SDD phase: tasks
> Project: smart-wallet
> Change: wallet-colors
> Date: 2026-05-15
> Engram topic_key: `sdd/wallet-colors/tasks`

---

## Workload Forecast

| Metric                           | Value               |
| -------------------------------- | ------------------- |
| Total tasks                      | 14                  |
| Total estimated time             | ~3–4 hours          |
| Estimated changed lines          | ~380                |
| Files created                    | 2                   |
| Files modified                   | 15                  |
| **400-line budget**              | **Low** — single PR |
| **Chained PRs**                  | **No**              |
| **Decision needed before apply** | **No**              |

---

## Slice 1 — single PR

### Foundation — shared types

- [ ] **T-01-01** Create `wallet-colors.ts` with `WALLET_COLORS`, `WalletColor`, `zWalletColor`, `isWalletColor`
  - **Files**: `packages/shared-types/src/wallet-colors.ts` (new), `packages/shared-types/src/index.ts` (modified)
  - **Acceptance**: REQ-COL-DTO-01, REQ-COL-DTO-05. Build green.
  - **Est**: S

- [ ] **T-01-02** Add `color` to wallet schemas
  - **Files**: `packages/shared-types/src/schemas/wallet.ts`
  - **Deps**: T-01-01
  - **Acceptance**: REQ-COL-DTO-02, REQ-COL-DTO-03, REQ-COL-DTO-04. `CreateWalletRequestSchema` requires color. `UpdateWalletRequestSchema.color` optional. `WalletResponseSchema.color` required. `.refine` updated to count color.
  - **Est**: S

### Domain layer

- [ ] **T-01-03** Add `InvalidWalletColor` error class
  - **Files**: `packages/domain/src/wallet/WalletError.ts`
  - **Acceptance**: REQ-COL-DOM-04. Joins `WalletError` union. Domain build green.
  - **Est**: S

- [ ] **T-01-04** Add `color` to `Wallet` props/factory/applyEdits
  - **Files**: `packages/domain/src/wallet/Wallet.ts`
  - **Deps**: T-01-01, T-01-03
  - **Acceptance**: REQ-COL-DOM-01, REQ-COL-DOM-02, REQ-COL-DOM-03. Factory validates via `isWalletColor`; applyEdits validates and rolls back on invalid; `rehydrate` accepts the field. Domain build green.
  - **Est**: M

- [ ] **T-01-05** Add `color` to `CreateWalletInput` + `UpdateWalletInput.edits`
  - **Files**: `packages/domain/src/wallet/usecases/CreateWallet.ts`, `packages/domain/src/wallet/usecases/UpdateWallet.ts`
  - **Deps**: T-01-04
  - **Acceptance**: REQ-COL-DOM-05. Use cases pass `color` through to entity unchanged. Domain build green.
  - **Est**: S

- [ ] **T-01-06** Re-export new domain identifiers from wallet barrel
  - **Files**: `packages/domain/src/wallet/index.ts`
  - **Deps**: T-01-03, T-01-04
  - **Acceptance**: `InvalidWalletColor` exported. Domain build green.
  - **Est**: S

### Repository layer

- [ ] **T-01-07** Update `WalletMapper` with `color` field + legacy fallback
  - **Files**: `packages/api/src/adapters/dynamodb/mappers/WalletMapper.ts`
  - **Deps**: T-01-04
  - **Acceptance**: REQ-COL-REPO-01, REQ-COL-REPO-02. `walletToItem` writes color. `itemToWallet` reads with `isWalletColor` fallback to 'lime'. API typecheck green.
  - **Est**: S

### HTTP handlers

- [ ] **T-01-08** Wire `color` through all wallet handlers
  - **Files**: `packages/api/src/handlers/wallet/createWallet.ts`, `getWallet.ts`, `listWallets.ts`, `patchWallet.ts`
  - **Deps**: T-01-02, T-01-05, T-01-07
  - **Acceptance**: REQ-COL-HTTP-01, REQ-COL-HTTP-02, REQ-COL-HTTP-03, REQ-COL-HTTP-04. POST accepts and returns color; PATCH accepts color in body; GET handlers return color. API typecheck green.
  - **Est**: M

### Frontend — picker

- [ ] **T-01-09** Add i18n strings
  - **Files**: `packages/web/src/lib/i18n.ts`
  - **Acceptance**: REQ-COL-FE-I18N-01, REQ-COL-FE-I18N-02. New `t.wallets.colorLabel` + `t.wallets.colors.*` in Spanish neutro.
  - **Est**: S

- [ ] **T-01-10** Create `ColorPicker` component
  - **Files**: `packages/web/src/features/wallets/components/ColorPicker.tsx` (new)
  - **Deps**: T-01-01, T-01-09
  - **Acceptance**: REQ-COL-FE-PICK-01..05. 7 swatches, focus ring on selected, `aria-checked`, disabled state. Static `SWATCH_BG` record (no template strings — Tailwind JIT). Web typecheck green.
  - **Est**: M

### Frontend — pages

- [ ] **T-01-11** Wire `ColorPicker` into `CreateWalletPage` + smart default
  - **Files**: `packages/web/src/features/wallets/pages/CreateWalletPage.tsx`
  - **Deps**: T-01-10
  - **Acceptance**: REQ-COL-FE-CREATE-01..04. Default = first unused color from existing wallets, fallback `lime`. Form schema includes color. Submit sends color. Web typecheck green.
  - **Est**: M

- [ ] **T-01-12** Wire `ColorPicker` into `EditWalletPage`
  - **Files**: `packages/web/src/features/wallets/pages/EditWalletPage.tsx`
  - **Deps**: T-01-10
  - **Acceptance**: REQ-COL-FE-EDIT-01..04. Pre-selected to `wallet.color`. NOT disabled by tx-lock. Diff includes color. Web typecheck green.
  - **Est**: M

- [ ] **T-01-13** Drop `index` prop from `WalletCard`; read `wallet.color`
  - **Files**: `packages/web/src/features/wallets/components/WalletCard.tsx`, `packages/web/src/features/wallets/pages/WalletsListPage.tsx`
  - **Deps**: T-01-04 (entity has color)
  - **Acceptance**: REQ-COL-FE-CARD-01, REQ-COL-FE-CARD-02. `WalletCard` reads `wallet.color`, falls back to `lime` on unexpected value, no `index` prop. `WalletsListPage` stops passing `index`. Web typecheck green.
  - **Est**: S

### Verification

- [ ] **T-01-14** Update local smoke + manual run
  - **Files**: `packages/infra-sls/smoke-tests/smoke.sh` (modified — add color field to POST)
  - **Deps**: T-01-01..13
  - **Acceptance**: With DDB Local + serverless offline running, the 5 scenarios pass:
    1. POST `/wallets` with `{"name":"X","currency":"USD","color":"mint"}` → 201 with `color: "mint"`.
    2. POST without color → 400.
    3. POST with `color: "red"` → 400.
    4. PATCH `{"color":"coral"}` on a wallet → 200 with new color.
    5. (Legacy fallback) GET an existing wallet item that has no color attribute (manually verified via DDB admin) → response includes `color: "lime"`.
  - **Est**: M

- [ ] **T-01-15** Commit + push + open PR
  - **Files**: none (git)
  - **Acceptance**: Branch `feat/wallet-colors` pushed. PR opened with summary + spec link + smoke results.
  - **Est**: S

---

## Apply order (linear)

T-01-01 → T-01-02 → T-01-03 → T-01-04 → T-01-05 → T-01-06 → T-01-07 → T-01-08 → T-01-09 → T-01-10 → T-01-11 → T-01-12 → T-01-13 → T-01-14 → T-01-15.

---

## Out-of-band tasks (not in this PR)

- Update `smoke-prod.sh` to include `color` field in the POST scenario (needs prod deploy first).
- Future: add `WalletColor` to TanStack Query select-color affordance on `WalletDetailPage` hero (currently hardcoded navy).
- Future: color-coded categories (separate SDD `category-fork`).
