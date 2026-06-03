# Proposal: wallet-colors

> SDD phase: propose
> Project: smart-wallet
> Change: wallet-colors
> Date: 2026-05-15
> Engram topic_key: `sdd/wallet-colors/proposal`

## 1. Intent

Today every wallet card in the bento grid is colored by **position** in the list — `TONES[index % 7]`. Reordering or deleting a wallet visually shuffles the colors of every other wallet, which makes color a useless identity cue. The user can't say "my green wallet is for groceries" because next month the green slot is a different wallet.

This change moves color from a presentation concern (computed on render) to a domain attribute (stored on the wallet). The user picks a color when creating the wallet, sees a preview, and the wallet keeps that color forever (or until they edit it). The visual identity of "my green wallet" survives reorders, deletes, and other wallets being added.

Success means: the user creates a wallet, picks "mint", sees the card render as mint immediately, sees the same mint when they reload the page tomorrow, and sees the same mint even after they delete three other wallets. The palette is fixed to the seven design-system tones — no custom hex colors.

## 2. In Scope

### Backend (`packages/api`, `packages/domain`, `packages/shared-types`)

- **New domain attribute** on `Wallet`: `color: WalletColor`. `WalletColor` is a string literal union of the seven design-system tones: `'lime' | 'lilac' | 'cream' | 'pink' | 'mint' | 'coral' | 'navy'`.
- **New shared constant** `WALLET_COLORS` in shared-types — the array of valid colors. Drives Zod validation AND the frontend palette.
- **`CreateWallet` use case** accepts `color: string` as part of its input. The `Wallet.create()` factory validates against `WALLET_COLORS`; rejects invalid colors with a new `InvalidWalletColor` error.
- **`UpdateWallet` use case** accepts an optional `color` field in `edits`. The `Wallet.applyEdits()` method validates the new color the same way as `name` and `currency`. **No "color-lock" rule** — color is always editable, even when the wallet has transactions.
- **DTO surface** in `packages/shared-types/src/schemas/wallet.ts`:
  - `WalletResponseSchema` gains `color: WalletColorSchema`.
  - `CreateWalletRequestSchema` gains `color: WalletColorSchema` (required, no default at the schema level — see §4.3 for why).
  - `UpdateWalletRequestSchema` gains `color: WalletColorSchema.optional()`.
- **DynamoDB mapper** `WalletItem` gains `color: string`. Reads default to `'lime'` for legacy items that don't have the attribute (see §4.5).
- **No schema migration**, no backfill — see §4.5.

### Frontend (`packages/web`)

