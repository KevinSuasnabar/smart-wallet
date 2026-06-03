# Proposal: category-fork

> SDD phase: propose
> Project: smart-wallet
> Change: category-fork
> Date: 2026-05-15
> Engram topic_key: `sdd/category-fork/proposal`

## 1. Intent

Today, the 14 **predefined categories** (Salary, Food, Rent, etc.) are global constants the user **cannot touch** — can't rename, can't change color (there is no color yet), can't delete. The user requested all three. Custom categories also lack a color field.

Three things ship together in this change:

1. **Color on every category**, mirroring the wallet color palette (`lime, lilac, cream, pink, mint, coral, navy`). Predefined categories get hardcoded color assignments (food→coral, salary→mint, etc.); custom categories get a color at creation, editable later.
2. **Edit on every category**: name and color are mutable. Editing a **custom** category updates it in place. Editing a **predefined** category forks it into a new custom (taking the user's edits + the predefined's defaults as a baseline) AND migrates every transaction that referenced the predefined id to the new custom id.
3. **Delete on every category**: deleting a **custom** uses the existing flow. Deleting a **predefined** hides it for that user (a new HiddenPredefinedCategory marker stored per-user). Both are blocked when the category has active transactions (existing `category-has-transactions` guard, extended to predefineds).

The Spanish-neutro names also land: today the predefined catalog has English names (Salary, Food, ...) — they're rewritten as Spanish neutro (Sueldo, Comida, ...).

Success means: the user can rename, recolor, and delete any category in the list — without orphaning transactions and without losing the design-system look.

## 2. In Scope

### Backend (`packages/api`, `packages/domain`, `packages/shared-types`, `packages/infra-sls`)

#### Color on categories

- **`Category` entity** gains `color: WalletColor` (reusing the wallet palette type — keeps the design system single-source-of-truth). New domain error `InvalidCategoryColor` (HTTP 400).
- **`CategoryMapper`** writes/reads `color`; legacy custom-category rows without `color` default to `coral` (expense) / `mint` (income) — same convention as the existing CategoryItem renderer.
- **`CreateCustomCategoryRequestSchema`** gains `color: zWalletColor` (required).
- **`PREDEFINED_CATEGORIES`** in shared-types gains a `color` per entry — see §4.7 for the mapping.

#### Edit custom + edit predefined (fork)

- **New use case `UpdateCustomCategory`** (`packages/domain/src/category/usecases/`). Takes `{ userId, categoryId, edits: { name?, color? } }`. Loads the custom category, validates, calls `category.applyEdits(edits, clock)`, persists. Mirrors `UpdateWallet`.
- **`Category.applyEdits(edits, clock)`** — new entity method (mirrors `Wallet.applyEdits`).
- **New use case `ForkPredefinedCategory`** (`packages/domain/src/category/usecases/`). Takes `{ userId, predefinedId, edits: { name?, color? } }`. Steps:
  1. Validate `predefinedId` shape and existence in `PREDEFINED_CATEGORIES`.
  2. Refuse if a `HiddenPredefinedCategory` for `(userId, predefinedId)` already exists (idempotency: the user already forked / hid it).
  3. Generate a new custom `CategoryId` (UUID v4).
  4. Create the custom `Category` entity with merged values: `edits.name ?? predefined.name` (Spanish neutro), `edits.color ?? predefined.color`, `type = predefined.type`.
  5. Query all of the user's transactions whose `categoryId === predefinedId`. Chunked TransactWriteItems migrates each transaction (Delete old SK + Put new SK with updated categoryId AND GSI1SK) plus a hide record AND the new custom Put — atomic per chunk. The first chunk includes the custom Put + hide Put + up to 49 tx migrations; subsequent chunks include only tx migrations (49 each).
  6. Return the new custom Category.
- **New use case `HidePredefinedCategory`** (`packages/domain/src/category/usecases/`). Takes `{ userId, predefinedId }`. Steps:
  1. Validate predefinedId shape and existence.
  2. Run the existing `categoryHasTransactions(predefinedId)` probe (extended from custom to predefined). Block with `CategoryHasTransactions` (409) when ≥ 1 active transaction references the predefined id.
  3. Refuse if already hidden (idempotency: 204 from handler).
  4. Persist a `HiddenPredefinedCategory` marker.

#### New domain entity

- **`HiddenPredefinedCategory`** — small entity with two fields: `userId`, `predefinedCategoryId`, plus `createdAt`. Lives at `packages/domain/src/category/HiddenPredefinedCategory.ts`. Validation: `predefinedCategoryId` must be one of the 14 predefined ids.

#### Repository extensions

