# Design: category-fork

> SDD phase: design
> Project: smart-wallet
> Change: category-fork
> Date: 2026-05-15
> Engram topic_key: `sdd/category-fork/design`

---

## 1. Files affected

### New

```
packages/domain/src/category/HiddenPredefinedCategory.ts
packages/domain/src/category/usecases/UpdateCustomCategory.ts
packages/domain/src/category/usecases/ForkPredefinedCategory.ts
packages/domain/src/category/usecases/HidePredefinedCategory.ts

packages/api/src/adapters/dynamodb/mappers/HiddenPredefinedCategoryMapper.ts
packages/api/src/handlers/category/patchCategory.ts

packages/infra-sls/src/handlers/category/patchCategory.ts   # re-export shim
packages/infra-sls/src/handlers/category/deleteCategory.ts  # re-export shim (rename)

packages/web/src/features/categories/components/EditCategoryDialog.tsx
```

### Modified

```
packages/shared-types/src/categories.ts                       # +color per entry, Spanish neutro names
packages/shared-types/src/schemas/category.ts                 # +UpdateCategoryRequestSchema, +color in others, widen path schema
packages/shared-types/src/index.ts                            # re-export

packages/domain/src/category/Category.ts                      # +color field, +applyEdits
packages/domain/src/category/CategoryError.ts                 # +InvalidCategoryColor, +CategoryAlreadyHidden
packages/domain/src/category/CategoryRepository.ts            # +update, +hide, +listHiddenPredefined, +forkPredefined
packages/domain/src/category/usecases/ListCategories.ts       # +hide filter, +color in predefined output
packages/domain/src/category/index.ts                         # re-exports

packages/api/src/adapters/dynamodb/repositories/DynamoDBCategoryRepository.ts
                                                              # implement update, hide, listHiddenPredefined, forkPredefined
packages/api/src/adapters/dynamodb/mappers/CategoryMapper.ts  # +color w/ type-based fallback
packages/api/src/adapters/dynamodb/keyBuilders.ts             # +hiddenPredefinedSK
packages/api/src/composition/container.ts                     # +3 new use cases
packages/api/src/handlers/category/listCategories.ts          # +color in response
packages/api/src/handlers/category/createCustomCategory.ts    # +color in input + response
packages/api/src/handlers/category/deleteCustomCategory.ts    # RENAMED → deleteCategory.ts, +predefined branch

packages/infra-sls/serverless.yml                             # +patchCategory, rename deleteCustomCategory → deleteCategory
packages/infra-sls/smoke-tests/smoke.sh                       # update for the new flow

packages/web/src/lib/i18n.ts                                  # new strings + neutro labels
packages/web/src/features/categories/categoriesApi.ts         # +update
packages/web/src/features/categories/queries.ts               # +useUpdateCategory, rename hooks
packages/web/src/features/categories/components/CategoryItem.tsx      # +color rendering, +edit affordance for both kinds
packages/web/src/features/categories/components/CategoryList.tsx      # pass edit/delete to predefined too
packages/web/src/features/categories/components/CreateCategoryDialog.tsx  # +ColorPicker, default-by-type
packages/web/src/features/categories/components/DeleteCategoryConfirm.tsx # variant body for predefined
packages/web/src/features/categories/pages/CategoriesPage.tsx # +EditCategoryDialog state + wiring
```

Total: 9 new files, 21 modified. Estimated ~1200 LOC delta.

---

## 2. Shared types

### 2.1 `categories.ts` — color + neutro names

