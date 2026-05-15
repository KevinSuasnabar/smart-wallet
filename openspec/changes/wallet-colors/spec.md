# Spec: wallet-colors

> SDD phase: spec
> Project: smart-wallet
> Change: wallet-colors
> Date: 2026-05-15
> Engram topic_key: `sdd/wallet-colors/spec`

---

## 1. Glossary

| Term | Definition |
|------|------------|
| **`WalletColor`** | A string literal union: `'lime' \| 'lilac' \| 'cream' \| 'pink' \| 'mint' \| 'coral' \| 'navy'`. Lives in shared-types alongside `Currency`. |
| **`WALLET_COLORS`** | Const array of the seven `WalletColor` values, in palette order. Drives Zod, the picker, and the mapper fallback list. |
| **`InvalidWalletColor`** | New domain error class. `tag: 'domain.wallet.invalid_color'`, `httpStatus: 400`. |
| **Legacy wallet** | A wallet item in DynamoDB whose `color` attribute is absent (created before this change). |
| **Picker default** | The color the create-wallet form pre-selects: first `WalletColor` not used by any of the user's existing wallets; fallback `'lime'`. |

---

## 2. Requirements

### Domain layer (COL-DOM)

- **REQ-COL-DOM-01**: `Wallet` props gain `color: WalletColor`. The factory `Wallet.create()` accepts a `color: string` argument and validates it against `WALLET_COLORS`. On invalid color → returns `err(new InvalidWalletColor())`.
- **REQ-COL-DOM-02**: `Wallet.rehydrate(id, props)` accepts the new `color` field as part of `WalletProps`. No validation here (adapters trust the persisted data).
- **REQ-COL-DOM-03**: `Wallet.applyEdits(edits, clock)` validates `edits.color` if present. Invalid color → roll back, return `InvalidWalletColor`. Valid color → write to `_props.color`, advance `updatedAt`.
- **REQ-COL-DOM-04**: `InvalidWalletColor` error class is added to `WalletError` and joins the union.
- **REQ-COL-DOM-05**: `CreateWalletInput` requires `color: string`. `UpdateWalletInput.edits` accepts `color?: string`. Use cases pass these through to the entity unchanged.

### Repository (COL-REPO)

- **REQ-COL-REPO-01**: `WalletItem` mapper shape gains `color: string`. `walletToItem` writes `wallet.color`. `itemToWallet` reads `item.color` if present; if absent OR not a valid `WalletColor`, falls back to `'lime'`.
- **REQ-COL-REPO-02**: No DynamoDB schema migration. No backfill job. Legacy items pick up `color = 'lime'` at read time and persist their color on the next write.

### Shared types (COL-DTO)

- **REQ-COL-DTO-01**: New constant `WALLET_COLORS` in `packages/shared-types/src/`:
  ```ts
  export const WALLET_COLORS = ['lime', 'lilac', 'cream', 'pink', 'mint', 'coral', 'navy'] as const;
  export type WalletColor = typeof WALLET_COLORS[number];
  export const zWalletColor = z.enum(WALLET_COLORS);
  ```
- **REQ-COL-DTO-02**: `CreateWalletRequestSchema` adds `color: zWalletColor`. Required, no default.
- **REQ-COL-DTO-03**: `UpdateWalletRequestSchema` adds `color: zWalletColor.optional()`. The `.refine()` at-least-one rule is extended to count `color` too.
- **REQ-COL-DTO-04**: `WalletResponseSchema` adds `color: zWalletColor`.
- **REQ-COL-DTO-05**: All five identifiers (`WALLET_COLORS`, `WalletColor`, `zWalletColor`, plus updated schemas) re-export from `packages/shared-types/src/index.ts`.

### HTTP handlers (COL-HTTP)

- **REQ-COL-HTTP-01**: `createWallet` handler passes `input.color` to the use case. No additional logic.
- **REQ-COL-HTTP-02**: `patchWallet` handler passes `body.color` to the use case's `edits` when present. No additional logic.
- **REQ-COL-HTTP-03**: All wallet GET responses (`getWallet`, `listWallets`) include `color` in the body.
- **REQ-COL-HTTP-04**: Sending an invalid color (e.g. `"red"`) on POST or PATCH returns 400 with `validation_failed` (Zod-level rejection). A would-be-invalid value at the entity level surfaces 400 via `domainErrorToResponse(InvalidWalletColor)`.

### Frontend — picker (COL-FE-PICK)

- **REQ-COL-FE-PICK-01**: New `ColorPicker` component at `packages/web/src/features/wallets/components/ColorPicker.tsx`. Props: `value: WalletColor`, `onChange: (color: WalletColor) => void`, `disabled?: boolean`.
- **REQ-COL-FE-PICK-02**: The picker renders seven circular swatches in a single row, ordered as `WALLET_COLORS`. Each swatch uses the corresponding Tailwind `bg-block-{tone}` class.
- **REQ-COL-FE-PICK-03**: The currently-selected swatch shows a focus ring (`ring-2 ring-offset-2 ring-foreground`) and `aria-pressed="true"`. Non-selected swatches show `aria-pressed="false"`.
- **REQ-COL-FE-PICK-04**: Each swatch has an `aria-label` from the localized name (e.g. `t.wallets.colors.lime` → "Lima"). Hover shows a tooltip with the same text.
- **REQ-COL-FE-PICK-05**: Disabled state grays out all swatches and removes interactivity (no `onChange` invoked). The currently-selected swatch keeps its focus ring (still informative).

### Frontend — create flow (COL-FE-CREATE)