- **`CategoryRepository`** gains:
  - `update(category)` — Put with `attribute_exists(PK)` so a vanished custom surfaces an error.
  - `hide(userId, predefinedId)` — 1-op write of the new marker item (Put with `attribute_not_exists(PK)` for "already hidden" detection).
  - `listHiddenPredefined(userId)` — paginated Query for all HIDDENCAT items.
  - `forkPredefined(userId, predefinedId, newCustom, txMigrations)` — see §4.4 for the chunked-TransactWriteItems algorithm.

#### List endpoint

- **`ListCategories`** use case now queries hidden predefineds AND uses them to filter the static predefined list. Predefined response items now include `color`. Custom response items now include `color` from the entity (already loaded from the mapper).

#### Handlers

- **`PATCH /categories/{categoryId}`** — new endpoint. Path schema accepts BOTH UUID v4 AND predefined ID format. Backend dispatches:
  - `kind === 'custom'` → `UpdateCustomCategory`. Returns 200 with the updated custom category.
  - `kind === 'predefined'` → `ForkPredefinedCategory`. Returns 201 with the newly-forked custom category.
- **`DELETE /categories/{categoryId}`** — extended. Path schema accepts BOTH UUID v4 AND predefined ID format. Backend dispatches:
  - `kind === 'custom'` → existing `DeleteCustomCategory`. Returns 204.
  - `kind === 'predefined'` → `HidePredefinedCategory`. Returns 204.

#### serverless.yml

- New function `patchCategory` (PATCH route).
- The existing `deleteCustomCategory` function's PATH schema needs widening — see §4.3 for backwards-compat plan (TL;DR: we rename the handler to `patchCategory` / `deleteCategory` and update the function to accept both id shapes).

### Frontend (`packages/web`)

- **`CategoryItem`** renders the category's color (from `wallet.color`-like enum). Custom items get edit + delete affordances; predefined items now ALSO get edit + delete affordances.
- **New `EditCategoryDialog`** — controlled dialog with `name` (text) + `color` (ColorPicker). Used for both custom and (forked-from) predefined edits.
- **`CreateCategoryDialog`** gains the `ColorPicker` next to the existing name + type fields.
- **`DeleteCategoryConfirm`** copy is unchanged for custom; for predefined it uses a softer message: "Esta categoría predefinida quedará oculta. Puedes volver a verla creando una nueva con el mismo nombre."
- **`categoriesApi`** gains `update(categoryId, dto)` (PATCH), and `delete` (now also accepts predefined ids).
- **TanStack hooks**: `useUpdateCategory()` (covers both update-custom and fork-predefined — same endpoint). `useDeleteCategory()` (covers both custom delete and predefined hide). Both invalidate `['categories']` AND `['transactions']` because fork migrates transaction category ids.
- **i18n**: Spanish-neutro labels for the 14 predefined categories. New strings for the edit dialog and the predefined-delete dialog copy.

### Out of scope (§3 below clarifies)

- Per-user "favorite" ordering of categories.
- Sub-categories.
- Re-enabling hidden predefineds via UI (the user can recreate as custom).
- Migration of soft-deleted transactions (the existing soft-delete filter `attribute_not_exists(deletedAt)` already excludes them; forking with limit query catches that).

## 3. Out of Scope

- **Color on transactions** — transactions inherit visual cues from their category in the UI; storing a color on a transaction is not requested and would duplicate state.
- **Restoring a hidden predefined** — once hidden, it stays hidden. The user can create a custom from scratch if they need that label back.
- **Predefined categories rename at the catalog level** — the rename in this change is the Spanish-neutro translation of the existing 14 names, not a "add new predefined" workflow.
- **Migration tooling for production data** — legacy custom-category rows without a `color` attribute fall back to mint/coral on read; no batch migration runs. New writes (after this change) include the color.
- **End-to-end atomicity of fork when a predefined has > 49 transactions** — per-chunk-atomic only. Documented in §4.5.
- **Tests** — `strict_tdd: false`. Manual smoke covers the happy paths and the chunked migration with 5–10 transactions.

## 4. Architectural Decisions

### 4.1 Reuse `WalletColor` for category colors

Instead of inventing a separate `CategoryColor` palette, reuse the seven `WalletColor` values. Reasons:

- Same Tailwind tokens; same `ColorBlock` rendering primitive; same `ColorPicker` component (already built).
- No risk of palette drift between wallets and categories.
- The user explicitly said "categories should have the same palette as wallets".

The shared-types module exports `WalletColor` but the name is misleading once it's used for both. We accept the name for now (renaming is a follow-up) and import it as `WalletColor` from the category code.

### 4.2 Fork-on-edit, NOT global edit

When the user "edits a predefined category", we create a NEW custom category with their edits applied, hide the predefined, and migrate that user's transactions to the new custom. Reasons:

