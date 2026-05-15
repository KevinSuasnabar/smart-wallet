# Spec: category-fork

> SDD phase: spec
> Project: smart-wallet
> Change: category-fork
> Date: 2026-05-15
> Engram topic_key: `sdd/category-fork/spec`

---

## 1. Glossary

| Term | Definition |
|------|------------|
| **Predefined category** | One of 14 system-defined categories with `id` of the form `expense:slug` or `income:slug`. Hardcoded in `shared-types/src/categories.ts`. Shared across all users. |
| **Custom category** | A user-owned category with UUID v4 `id`. Stored in DynamoDB. Has `name`, `type`, `color`, `userId`, timestamps. |
| **Fork** | The act of "editing" a predefined category. Creates a new custom (copying type, taking user-provided name+color OR predefined defaults), hides the predefined for that user, and migrates all of that user's transactions referencing the predefined id to the new custom id. Atomic per chunk (~49 tx per chunk). |
| **Hide** | Marker `(userId, predefinedCategoryId)` persisted in DynamoDB. Means "this user has chosen to hide this predefined from their list". Distinct from "delete" — the predefined still exists globally for other users. |
| **`HiddenPredefinedCategory`** | New domain entity. SK shape `HIDDENCAT#{predefinedId}` under PK `USER#{userId}`. Fields: `predefinedCategoryId`, `createdAt`. |
| **`InvalidCategoryColor`** | New domain error. `httpStatus: 400`, `tag: 'domain.category.invalid_color'`. |
| **`UpdateCategoryRequestSchema`** | New Zod schema. Strict, at-least-one of `{name, color}`. Same shape for both custom edit AND predefined fork. |

---

## 2. Requirements

### Domain layer (FORK-DOM)

- **REQ-FORK-DOM-01**: `Category` props gain `color: WalletColor`. `Category.create()` accepts a `color` arg and validates it via `isWalletColor`. Invalid → `InvalidCategoryColor`.
- **REQ-FORK-DOM-02**: `Category.applyEdits(edits: { name?, color? }, clock)` validates each provided field and rolls back on error. Updates `updatedAt`.
- **REQ-FORK-DOM-03**: `Category.rehydrate(id, props)` accepts `color` in `props`. No validation (adapter-trusted).
- **REQ-FORK-DOM-04**: `InvalidCategoryColor` joins the `CategoryError` union (httpStatus 400).
- **REQ-FORK-DOM-05**: New entity `HiddenPredefinedCategory` at `packages/domain/src/category/HiddenPredefinedCategory.ts`. Factory `create(userId, predefinedId, clock)` validates that `predefinedId` is in `PREDEFINED_CATEGORY_IDS`. Has `createdAt` accessor.
- **REQ-FORK-DOM-06**: New use case `UpdateCustomCategory` in `packages/domain/src/category/usecases/`. Validates the category exists and is custom; calls `applyEdits`; persists via `categoryRepo.update`.
- **REQ-FORK-DOM-07**: New use case `ForkPredefinedCategory`. Validates predefined id; refuses if already hidden (`CategoryAlreadyHidden`, 409); generates new UUID; creates a Custom with merged values (`edits.name ?? predefined.name`, `edits.color ?? predefined.color`, `type = predefined.type`); queries user transactions with the predefined id; calls `categoryRepo.forkPredefined(...)` (which handles chunked migration); returns the new custom.
- **REQ-FORK-DOM-08**: New use case `HidePredefinedCategory`. Validates predefined id; refuses if already hidden (idempotent — returns ok); runs the existing tx-count probe via `transactionRepo.listByCategory(userId, predefinedId, {limit:1})`; if items > 0 → `CategoryHasTransactions` (409); else `categoryRepo.hide(userId, predefinedId)`.
- **REQ-FORK-DOM-09**: `ListCategories` use case also calls `categoryRepo.listHiddenPredefined(userId)` and filters the static predefined list. Predefined response items include `color` from the new color mapping (proposal §4.7). Custom response items include `color` from the entity.

### Repository (FORK-REPO)