```ts
import type { WalletColor } from './wallet-colors.js';

export const PREDEFINED_CATEGORIES = [
  { categoryId: 'income:salary', name: 'Sueldo', type: 'income', color: 'mint' },
  { categoryId: 'income:freelance', name: 'Freelance', type: 'income', color: 'mint' },
  { categoryId: 'income:investment', name: 'Inversión', type: 'income', color: 'lime' },
  { categoryId: 'income:gift', name: 'Regalo', type: 'income', color: 'pink' },
  { categoryId: 'income:other', name: 'Otros', type: 'income', color: 'cream' },
  { categoryId: 'expense:food', name: 'Comida', type: 'expense', color: 'coral' },
  { categoryId: 'expense:transport', name: 'Transporte', type: 'expense', color: 'lilac' },
  { categoryId: 'expense:rent', name: 'Alquiler', type: 'expense', color: 'navy' },
  { categoryId: 'expense:utilities', name: 'Servicios', type: 'expense', color: 'cream' },
  { categoryId: 'expense:entertainment', name: 'Entretenimiento', type: 'expense', color: 'pink' },
  { categoryId: 'expense:health', name: 'Salud', type: 'expense', color: 'mint' },
  { categoryId: 'expense:education', name: 'Educación', type: 'expense', color: 'lilac' },
  { categoryId: 'expense:shopping', name: 'Compras', type: 'expense', color: 'coral' },
  { categoryId: 'expense:other', name: 'Otros', type: 'expense', color: 'cream' },
] as const satisfies ReadonlyArray<{
  categoryId: string;
  name: string;
  type: CategoryType;
  color: WalletColor;
}>;
```

The `as const satisfies` pattern keeps strict literal types while validating each entry's shape.

### 2.2 `schemas/category.ts` — color + Update schema + widened path

```ts
export const CategoryResponseSchema = z.object({
  categoryId: z.string(),
  name: z.string(),
  type: zCategoryType,
  color: zWalletColor,
  createdAt: z.string(),
});

export const PredefinedCategoryResponseSchema = z.object({
  categoryId: z.string(),
  name: z.string(),
  type: zCategoryType,
  color: zWalletColor,
});

export const CreateCustomCategoryRequestSchema = z.object({
  name: z.string().trim().min(1).max(32),
  type: zCategoryType,
  color: zWalletColor,
});

export const UpdateCategoryRequestSchema = z
  .object({
    name: z.string().trim().min(1).max(32).optional(),
    color: zWalletColor.optional(),
  })
  .strict()
  .refine((d) => d.name !== undefined || d.color !== undefined, {
    message: 'At least one mutable field must be provided',
  });

// Accept both UUID v4 and predefined id (income|expense:slug)
export const CategoryIdPathSchema = z.object({
  categoryId: z.union([
    zUuid,
    z.string().regex(/^(income|expense):[a-z]+$/, 'Invalid predefined category id'),
  ]),
});
```

---

## 3. Domain layer

### 3.1 `Category.ts` — color + applyEdits

```ts
import { isWalletColor } from '../shared/WalletColor.js';
import type { WalletColor } from '../shared/WalletColor.js';
import { InvalidCategoryColor } from './CategoryError.js';

export interface CategoryProps {
  userId: UserId;
  name: string;
  type: CategoryType;
  color: WalletColor;        // NEW
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export interface CreateCategoryProps {
  id: CategoryId;
  userId: UserId;
  name: string;
  type: CategoryType;
  color: string;             // NEW (validated in create)
  clock: Clock;
}

// inside create():
if (!isWalletColor(props.color)) {
  return err(new InvalidCategoryColor());
}

// new method:
applyEdits(
  edits: { name?: string; color?: string },
  clock: Clock,
): Result<void, CategoryError> {
  const snapshot: CategoryProps = { ...this._props };

  if (edits.name !== undefined) {
    const trimmed = edits.name.trim();
    if (trimmed.length === 0 || trimmed.length > 32) {
      return err(new InvalidCategoryName());
    }
    this._props.name = trimmed;
  }

  if (edits.color !== undefined) {
    if (!isWalletColor(edits.color)) {
      this._props = snapshot;
      return err(new InvalidCategoryColor());
    }
    this._props.color = edits.color;
  }

  this._props.updatedAt = clock.now();
  return ok(undefined);
}
```

### 3.2 `CategoryError.ts` — new errors