- Predefineds are global constants shared across all users (today). Letting one user edit a global would break the others.
- A "fork" model gives the user the illusion of editing without breaking the global invariant.
- Transaction migration keeps the user's history coherent (their old "Food" purchases now show under the renamed "Comidas" category).

Trade-off: the `id` of the category changes invisibly to the user. Their transactions before the fork referenced `expense:food`; after the fork they reference a fresh UUID. We migrate atomically so the user never sees a stale `categoryId` in the UI.

### 4.3 Single PATCH/DELETE endpoint dispatching by id kind

Rather than two new endpoints (`PATCH /categories/predefined/{id}` and `PATCH /categories/custom/{id}`), we widen the existing routes to accept both id shapes and dispatch inside the handler. Reasons:

- The frontend doesn't need to know the difference at the call site; the URL is the same.
- Reduces serverless function count + IAM surface.
- The Zod path schema becomes `z.string().regex(/^(expense|income):[a-z]+$/).or(zUuid)` — clear, narrow, two-shape acceptance.

We rename the handler from `deleteCustomCategory` to `deleteCategory` and add `patchCategory`. The `patchWallet`-style function entries in `serverless.yml` are renamed accordingly. Backwards-compat: the route paths stay the same; only the handler filename changes.

### 4.4 `forkPredefined` algorithm (atomic per chunk)

```
1. Build the new custom Category entity (name + color + type, fresh UUID).
2. Query all user transactions where categoryId === predefinedId (paginated).
3. Build a TransactWriteItems with:
   [0] Put new custom (ConditionExpression: attribute_not_exists(PK)) — new uuid, fresh row
   [1] Put HiddenPredefinedCategory (ConditionExpression: attribute_not_exists(PK))
   [2..N] For each transaction (up to 47 in the first chunk; 49 in subsequent):
     Delete old transaction row (SK includes occurredAt and old categoryId in GSI1SK).
     Put new transaction row (SK same; GSI1SK updated to new categoryId).
   This means each tx migration = 2 ops. So the first chunk: 2 (custom + hide) + 2 * 49 = 100. The chunk size is 49 tx.
4. Subsequent chunks: 2 * 49 = 98 ops each (just tx migrations).
5. If any chunk fails (concurrent edit, throttle), retry from that chunk; idempotency holds because:
   - The custom is already Put in chunk 1; chunk 2 doesn't touch it.
   - HiddenPredefinedCategory is already Put in chunk 1; retry of chunk 1 fails its
     attribute_not_exists check, but we treat that as "already done" via a try-catch
     that special-cases the [0]/[1] reasons.
   - Per-transaction Delete+Put is idempotent: the Delete fails if the row
     already moved (the SK with old categoryId no longer exists), and Put fails
     if the new row already exists. We treat both as no-ops.
```

Trade-off: complex retry logic. We accept that fork on a user with > 49 transactions of a single predefined category is rare in the MVP single-user app. Documented and tested manually with up to 10 tx (single chunk).

### 4.5 Hide-only (no fork) when DELETE on predefined

DELETE on a predefined is interpreted as "hide it". We DON'T silently fork+hide because:

- The user wanted to delete, not to edit.
- Hide is a small write (one item).
- The transaction-guard (extended from custom) prevents orphaned tx references: if the predefined has active txs, the DELETE returns 409 with the existing `category_has_transactions` code. The UI surfaces "esta categoría tiene movimientos; eliminalos primero" (already implemented in `category-delete-guard`).

### 4.6 Path schema accepts both id shapes

```ts
export const CategoryIdPathSchema = z.object({
  categoryId: z.union([
    z.string().uuid(),
    z.string().regex(/^(income|expense):[a-z]+$/, 'Invalid predefined category id'),
  ]),
});
```

The handler then uses `CategoryId.create(path.categoryId)` and switches on `categoryId.kind`. Existing `validateCategoryForTransaction` already does this kind-dispatch and stays intact.

### 4.7 Predefined color mapping (one-time decision)

The 14 predefined categories get colors hardcoded based on semantic intuition + design balance:

| Id                      | Type    | Color |
| ----------------------- | ------- | ----- |
| `income:salary`         | income  | mint  |
| `income:freelance`      | income  | mint  |
| `income:investment`     | income  | lime  |
| `income:gift`           | income  | pink  |
| `income:other`          | income  | cream |
| `expense:food`          | expense | coral |
| `expense:transport`     | expense | lilac |
| `expense:rent`          | expense | navy  |
| `expense:utilities`     | expense | cream |
| `expense:entertainment` | expense | pink  |
| `expense:health`        | expense | mint  |
| `expense:education`     | expense | lilac |
| `expense:shopping`      | expense | coral |
| `expense:other`         | expense | cream |