- **REQ-FORK-REPO-01**: `CategoryRepository` interface gains:
  - `update(category: Category): Promise<void>` — Put with `attribute_exists(PK)`.
  - `hide(userId: UserId, predefinedId: string): Promise<Result<void, CategoryError>>` — Put HiddenPredefinedCategory with `attribute_not_exists(PK)` for idempotent detect.
  - `listHiddenPredefined(userId: UserId): Promise<string[]>` — paginated Query for `SK begins_with HIDDENCAT#`. Returns the set of hidden predefined ids.
  - `forkPredefined(input: ForkPredefinedInput): Promise<void>` where `ForkPredefinedInput = { userId, predefinedId, newCustom: Category, txSKsToMigrate: { oldSK, newSK, gsi1pk, oldGsi1sk, newGsi1sk }[] }`. Implementation: see design §3.4 (chunked TransactWriteItems).
- **REQ-FORK-REPO-02**: `DynamoDBCategoryRepository` implements all four methods.
- **REQ-FORK-REPO-03**: `CategoryMapper` shape gains optional `color?: string`. Read fallback: `mint` for income type, `coral` for expense type (mirrors current UI behavior).
- **REQ-FORK-REPO-04**: New mapper `HiddenPredefinedCategoryMapper` at `packages/api/src/adapters/dynamodb/mappers/`. Shape: `{ PK, SK, entityType: 'HiddenPredefinedCategory', predefinedCategoryId, createdAt }`.

### Composition (FORK-COMP)

- **REQ-FORK-COMP-01**: `container.ts` exposes:
  - `updateCustomCategory: makeUpdateCustomCategory({ categoryRepo, clock })`
  - `forkPredefinedCategory: makeForkPredefinedCategory({ categoryRepo, transactionRepo, idGen, clock })`
  - `hidePredefinedCategory: makeHidePredefinedCategory({ categoryRepo, transactionRepo, clock })`

### HTTP handlers (FORK-HTTP)

- **REQ-FORK-HTTP-01**: `CategoryIdPathSchema` accepts both UUID v4 AND `(income|expense):slug` shapes.
- **REQ-FORK-HTTP-02**: New handler `patchCategory` at `packages/api/src/handlers/category/`. Validates path + body. Dispatches by `CategoryId.create(path.categoryId).kind`:
  - `custom` → calls `container.updateCustomCategory`. Returns 200 with the updated custom.
  - `predefined` → calls `container.forkPredefinedCategory`. Returns 201 with the new custom (different id from the path).
- **REQ-FORK-HTTP-03**: Handler `deleteCategory` (renamed from `deleteCustomCategory`). Dispatches by kind:
  - `custom` → existing `DeleteCustomCategory`. Returns 204.
  - `predefined` → `HidePredefinedCategory`. Returns 204.
- **REQ-FORK-HTTP-04**: New shared response helper `created(body)` already exists (used by createWallet); reused for the fork-201 path.
- **REQ-FORK-HTTP-05**: `serverless.yml` adds `patchCategory` (PATCH `/categories/{categoryId}`). The existing `deleteCustomCategory` function is RENAMED to `deleteCategory` (route path unchanged: `DELETE /categories/{categoryId}`); the file rename is reflected in the function handler path.

### Shared types (FORK-DTO)

- **REQ-FORK-DTO-01**: `CategoryResponseSchema` (for both predefined and custom) includes `color: zWalletColor`.
- **REQ-FORK-DTO-02**: `PredefinedCategoryResponseSchema` includes `color: zWalletColor`.
- **REQ-FORK-DTO-03**: `CreateCustomCategoryRequestSchema` adds `color: zWalletColor` (required).
- **REQ-FORK-DTO-04**: New `UpdateCategoryRequestSchema`:
  ```ts
  z.object({
    name: z.string().trim().min(1).max(32).optional(),
    color: zWalletColor.optional(),
  })
  .strict()
  .refine(d => d.name !== undefined || d.color !== undefined, ...)
  ```
- **REQ-FORK-DTO-05**: `CategoryIdPathSchema` widened (REQ-FORK-HTTP-01).
- **REQ-FORK-DTO-06**: `PREDEFINED_CATEGORIES` const in `shared-types/src/categories.ts`:
  - Each entry gains `color: WalletColor`. Mapping per proposal §4.7.
  - `name` strings rewritten to Spanish neutro per proposal §4.8.