```ts
export class InvalidCategoryColor extends DomainError {
  readonly tag = 'domain.category.invalid_color' as const;
  readonly httpStatus = 400 as const;
  constructor(message = 'Category color must be one of the predefined palette values') {
    super(message);
  }
}

export class CategoryAlreadyHidden extends DomainError {
  readonly tag = 'domain.category.already_hidden' as const;
  readonly httpStatus = 409 as const;
  constructor(message = 'Predefined category is already hidden for this user') {
    super(message);
  }
}

export type CategoryError =
  | InvalidCategoryId
  | InvalidCategoryName
  | InvalidCategoryType
  | InvalidCategoryColor // NEW
  | CannotDeletePredefined
  | CategoryTypeMismatch
  | CategoryAlreadyDeleted
  | CategoryHasTransactions
  | CategoryAlreadyHidden; // NEW
```

### 3.3 `HiddenPredefinedCategory.ts` — new entity

```ts
import { ok, err } from '../shared/Result.js';
import type { Result } from '../shared/Result.js';
import type { Clock } from '../shared/Clock.js';
import type { UserId } from '../user/UserId.js';
import { InvalidCategoryId } from './CategoryError.js';
import type { CategoryError } from './CategoryError.js';

// Imported from shared-types for validation, but lived here as a literal:
const PREDEFINED_IDS = [
  'income:salary',
  'income:freelance',
  'income:investment',
  'income:gift',
  'income:other',
  'expense:food',
  'expense:transport',
  'expense:rent',
  'expense:utilities',
  'expense:entertainment',
  'expense:health',
  'expense:education',
  'expense:shopping',
  'expense:other',
] as const;

export class HiddenPredefinedCategory {
  private constructor(
    public readonly userId: UserId,
    public readonly predefinedCategoryId: string,
    public readonly createdAt: Date,
  ) {}

  static create(props: {
    userId: UserId;
    predefinedCategoryId: string;
    clock: Clock;
  }): Result<HiddenPredefinedCategory, CategoryError> {
    if (!(PREDEFINED_IDS as readonly string[]).includes(props.predefinedCategoryId)) {
      return err(new InvalidCategoryId('Unknown predefined category id'));
    }
    return ok(
      new HiddenPredefinedCategory(props.userId, props.predefinedCategoryId, props.clock.now()),
    );
  }

  static rehydrate(props: {
    userId: UserId;
    predefinedCategoryId: string;
    createdAt: Date;
  }): HiddenPredefinedCategory {
    return new HiddenPredefinedCategory(props.userId, props.predefinedCategoryId, props.createdAt);
  }
}
```

### 3.4 Use cases — three new

**`UpdateCustomCategory`** — straightforward. Loads custom, runs `applyEdits`, persists.

**`ForkPredefinedCategory`**:

```ts
async (input) => {
  // 1. validate userId, predefined id
  // 2. check not already hidden (categoryRepo.listHiddenPredefined)
  //    → if hidden → return err(CategoryAlreadyHidden)
  // 3. find the predefined catalog entry → name + type + color defaults
  // 4. resolve merged values: edits.name ?? predefined.name, edits.color ?? predefined.color
  // 5. generate UUID via idGen
  // 6. Category.create(...) the new custom
  // 7. query transactionRepo.listByCategory(userId, predefinedId, { limit: huge })
  //    (paginated until done — collect all old SKs + their fields needed to rebuild GSI1SK)
  // 8. call categoryRepo.forkPredefined({
  //       userId, predefinedId, newCustom, txMigrations: [...],
  //    })
  // 9. return ok(newCustom)
};
```

**`HidePredefinedCategory`**:

```ts
async (input) => {
  // 1. validate userId, predefined id
  // 2. check tx count via transactionRepo.listByCategory(limit: 1)
  //    → items.length > 0 → return err(CategoryHasTransactions)
  // 3. categoryRepo.hide(userId, predefinedId)
  //    → on already_hidden → return ok(undefined) [idempotent]
  //    → other errors propagate
};
```

### 3.5 `ListCategories` — filter hidden + colors

```ts
const [customResult, hiddenIds] = await Promise.all([
  deps.categoryRepo.listCustomByUser(userId),
  deps.categoryRepo.listHiddenPredefined(userId),
]);
const hiddenSet = new Set(hiddenIds);

const predefined = PREDEFINED_CATEGORIES
  .filter(c => !hiddenSet.has(c.categoryId))
  .map(c => ({ id: c.categoryId, name: c.name, type: c.type, color: c.color, slug: ... }));

return ok({ predefined, custom });
```