Once locked in, these are the user's starting point — they can fork and recolor any of them.

### 4.8 Spanish-neutro names for the predefined catalog

Replace the English names with neutro:

| Id                      | English (old) | Neutro (new)    |
| ----------------------- | ------------- | --------------- |
| `income:salary`         | Salary        | Sueldo          |
| `income:freelance`      | Freelance     | Freelance       |
| `income:investment`     | Investment    | Inversión       |
| `income:gift`           | Gift          | Regalo          |
| `income:other`          | Other         | Otros           |
| `expense:food`          | Food          | Comida          |
| `expense:transport`     | Transport     | Transporte      |
| `expense:rent`          | Rent          | Alquiler        |
| `expense:utilities`     | Utilities     | Servicios       |
| `expense:entertainment` | Entertainment | Entretenimiento |
| `expense:health`        | Health        | Salud           |
| `expense:education`     | Education     | Educación       |
| `expense:shopping`      | Shopping      | Compras         |
| `expense:other`         | Other         | Otros           |

Smart-wallet API has only one consumer (the smart-wallet web), so changing these names breaks nothing externally.

### 4.9 No re-show / un-hide affordance

Once a user hides a predefined, it stays hidden. They can't toggle it back. Reasons:

- The user can always create a custom category with the same name + type if they regret it.
- Keeps the UI surface area smaller.
- A "show hidden" toggle in Categories settings is a future SDD if requested.

### 4.10 No timestamps on the `HiddenPredefinedCategory` beyond `createdAt`

The marker is a tombstone-ish item. We don't track `updatedAt` (it's never updated). We DO track `createdAt` for forensics. The DynamoDB row gets a TTL of "never" — manual cleanup via a future audit tool, if anyone ever cares.

## 5. Risks

| Risk                                                                                                                                                                      | Severity | Mitigation                                                                                                                                                             |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `forkPredefined` partial cascade on a 100-tx predefined leaves transactions split between old and new ids                                                                 | Medium   | Per-chunk atomicity. Retry-safe (each tx migration is idempotent). UI surfaces a generic error; user retries the edit. Smoke test with 10 tx (single chunk).           |
| Renaming predefined IDs (the new Spanish names) breaks API smoke tests that hardcoded English strings                                                                     | Medium   | We grep `smoke.sh` and `smoke-prod.sh` and update all literal English category names to the new neutro names. Confirmed: no test asserts the name.                     |
| Legacy custom-category rows in DynamoDB have no `color` attribute → fallback at the mapper level might choose poorly for income-vs-expense                                | Low      | Read-time fallback: `mint` for income, `coral` for expense. Matches the previous hardcoded UI behavior. On next edit, the user picks a real color.                     |
| `UpdateCategoryRequestSchema` rejecting unknown keys (`.strict()`) might break a frontend that sends `type`                                                               | Low      | `type` is NOT mutable (you can't edit a category from income to expense — transactions would be invalid). Strict rejection is correct. The frontend won't send `type`. |
| Predefined hide + transactions edge case: user hides predefined, then a future feature reintroduces transactions referencing it                                           | Low      | Out-of-scope. The hide guard checks current state only.                                                                                                                |
| Frontend cache invalidation: fork changes the category id of every affected transaction; if the user is mid-edit on a transaction at fork time, they'll see a stale state | Low      | Refetch on cache invalidation; the user retries. No data loss.                                                                                                         |

## 6. Success Criteria

1. `POST /categories` with `{name, type, color}` returns 201 with the new custom category including `color`.
2. `POST /categories` without `color` returns 400.
3. `PATCH /categories/{customId}` with `{name, color}` returns 200 with the updated custom.
4. `PATCH /categories/{predefinedId}` with `{name, color}` returns 201 with a NEW custom (different id) AND hides the predefined for that user. Any user transactions with the old predefined id are migrated to the new id.
5. `DELETE /categories/{customId}` returns 204 (existing flow).
6. `DELETE /categories/{predefinedId}` returns 204 AND adds a hide for that user, unless the predefined has active transactions, in which case it returns 409 `category_has_transactions`.
7. `GET /categories` returns predefined (minus hidden) WITH color, AND custom WITH color.
8. The frontend renders every category with its color. The 14 predefineds use the names from §4.8 (Spanish neutro).
9. The frontend edit dialog opens for both custom and predefined categories.
10. `pnpm typecheck` green across all packages.
11. Local smoke covers 9 scenarios: create with color (200), create without (400), edit custom (200), fork predefined with 0 tx (201 + hide), fork predefined with 3 tx (201 + hide + 3 tx migrated), delete custom (204), hide predefined with 0 tx (204), hide predefined with 1 tx (409), list returns colors + hidden filtered.