### Frontend (FORK-FE)

- **REQ-FORK-FE-01**: `CategoryItem` accepts a `color: WalletColor` prop and renders the chip background using `bg-block-${color}` (static map, no template strings). Falls back to mint (income) / coral (expense) only when color is missing in the DTO (defensive).
- **REQ-FORK-FE-02**: `CategoryItem` shows edit + delete affordances for BOTH custom AND predefined items. The component receives `onEdit(categoryId)` and `onDelete(categoryId, name, isPredefined)` callbacks.
- **REQ-FORK-FE-03**: New `EditCategoryDialog` component. Props: `open`, `onOpenChange`, `category: { categoryId, name, color, type, kind: 'custom' | 'predefined' }`. Form: `name` text input + `ColorPicker`. Submit calls `useUpdateCategory()` (which hits PATCH).
- **REQ-FORK-FE-04**: `CreateCategoryDialog` gains a `ColorPicker` field. Default color depends on selected type: `mint` for income, `coral` for expense. Updates when the type field changes.
- **REQ-FORK-FE-05**: `DeleteCategoryConfirm` uses different body text for predefined vs custom:
  - Custom: "¿Eliminar esta categoría? Esta acción no se puede deshacer."
  - Predefined: "Esta categoría predefinida quedará oculta. Para volver a verla, crea una nueva con el mismo nombre."
- **REQ-FORK-FE-06**: `categoriesApi`:
  - `update(categoryId: string, dto: UpdateCategoryDTO): Promise<CategoryResponseDTO>` → PATCH `/categories/{id}`.
  - `delete(categoryId: string): Promise<void>` → DELETE `/categories/{id}` (already exists; widened to accept predefined ids — frontend treats them as strings).
- **REQ-FORK-FE-07**: TanStack hook `useUpdateCategory()`. Invalidates `['categories']` AND `['transactions']` on success (because fork migrates tx category ids).
- **REQ-FORK-FE-08**: TanStack hook `useDeleteCategory()` (rename from `useDeleteCustomCategory`). Same invalidations as #07.
- **REQ-FORK-FE-09**: `CategoriesPage` wires `EditCategoryDialog` next to the existing `DeleteCategoryConfirm`. State holds `editTarget: { categoryId, name, color, type, kind } | null`.
- **REQ-FORK-FE-10**: i18n new strings (Spanish neutro):
  - `t.categories.editTitle: 'Editar categoría'`
  - `t.categories.editSubmit: 'Guardar cambios'`
  - `t.categories.editSuccess: 'Categoría actualizada'`
  - `t.categories.editNoChanges: 'No hay cambios'`
  - `t.categories.deleteCustomBody: '¿Eliminar esta categoría? Esta acción no se puede deshacer.'`
  - `t.categories.deletePredefinedBody: 'Esta categoría predefinida quedará oculta. Para volver a verla, crea una nueva con el mismo nombre.'`
  - `t.categories.colorLabel: 'Color'`
- **REQ-FORK-FE-11**: `CategorySelect` (transaction form integration) renders categories with their color in the dropdown item, matching the CategoryItem visual. Optional polish; not blocking.

---

## 3. Scenarios

### SCN-FORK-CREATE-WITH-COLOR: Create custom with color

**Given** the user opens the Create Category dialog,
**When** they enter `{name: "Hobby", type: "expense", color: "pink"}` and submit,
**Then** the API receives `{name, type, color}`; returns 201 with all four fields; the list refetches and the new category renders with the `pink` chip.

---

### SCN-FORK-CREATE-WITHOUT-COLOR: Reject missing color

**Given** a curl test sends `POST /categories` with `{name, type}` (no color),
**When** Zod validates the body,
**Then** the server returns 400 `validation_failed`. The use case is not invoked.

---

### SCN-FORK-EDIT-CUSTOM: Edit a custom in place

**Given** a custom category `C` with `{name: "Hobby", color: "pink"}`,
**When** the user `PATCH /categories/{C.id}` with `{color: "lilac"}`,
**Then** the server returns 200 with the updated category (`name: "Hobby"`, `color: "lilac"`). The category id is unchanged.