The handler maps `predefined.color` and `custom.color` into the response.

---

## 4. Repository implementation (DynamoDB)

### 4.1 `update(category)` — Put with attribute_exists

Same pattern as wallet repo's `update`. Throws on missing item.

### 4.2 `hide(userId, predefinedId)`

```ts
async hide(userId: UserId, predefinedId: string): Promise<Result<void, CategoryError>> {
  try {
    await ddb.send(new PutCommand({
      TableName: TABLE_NAME,
      Item: hiddenPredefinedToItem({ userId, predefinedCategoryId: predefinedId, createdAt: new Date() }),
      ConditionExpression: 'attribute_not_exists(PK)',
    }));
    return ok(undefined);
  } catch (e) {
    if (isConditionalCheckFailed(e)) {
      // Idempotent: already hidden is success
      return ok(undefined);
    }
    throw e;
  }
}
```

The use case can choose to call this directly when it wants idempotent behavior. Note: REQ-FORK-DOM-07 says fork-on-already-hidden returns 409, so the fork use case must check `listHiddenPredefined` BEFORE calling `hide`.

### 4.3 `listHiddenPredefined(userId)`

Paginated Query with `KeyConditionExpression: 'PK = :pk AND begins_with(SK, :prefix)'`, prefix = `HIDDENCAT#`. Projects only `predefinedCategoryId`. Returns `string[]`.

### 4.4 `forkPredefined(input)` — chunked migration

```ts
interface TxMigrationItem {
  oldSK: string;           // current TXN#walletId#occurredAt#txId
  newSK: string;           // same shape (occurredAt unchanged), categoryId is implicitly the new uuid
  oldGsi1SK: string;       // CAT#predefinedId#occurredAt#txId
  newGsi1SK: string;       // CAT#newUUID#occurredAt#txId
  txItem: TransactionItem; // the full new item to Put (categoryId field updated)
}

interface ForkPredefinedInput {
  userId: UserId;
  predefinedCategoryId: string;
  newCustom: Category;
  txMigrations: TxMigrationItem[];
}

async forkPredefined(input): Promise<void> {
  const pk = userPK(input.userId.toString());
  const customPut = { Put: { Item: categoryToItem(input.newCustom), ConditionExpression: 'attribute_not_exists(PK)' } };
  const hidePut = {
    Put: {
      Item: hiddenPredefinedToItem({ userId: input.userId, predefinedCategoryId: input.predefinedCategoryId, createdAt: new Date() }),
      ConditionExpression: 'attribute_not_exists(PK)',
    },
  };

  // First chunk: custom + hide + up to 49 tx migrations (2 ops each = 98) → 100 ops total
  const FIRST_CHUNK_TX = 49;
  const SUBSEQ_CHUNK_TX = 49;

  const firstChunkTxs = input.txMigrations.slice(0, FIRST_CHUNK_TX);
  const firstChunkOps = [
    customPut,
    hidePut,
    ...firstChunkTxs.flatMap(tx => [
      { Delete: { TableName, Key: { PK: pk, SK: tx.oldSK }, ConditionExpression: 'attribute_exists(PK)' } },
      { Put: { TableName, Item: tx.txItem } },
    ]),
  ];
  await ddb.send(new TransactWriteCommand({ TransactItems: firstChunkOps }));

  // Subsequent chunks: only tx migrations
  for (let i = FIRST_CHUNK_TX; i < input.txMigrations.length; i += SUBSEQ_CHUNK_TX) {
    const chunk = input.txMigrations.slice(i, i + SUBSEQ_CHUNK_TX);
    const ops = chunk.flatMap(tx => [
      { Delete: { TableName, Key: { PK: pk, SK: tx.oldSK }, ConditionExpression: 'attribute_exists(PK)' } },
      { Put: { TableName, Item: tx.txItem } },
    ]);
    await ddb.send(new TransactWriteCommand({ TransactItems: ops }));
  }
}
```