- **REQ-COL-FE-CREATE-01**: `CreateWalletPage` includes the `ColorPicker` below the currency field. Visually styled as a `FormItem` row (label + control + optional helper).
- **REQ-COL-FE-CREATE-02**: The picker's initial value is computed once on form mount:
  - If `useWallets()` data is loaded, pick the first `WALLET_COLORS` value not in `existing.map(w => w.color)`.
  - If the data is loading or errored, default to `'lime'`.
  - If all 7 colors are in use, default to `'lime'`.
- **REQ-COL-FE-CREATE-03**: The form's Zod schema is `CreateWalletRequestSchema` (which now requires `color`). The submit button's `disabled` predicate (`!isValid`) already covers the case where `color` was somehow not set.
- **REQ-COL-FE-CREATE-04**: On submit, the picker's value is included in the DTO sent to the API.

### Frontend — edit flow (COL-FE-EDIT)

- **REQ-COL-FE-EDIT-01**: `EditWalletPage` includes the `ColorPicker` below the currency field. Pre-selected to `wallet.color`.
- **REQ-COL-FE-EDIT-02**: The picker is NEVER disabled by a "wallet has transactions" check. Color edits succeed regardless.
- **REQ-COL-FE-EDIT-03**: The diff-vs-initialValues computation includes `color`. If the user changes only the color, the PATCH body is `{ "color": "mint" }`.
- **REQ-COL-FE-EDIT-04**: Submitting with NO changes (color same as `initialValues.color`, name unchanged, currency unchanged) shows the existing "No hay cambios" toast.

### Frontend — wallet card (COL-FE-CARD)

- **REQ-COL-FE-CARD-01**: `WalletCard` accepts `wallet: WalletResponseDTO` and renders the `ColorBlock` tone from `wallet.color`. The `index` prop is REMOVED from the component's interface and from every call site (`WalletsListPage`).
- **REQ-COL-FE-CARD-02**: If `wallet.color` is somehow not one of the seven valid colors (defensive — backend has fallback already), `WalletCard` falls back to `'lime'`. This is unreachable in practice but protects rendering.
- **REQ-COL-FE-CARD-03**: `WalletBalanceHeader` is NOT changed in this requirement. The hero remains navy (existing behavior). The hero may be revisited in a follow-up change; out-of-scope here.

### Frontend — i18n (COL-FE-I18N)

- **REQ-COL-FE-I18N-01**: New strings under `t.wallets.colors`, Spanish neutro:
  - `lime: 'Lima'`
  - `lilac: 'Lila'`
  - `cream: 'Crema'`
  - `pink: 'Rosa'`
  - `mint: 'Menta'`
  - `coral: 'Coral'`
  - `navy: 'Azul marino'`
- **REQ-COL-FE-I18N-02**: New string `t.wallets.colorLabel: 'Color'` for the form label.

---

## 3. Scenarios

### SCN-COL-CREATE-VALID: Create with color

**Given** the user opens `/wallets/new` and the picker shows `lime` as the default,
**When** they tap the `mint` swatch and submit the form,
**Then** the API receives `{ "color": "mint", ... }`, the server returns 201 with `color: "mint"` in the body, and the new wallet appears in the list with the `mint` `ColorBlock` tone.

---

### SCN-COL-CREATE-INVALID: Invalid color rejected at boundary

**Given** a malformed client `POST /wallets` with `color: "red"`,
**When** the request hits the Zod schema,
**Then** the server returns 400 `validation_failed`. The use case is never invoked.

---

### SCN-COL-CREATE-DEFAULT-FIRST-UNUSED: Smart default selection

**Given** the user has three wallets with colors `lime`, `lilac`, `cream`,
**When** they open `/wallets/new`,
**Then** the picker pre-selects `pink` (the first `WALLET_COLORS` value not yet used).

---

### SCN-COL-CREATE-DEFAULT-ALL-USED: Fallback when all colors are used

**Given** the user has seven wallets covering all seven colors,
**When** they open `/wallets/new`,
**Then** the picker pre-selects `lime` (the fallback). The user can still submit and the new wallet will share its color with an existing one.

---

### SCN-COL-EDIT-CHANGE: Edit changes only color

**Given** a wallet `W` with `color: "lime"` and any transaction count,
**When** the user opens `/wallets/W.id/edit`, taps the `mint` swatch, and submits,
**Then** the PATCH body is `{ "color": "mint" }`. Server returns 200 with `color: "mint"`. The detail page and list page now render mint.

---

### SCN-COL-EDIT-NO-LOCK: Color edits NOT blocked by transactions

**Given** a wallet `W` with 50 active transactions,
**When** the user changes the color via the edit page,
**Then** the request succeeds 200. (Currency would fail with 409, but color has no such lock.)

---

### SCN-COL-LEGACY-RENDER: Legacy wallet renders as lime

**Given** a wallet item in DynamoDB written before this change (no `color` attribute),
**When** the user lists wallets,
**Then** the wallet card renders as `lime` (the mapper's fallback). `GET /wallets` returns `"color": "lime"` in the body.

---

### SCN-COL-LEGACY-EDIT-PERSIST: Legacy wallet edited to a new color

**Given** a legacy wallet (mapper returned `lime`),
**When** the user edits it to `coral`,
**Then** the PATCH succeeds, the item in DynamoDB now has `color: "coral"`, and subsequent reads return `coral` without fallback.

---

### SCN-COL-LIST-NO-INDEX: List page passes no `index` to WalletCard

**Given** the user views `/wallets`,
**When** the list renders three wallets with colors `lime`, `mint`, `coral`,
**Then** each card renders with its OWN color. Deleting the first card (lime) does NOT cause the second card to change color (it stays mint). The previous index-based rotation is gone.