---

### SCN-FORK-EDIT-PREDEFINED-NO-TX: Fork a predefined with zero transactions

**Given** the user has no transactions referencing `expense:food`,
**When** the user `PATCH /categories/expense:food` with `{name: "Comidas", color: "lilac"}`,
**Then** the server returns 201 with `{categoryId: <new-uuid>, name: "Comidas", color: "lilac", type: "expense"}`. The list query no longer includes `expense:food` (it's hidden for this user) but DOES include the new custom.

---

### SCN-FORK-EDIT-PREDEFINED-WITH-TX: Fork with transactions migration

**Given** the user has 3 active transactions with `categoryId: "expense:food"`,
**When** the user `PATCH /categories/expense:food` with `{name: "Comidas", color: "lilac"}`,
**Then** the server returns 201 with the new custom. The 3 transactions are migrated: each row's `categoryId` is now `<new-uuid>` (and the GSI1SK reflects the new id). The predefined `expense:food` is hidden. The total wallet balance is unchanged.

---

### SCN-FORK-HIDE-PREDEFINED: Hide an unused predefined

**Given** the user has no transactions referencing `expense:other`,
**When** the user `DELETE /categories/expense:other`,
**Then** the server returns 204. The list query no longer includes `expense:other`.

---

### SCN-FORK-HIDE-WITH-TX-BLOCKED: Cannot hide a used predefined

**Given** the user has at least one active transaction with `categoryId: "expense:food"`,
**When** the user `DELETE /categories/expense:food`,
**Then** the server returns 409 with `category_has_transactions`. The predefined remains visible.

---

### SCN-FORK-HIDE-IDEMPOTENT: Re-hide is a no-op

**Given** the user already hid `expense:food`,
**When** they `DELETE /categories/expense:food` again,
**Then** the server returns 204 (idempotent — the use case returns ok when the hide marker already exists for that user).

---

### SCN-FORK-EDIT-ALREADY-HIDDEN: Edit-fork on already-hidden returns 409

**Given** the user already hid `expense:food` via a prior DELETE (no fork),
**When** they `PATCH /categories/expense:food` with edits,
**Then** the server returns 409 `category_already_hidden`. (The user can create a fresh custom instead.)

---

### SCN-FORK-LIST-FILTERS: List excludes hidden predefineds

**Given** the user has hidden `expense:food`,
**When** they `GET /categories`,
**Then** the `predefined` array contains 13 entries (14 minus the hidden one). The `custom` array reflects their custom categories (which may include the forked replacement). Every entry includes a `color` field.

---

### SCN-FORK-FE-CATEGORYITEM-COLOR: Frontend renders the chip with color

**Given** a category response with `{color: "lilac"}`,
**When** `CategoryItem` renders,
**Then** the chip background uses the `bg-block-lilac` class. Any item without a `color` (defensive — should not happen post-backend) falls back to mint/coral by type.

---

### SCN-FORK-FE-EDIT-PREDEFINED: UI fork flow

**Given** the user clicks the pencil icon on a predefined category in the list,
**When** the `EditCategoryDialog` opens, pre-populated with the predefined's name and color,
**When** the user changes the name to "Cosas para comer" and submits,
**Then** the PATCH succeeds (returning 201 with a new UUID). The dialog closes. The toast says "Categoría actualizada". The list refetches: the predefined is gone, a new custom appears.

---

### SCN-FORK-FE-DELETE-PREDEFINED: UI hide flow

**Given** the user clicks the trash icon on a predefined category with no transactions,
**When** the `DeleteCategoryConfirm` dialog opens with predefined-specific copy,
**When** they confirm,
**Then** the DELETE succeeds (204). The toast says "Categoría eliminada". The list refetches: the predefined no longer appears.

---

### SCN-FORK-FE-DELETE-PREDEFINED-WITH-TX: UI shows 409 message

**Given** the user clicks trash on `expense:food` which has 3 transactions,
**When** they confirm,
**Then** the DELETE returns 409. The existing `userMessageFor` mapping kicks in and the toast shows "Esta categoría tiene movimientos asociados. Elimina los movimientos primero o cámbialos de categoría."