Per-chunk atomicity. Retry-safe: if chunk 1 already executed and chunk 2 fails, retrying chunk 1 fails on `attribute_not_exists(PK)` for customPut (custom already exists) — the use case must catch this and skip ahead. **For MVP simplicity, we DON'T implement retry-from-chunk-N**: a failed fork surfaces a 5xx; the user retries the edit. The next attempt builds a fresh `newCustom` UUID. The previous partial state (some tx migrated, some not) is recoverable by manual edit but the user might see a half-migrated state in the UI.

This is acceptable because:

- MVP single-user, low fail rate.
- Predefineds with > 49 transactions are rare in personal use.
- Retry-from-chunk-N is implementable as a follow-up if needed.

### 4.5 `keyBuilders.ts` — new SK helper

```ts
export const hiddenPredefinedSK = (predefinedCategoryId: string): string =>
  `HIDDENCAT#${predefinedCategoryId}`;
```

### 4.6 Mapper for `HiddenPredefinedCategory`

```ts
export interface HiddenPredefinedCategoryItem {
  PK: string;
  SK: string; // HIDDENCAT#{predefinedId}
  entityType: 'HiddenPredefinedCategory';
  predefinedCategoryId: string;
  createdAt: string;
}

export const hiddenPredefinedToItem = (h): HiddenPredefinedCategoryItem => ({
  PK: userPK(h.userId.toString()),
  SK: hiddenPredefinedSK(h.predefinedCategoryId),
  entityType: 'HiddenPredefinedCategory',
  predefinedCategoryId: h.predefinedCategoryId,
  createdAt: h.createdAt.toISOString(),
});
```

---

## 5. HTTP handlers

### 5.1 `patchCategory.ts`

```ts
const handler = async (event) => {
  const pathValidation = validatePath(CategoryIdPathSchema, event.raw);
  if (!pathValidation.ok) return pathValidation.response;

  const bodyValidation = validateBody(UpdateCategoryRequestSchema, event.raw);
  if (!bodyValidation.ok) return bodyValidation.response;

  const idResult = CategoryId.create(pathValidation.data.categoryId);
  if (!idResult.ok) return domainErrorToResponse(idResult.error);

  const edits = bodyValidation.data;

  if (idResult.value.kind === 'custom') {
    const result = await container.updateCustomCategory({
      userId: event.userId,
      categoryId: pathValidation.data.categoryId,
      edits,
    });
    // map errors, return 200 with category body (including color)
  } else {
    const result = await container.forkPredefinedCategory({
      userId: event.userId,
      predefinedId: pathValidation.data.categoryId,
      edits,
    });
    // map CategoryAlreadyHidden → 409
    // return 201 with new custom category body (including new id, name, color)
  }
};
```

### 5.2 `deleteCategory.ts` (renamed)

```ts
const handler = async (event) => {
  const pathValidation = validatePath(CategoryIdPathSchema, event.raw);
  if (!pathValidation.ok) return pathValidation.response;

  const idResult = CategoryId.create(pathValidation.data.categoryId);
  if (!idResult.ok) return domainErrorToResponse(idResult.error);

  if (idResult.value.kind === 'custom') {
    // existing DeleteCustomCategory path
  } else {
    const result = await container.hidePredefinedCategory({
      userId: event.userId,
      predefinedId: pathValidation.data.categoryId,
    });
    // map CategoryHasTransactions → 409
    // return 204
  }
};
```

### 5.3 `serverless.yml`

```yaml
patchCategory:
  handler: src/handlers/category/patchCategory.main
  events:
    - httpApi:
        path: /categories/{categoryId}
        method: patch
        authorizer: { name: cognitoJwt }

deleteCategory: # renamed from deleteCustomCategory
  handler: src/handlers/category/deleteCategory.main
  events:
    - httpApi:
        path: /categories/{categoryId}
        method: delete
        authorizer: { name: cognitoJwt }