- **New `ColorPicker` component** at `packages/web/src/features/wallets/components/ColorPicker.tsx`. Renders seven swatches (one per color). Selected swatch shows a focus ring. Click → onChange.
- **`CreateWalletPage`** adds the picker after the currency field. Default selection is `'lime'` (or the first unused color among the user's existing wallets — see §4.4).
- **`EditWalletPage`** adds the picker with the wallet's current color pre-selected. No lock condition — color edits succeed unconditionally.
- **`WalletCard`** reads `wallet.color` instead of computing from `index`. The `index` prop is removed (it was used only for color rotation).
- **`WalletBalanceHeader`** also uses the wallet's color for the hero (currently hardcoded navy). Optional, but proposed.
- **i18n** adds the seven color labels: `lime: 'Lima'`, `lilac: 'Lila'`, `cream: 'Crema'`, `pink: 'Rosa'`, `mint: 'Menta'`, `coral: 'Coral'`, `navy: 'Azul marino'`. Picker shows the label as a tooltip / aria-label.

### What is NOT in scope

- **Custom hex colors / color picker dialog** — the palette is fixed.
- **Colors on categories** — separate concern; this change is scoped to wallets only.
- **Custom labeling of colors** — the user can't rename "lime" to "groceries". The wallet's own name carries that meaning.
- **Migration / backfill** of existing wallets to set a stored color — they default to `'lime'` on read; the user can edit them to whatever color they want.
- **Backend smoke against prod** — strictly a `pnpm smoke:prod` regression check after deploy; no new specific test script for color changes.

## 3. Out of Scope

- Persisting a "preferred default color" per user, similar to the preferred currency in Settings. Possible follow-up; not needed for MVP.
- Color-coded categories or transactions (the wallet's color does NOT propagate down).
- Accessibility audits of color contrast at this stage (the seven design-system tones were already vetted in the redesign).
- Re-rendering historical screenshots / snapshots — the previous "rotate by index" behavior is gone.

## 4. Architectural Decisions

### 4.1 Color is a domain attribute, not a presentation concern

The previous behavior (`TONES[index % 7]`) was a computed property of the rendering layer. Moving color to the entity:

- Survives sort, delete, reorder.
- Lets `WalletCard` lose its `index` prop dependency (only existed for color rotation).
- Aligns with how `currency` already works: a domain-stored attribute the UI displays.

Trade-off accepted: the entity grows by one string field. Tiny.

### 4.2 Palette: literal union, NOT hex string

`WalletColor` is `'lime' | 'lilac' | 'cream' | 'pink' | 'mint' | 'coral' | 'navy'`. Reasons:

- The seven tones are baked into Tailwind config (`bg-block-*`) and `ColorBlock`. Hex strings would require a custom CSS / inline-style path and break the design system contract.
- Zod can validate against a literal union with one line.
- Future palette changes happen at one place (the union + Tailwind config + the i18n labels).
- The user explicitly said they want predefined design colors, not free choice.

### 4.3 `color` is REQUIRED on create, no schema default

The user picks a color. The schema has NO `.default()` because:

- A default at the schema layer would silently green-light old API clients that don't send a color; we want them to fail loudly so they're updated.
- The frontend always sends a value (the picker starts at `'lime'`).
- The Wallet entity itself has no constructor default — color is always passed explicitly.

The handler still receives the `color` field; if a client genuinely doesn't send one (curl test, malformed integration), it gets a 400. Clear and predictable.

### 4.4 Default color in the create form: first unused (with fallback to `lime`)

When the user opens `/wallets/new`, the picker starts at:

1. The first color from `WALLET_COLORS` that no existing wallet of the user is using.
2. If all seven colors are already in use (≥ 7 wallets), fall back to `'lime'`.

Rationale: nudges the user toward diverse wallet colors out of the box; explicit selection still wins.

A simpler alternative is "always start at `lime`". Accepted as a fallback when the userwallets query is loading or fails — defensive default. The dual behavior is acceptable complexity (~5 LOC) for a noticeable UX win.

### 4.5 Backwards-compat: legacy wallets without a stored `color`

Old wallets in DynamoDB were written before this change. Their `color` attribute is absent. The mapper:

```ts
const color: WalletColor = isValidWalletColor(item.color) ? item.color : 'lime';
```

So a legacy wallet appears as a lime card. The user can edit it to anything via the existing Edit page (which now includes the color picker). No migration job, no backfill, no breaking change.

When the wallet is next persisted (rename, edit color, currency change on empty), the `color` field is written for the first time, and the legacy state disappears.

### 4.6 No new error class for "invalid color" at the use case level

The `Wallet.create()` factory ALREADY rejects unknown currencies with `InvalidWalletCurrency`. We add `InvalidWalletColor` symmetrically. HTTP status 400, tag `domain.wallet.invalid_color`.

The Zod schema at the boundary catches invalid colors first (validation_failed → 400), so the domain error is a belt-and-suspenders fallback that fires only when the entity is constructed from an invalid in-memory state (e.g., a test).

### 4.7 No optimistic UI

Same as prior changes. After a successful create/edit, the wallet caches are invalidated; the picker reflects the new color on the next refetch. No flash-then-correct.

### 4.8 `index` prop on `WalletCard` is removed

It existed only for `TONES[index % 7]`. After this change, the index has no semantic role. The list pages stop passing it.

### 4.9 No color on transactions or categories — yet

The user did mention "categorías con color" in the original ask. That ships in `category-fork` (the follow-up SDD). This change keeps the surface area focused on wallets.

## 5. Risks

| Risk                                                                                                                           | Severity | Mitigation                                                                                                                                          |
| ------------------------------------------------------------------------------------------------------------------------------ | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Legacy wallets renderall-lime, looks like a bug                                                                                | Low      | The picker is reachable in two clicks (Edit page); the user can fix it. The default is documented.                                                  |
| `color` field becomes part of the API contract; future palette changes require both shared-types AND DynamoDB items to migrate | Low      | Adding a new color literal to the union is non-breaking. Removing an existing one is breaking — palette additions only, for the foreseeable future. |
| The "first unused color" pre-selection requires loading all wallets before opening the create page                             | Low      | `useWallets()` is already cached; the picker reads from the cache. If the cache is empty, fallback to `'lime'`.                                     |
| Conflict with future `wallet-colors-v2` proposing custom hex                                                                   | Low      | If/when that lands, it's a new field (`hexColor?: string`) alongside the existing `color` enum, not a breaking change.                              |
| Test surface — no tests                                                                                                        | Accepted | `strict_tdd: false`. Manual smoke covers create+edit+legacy paths.                                                                                  |

## 6. Success Criteria

1. `POST /wallets` accepts a `color` field and rejects 400 if missing or invalid.
2. `PATCH /wallets/{walletId}` accepts an optional `color` field and edits it without any extra constraint.
3. `GET /wallets/{walletId}` and `GET /wallets` return `color` in the body.
4. A wallet created today persists its color across reloads, deletes of OTHER wallets, and edit cycles.
5. A wallet created BEFORE this change (no `color` in storage) renders as lime and is editable from the EditWalletPage's picker.
6. The CreateWalletPage and EditWalletPage both render the seven-swatch ColorPicker, with the selected swatch highlighted.
7. The WalletCard reads `wallet.color` and renders the chosen ColorBlock tone — no more position-based rotation.
8. `pnpm typecheck` green across shared-types, domain, api, web.
9. Local smoke covers 5 scenarios: create with lime, create with mint, edit lime → mint, legacy wallet renders lime, legacy wallet edited to mint.