```

CloudFormation will see the function logical id change (deleteCustomCategory → deleteCategory). That's a delete + create in CFN terms. The route remains `DELETE /categories/{id}` so the API Gateway URL is unchanged. Briefly during prod deploy, the route might 502 between the function delete and create — acceptable downtime for a personal app. (Alternative: keep the old function name. Decision: rename, accept brief downtime.)

---

## 6. Frontend

### 6.1 `EditCategoryDialog.tsx`

Controlled dialog with two fields: `name` (Input maxLength 32) and `color` (ColorPicker reused from wallet feature). Submit computes a diff vs initialValues. Uses `useUpdateCategory()`. Closes on success.

```tsx
const form = useForm({
  resolver: zodResolver(UpdateCategoryFormSchema), // local schema with both fields required for form-level validation
  mode: 'onChange',
  defaultValues: { name: category.name, color: category.color },
});

const handleSubmit = (values) => {
  const diff = {};
  if (values.name !== category.name) diff.name = values.name;
  if (values.color !== category.color) diff.color = values.color;
  if (Object.keys(diff).length === 0) {
    toast(t.categories.editNoChanges);
    return;
  }
  updateMutation.mutate(
    { categoryId: category.categoryId, dto: diff },
    {
      onSuccess: () => {
        toast.success(t.categories.editSuccess);
        onOpenChange(false);
      },
      onError: (err) => toast.error(userMessageFor(err)),
    },
  );
};
```

### 6.2 `CategoryItem.tsx` — color + dual affordances

Today the chip background is hardcoded by type (`bg-block-mint` / `bg-block-coral`). After:

```tsx
const SWATCH_BG: Record<WalletColor, string> = { ... };
const bgClass = SWATCH_BG[category.color];

<div className={cn('rounded-block p-4', bgClass)}>
  {/* eyebrow with type */}
  {/* name */}
  {/* action row at top-right: pencil (edit) + trash (delete) */}
</div>
```

Both predefined AND custom now show the action row. The parent passes `onEdit(category)` and `onDelete(categoryId, name, kind)`.

### 6.3 `CategoryList.tsx` — pass through onEdit + onDelete

Adds an `onEdit(category)` callback. Calls into the parent's `setEditTarget(...)`. Same pattern as the existing `onDeleteCustom`, now extended for both kinds.

### 6.4 `CreateCategoryDialog.tsx` — add ColorPicker

After the existing name + type fields, add a `ColorPicker`. Default color: `type === 'income' ? 'mint' : 'coral'`. The form's `type` field already triggers a re-render on change; we sync the color default via a `useEffect` listening to the form's `type` value (only when the user hasn't manually chosen a color).

### 6.5 `DeleteCategoryConfirm.tsx` — kind variant

Adds a `kind: 'custom' | 'predefined'` prop. The body text switches based on it (already wired in i18n).

### 6.6 `CategoriesPage.tsx` — wire EditCategoryDialog

Adds an `editTarget` state alongside the existing `deleteTarget`. Mounts `EditCategoryDialog` conditionally.

### 6.7 `categoriesApi.ts` + `queries.ts`

`categoriesApi.update(categoryId, dto)` → PATCH. `useUpdateCategory()` mutation. Both invalidate `['categories']` AND `['transactions']`. The existing `delete` already accepts a string id — no change needed at the API client level beyond the new behavior on the backend.

---

## 7. Cross-cutting decisions

### 7.1 Reuse `ColorPicker` and `WalletColor` across both domains

The picker, the palette, the colors are all shared. The Tailwind static record (`SWATCH_BG`) is also reused. No new component, no new constants. The naming oddity (`WalletColor` used for categories) is acknowledged; renaming to `Color` is a follow-up.

### 7.2 Fork uses `attribute_not_exists` on the custom Put

The new custom's UUID is fresh, so the row can't pre-exist. `attribute_not_exists(PK)` is a guard for collision (essentially impossible — UUID v4 collision is cosmically rare). The guard's real value: if the same fork operation retries due to a network blip, we fail-fast on the second attempt rather than silently writing the same item twice.

### 7.3 Transaction migration: rewrite the row (Delete + Put), not Update

The `categoryId` field is in two places: as the item's attribute AND in the `GSI1SK` (`CAT#{categoryId}#{occurredAt}#{txId}`). Since GSI1SK is part of the key shape (sort key of GSI1), we can't `Update` it — we have to Delete + Put. Same trade-off as `transaction-edit-delete`'s SK-move path.

### 7.4 No backwards-compat for old custom-category-without-color reads

The mapper falls back to `mint` (income) / `coral` (expense) when the stored item has no `color`. The previous CategoryItem rendering was the SAME (hardcoded mint/coral by type), so the user perceives no visual change from "before color" to "after color, never edited". On the first PATCH that includes color (or any future edit), the row gets a real `color` value written. Self-healing.

### 7.5 The `kind` prop on CategoryItem replaces `isCustom`

The current `CategoryItem.isCustom` boolean is only used to gate the delete affordance. After this change, both kinds get edit + delete. The `isCustom` prop is removed; instead, the action callbacks receive enough context (`onEdit(category)`, `onDelete(categoryId, name, kind)`) that the parent decides what to do.

### 7.6 i18n names override the catalog `name` field

The `PREDEFINED_CATEGORIES` array holds the canonical Spanish-neutro names. The frontend renders them directly from the API response (no separate i18n layer for predefined names). This means the API is the source of truth for those names — consistent with the rest of the project. If we ever go multi-language, the frontend would translate via i18n keyed by `categoryId`; for now, server-side names suffice.

### 7.7 Predefined-fork already-hidden → 409, not "silently create another custom"

REQ-FORK-DOM-07 returns `CategoryAlreadyHidden` (409) when the user tries to edit-fork a predefined they already hid (via DELETE-as-hide). Reason: the user's previous DELETE meant "I don't want this category"; silently re-creating it as a custom is surprising. The 409 surfaces an error and forces a deliberate create-custom action.

---

## 8. Risks

| Risk                                                                                                                                             | Mitigation                                                                                                                                                                                                                                         |
| ------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Fork chunk failure with > 49 transactions leaves split state                                                                                     | Retry surfaces a generic error; the partial state requires manual cleanup. Documented in §4.4. MVP scale rarely hits this.                                                                                                                         |
| Renaming `deleteCustomCategory` → `deleteCategory` triggers a CFN function recreate; brief route downtime in prod                                | Acceptable for a personal-app deploy. Could be avoided by keeping the old name; we choose clarity over uptime.                                                                                                                                     |
| Predefined catalog name changes break `smoke.sh` if anything asserts the English names                                                           | Audit script before deploy. Today no assertion does so.                                                                                                                                                                                            |
| Existing custom-category rows in DDB have no `color` → fallback to type-based default might look slightly different from a fresh creation        | The fallback IS the previous hardcoded UI behavior. Users won't notice.                                                                                                                                                                            |
| The frontend `CategoryItem` is shared by `CategoryList` and `CategorySelect` (transaction form). Adding action buttons would clutter the Select. | The Select uses a different rendering path (it lists categories as Radix select items, not as chips). The CategoryItem chip lives in `CategoriesPage` only. Verified.                                                                              |
| `EditCategoryDialog` form state: when `type` changes the default `color` adjusts, but the user may have already explicitly picked a color        | The dialog is for edit (not create) — `type` is immutable in edit mode. No conflict. CreateCategoryDialog handles the `type → color` default reactively only if the user hasn't touched the picker (track via `form.formState.dirtyFields.color`). |

---

## 9. Estimated impact

| Surface                                                                                                      | LOC delta     |
| ------------------------------------------------------------------------------------------------------------ | ------------- |
| Shared types (catalog rewrite + schemas)                                                                     | +120          |
| Domain (entity, errors, 3 use cases, list update, HiddenPredefinedCategory)                                  | +350          |
| Api (repo extensions + 2 mapper files + handlers + container + i18n wiring)                                  | +400          |
| Serverless (yml + 2 shims)                                                                                   | +30           |
| Web (EditDialog + CategoryItem + CategoryList + CreateDialog + DeleteConfirm + pages + queries + api + i18n) | +400          |
| **Total**                                                                                                    | **~1300 LOC** |

Well above the 400 budget. Single PR with `size:exception`. Same shape as `wallet-edit-delete`.
