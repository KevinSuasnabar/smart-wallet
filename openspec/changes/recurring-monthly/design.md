# Recurring monthly — Design

## 1. File tree

```
packages/domain/src/recurring/                           # NEW
├── RecurringTransaction.ts                              # aggregate root
├── RecurringTransactionId.ts                            # UUID VO
├── RecurringTransactionRepository.ts                    # interface
├── RecurringError.ts                                    # error union
├── dateMath.ts                                          # nextDayOfMonthOnOrAfter, addOneMonth
└── usecases/
    ├── CreateRecurring.ts
    ├── ListRecurring.ts
    ├── GetRecurring.ts
    ├── UpdateRecurring.ts
    ├── DeleteRecurring.ts
    └── MaterializeRecurrings.ts

packages/api/src/
├── adapters/dynamodb/
│   ├── keyBuilders.ts                                   # MODIFY: + recurringSK, recurringSKPrefix, recurringGsi1SK
│   ├── mappers/RecurringMapper.ts                       # NEW
│   ├── repositories/DynamoDBRecurringTransactionRepository.ts  # NEW
│   └── index.ts                                         # MODIFY: re-export new repo
├── handlers/recurring/                                  # NEW
│   ├── createRecurring.ts
│   ├── listRecurring.ts
│   ├── getRecurring.ts
│   ├── patchRecurring.ts
│   ├── deleteRecurring.ts
│   └── materializeRecurrings.ts
├── composition/container.ts                             # MODIFY: + 6 use cases

packages/infra-sls/serverless.yml                        # MODIFY: + 6 fn entries

packages/shared-types/src/
├── schemas/recurring.ts                                 # NEW
└── index.ts                                             # MODIFY: re-export

packages/web/src/
├── app/
│   ├── routes.ts                                        # MODIFY: + recurring, recurringNew, recurringEdit
│   └── AppRouter.tsx                                    # MODIFY: register 3 routes
├── components/layout/
│   ├── Sidebar.tsx                                      # MODIFY: + Recurrentes item
│   └── BottomTabBar.tsx                                 # MODIFY: + Recurrentes tab (icon-only on <sm)
├── lib/i18n.ts                                          # MODIFY: + t.recurring
└── features/
    ├── dashboard/pages/DashboardPage.tsx                # MODIFY: auto-materialize useEffect
    └── recurring/                                       # NEW
        ├── recurringApi.ts
        ├── queries.ts
        ├── pages/
        │   ├── RecurringListPage.tsx
        │   ├── CreateRecurringPage.tsx
        │   └── EditRecurringPage.tsx
        └── components/
            ├── RecurringForm.tsx
            ├── RecurringListItem.tsx
            ├── RecurringListSkeleton.tsx
            ├── DeleteRecurringDialog.tsx
            └── EmptyRecurringState.tsx
```

## 2. Domain entity

### 2.1 `RecurringTransaction.ts`

Mirrors `Transaction`. Key differences:

```ts
export interface RecurringTransactionProps {
  walletId: WalletId;
  userId: UserId;
  type: TransactionType;
  amount: Money;
  categoryId: string;
  description: string | null;
  cadence: 'monthly';
  dayOfMonth: number; // 1..31
  nextOccurrenceAt: Date;
  lastMaterializedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateRecurringTransactionProps {
  id: RecurringTransactionId;
  walletId: WalletId;
  userId: UserId;
  type: TransactionType;
  amount: Money;
  categoryId: string;
  description: string | null;
  dayOfMonth: number;
  clock: Clock;
}

export class RecurringTransaction extends AggregateRoot<RecurringTransactionId> {
  // ... getters mirror Transaction ...

  static create(p: CreateRecurringTransactionProps): Result<RecurringTransaction, RecurringError> {
    if (!Number.isInteger(p.dayOfMonth) || p.dayOfMonth < 1 || p.dayOfMonth > 31) {
      return err(new InvalidDayOfMonth());
    }
    const description = normalizeDescription(p.description); // shared helper or inlined
    if (description !== null && description.length > 256) return err(new InvalidDescription()); // reuse Transaction's
    const now = p.clock.now();
    const nextOccurrenceAt = nextDayOfMonthOnOrAfter(now, p.dayOfMonth);
    return ok(
      new RecurringTransaction(p.id, {
        walletId: p.walletId,
        userId: p.userId,
        type: p.type,
        amount: p.amount,
        categoryId: p.categoryId,
        description,
        cadence: 'monthly',
        dayOfMonth: p.dayOfMonth,
        nextOccurrenceAt,
        lastMaterializedAt: null,
        createdAt: now,
        updatedAt: now,
      }),
    );
  }

  static rehydrate(id: RecurringTransactionId, props: RecurringTransactionProps): RecurringTransaction {
    return new RecurringTransaction(id, props);
  }

  applyEdits(
    edits: {
      amount?: Money;
      description?: string | null;
      categoryId?: string;
      dayOfMonth?: number;
    },
    clock: Clock,
  ): Result<void, RecurringError> {
    const snapshot = { ...this._props };
    if (edits.description !== undefined) {
      const trimmed = edits.description === null ? null : edits.description.trim();
      const normalized = trimmed === '' ? null : trimmed;
      if (normalized !== null && normalized.length > 256) return err(new InvalidDescription());
      this._props.description = normalized;
    }
    if (edits.amount !== undefined) this._props.amount = edits.amount;
    if (edits.categoryId !== undefined) this._props.categoryId = edits.categoryId;
    if (edits.dayOfMonth !== undefined) {
      if (!Number.isInteger(edits.dayOfMonth) || edits.dayOfMonth < 1 || edits.dayOfMonth > 31) {
        this._props = snapshot;
        return err(new InvalidDayOfMonth());
      }
      this._props.dayOfMonth = edits.dayOfMonth;
      // Recompute nextOccurrenceAt from the later of (current next, now), applying the new day.
      const now = clock.now();
      const anchor = this._props.nextOccurrenceAt > now ? this._props.nextOccurrenceAt : now;
      this._props.nextOccurrenceAt = nextDayOfMonthOnOrAfter(anchor, edits.dayOfMonth);
    }
    this._props.updatedAt = clock.now();
    return ok(undefined);
  }

  materializeOne(now: Date): {
    transactionDraft: {
      walletId: WalletId;
      userId: UserId;
      type: TransactionType;
      amount: Money;
      categoryId: string;
      description: string | null;
      occurredAt: Date;
    };
    nextOccurrenceAt: Date;
    materializedAt: Date;
  } {
    const occurredAt = this._props.nextOccurrenceAt;
    const advanced = addOneMonth(occurredAt);
    const nextOccurrenceAt = nextDayOfMonthOnOrAfter(advanced, this._props.dayOfMonth);
    return {
      transactionDraft: {
        walletId: this._props.walletId,
        userId: this._props.userId,
        type: this._props.type,
        amount: this._props.amount,
        categoryId: this._props.categoryId,
        description: this._props.description,
        occurredAt,
      },
      nextOccurrenceAt,
      materializedAt: now,
    };
  }

  // Used by the repo after a successful TransactWrite to keep the in-memory
  // copy in sync (only matters if the use case re-reads `this`).
  applyMaterializationOutcome(nextOccurrenceAt: Date, materializedAt: Date): void {
    this._props.nextOccurrenceAt = nextOccurrenceAt;
    this._props.lastMaterializedAt = materializedAt;
    this._props.updatedAt = materializedAt;
  }
}
```

### 2.2 `dateMath.ts`

```ts
const daysInMonth = (year: number, monthZeroBased: number): number =>
  new Date(year, monthZeroBased + 1, 0).getDate();

const effectiveDay = (year: number, monthZeroBased: number, dayOfMonth: number): number =>
  Math.min(dayOfMonth, daysInMonth(year, monthZeroBased));

export const nextDayOfMonthOnOrAfter = (anchor: Date, dayOfMonth: number): Date => {
  const y = anchor.getUTCFullYear();
  const m = anchor.getUTCMonth();
  const todayEffectiveDay = anchor.getUTCDate();
  const thisMonthEffective = effectiveDay(y, m, dayOfMonth);
  if (todayEffectiveDay <= thisMonthEffective) {
    return new Date(Date.UTC(y, m, thisMonthEffective, 0, 0, 0, 0));
  }
  // Roll to next month.
  const ny = m === 11 ? y + 1 : y;
  const nm = m === 11 ? 0 : m + 1;
  const nextEffective = effectiveDay(ny, nm, dayOfMonth);
  return new Date(Date.UTC(ny, nm, nextEffective, 0, 0, 0, 0));
};

export const addOneMonth = (date: Date): Date => {
  const y = date.getUTCFullYear();
  const m = date.getUTCMonth();
  const d = date.getUTCDate();
  const ny = m === 11 ? y + 1 : y;
  const nm = m === 11 ? 0 : m + 1;
  const clampedDay = Math.min(d, daysInMonth(ny, nm));
  return new Date(Date.UTC(ny, nm, clampedDay, 0, 0, 0, 0));
};
```

UTC math throughout. The user's "1st of the month" is interpreted in UTC; this is a deliberate simplification for MVP (avoid per-user timezones).

### 2.3 `RecurringError.ts`

```ts
import { DomainError } from '../shared/DomainError.js';

export class InvalidRecurringId extends DomainError {
  readonly tag = 'domain.recurring.invalid_id' as const;
  readonly httpStatus = 400;
  constructor(message = 'Invalid recurring transaction ID') { super(message); }
}
export class InvalidDayOfMonth extends DomainError {
  readonly tag = 'domain.recurring.invalid_day_of_month' as const;
  readonly httpStatus = 400;
  constructor(message = 'Day of month must be an integer in [1, 31]') { super(message); }
}
export class InvalidCadence extends DomainError {
  readonly tag = 'domain.recurring.invalid_cadence' as const;
  readonly httpStatus = 400;
  constructor(message = "Cadence must be 'monthly'") { super(message); }
}
export class InvalidDescription extends DomainError { /* reused from transaction or duplicated */ }
export class RecurringNotFound extends DomainError {
  readonly tag = 'domain.recurring.not_found' as const;
  readonly httpStatus = 404;
  constructor(message = 'Recurring transaction not found') { super(message); }
}
export class RecurringWalletMismatch extends DomainError { /* httpStatus 400 */ }
export class RecurringCategoryMismatch extends DomainError { /* httpStatus 400 */ }
export class RecurringWalletNotFound extends DomainError { /* httpStatus 400 */ }
export class RecurringCategoryNotFound extends DomainError { /* httpStatus 400 */ }
export class RecurringNoEdits extends DomainError { /* httpStatus 400, tag '.no_edits' */ }

export type RecurringError =
  | InvalidRecurringId
  | InvalidDayOfMonth
  | InvalidCadence
  | InvalidDescription
  | RecurringNotFound
  | RecurringWalletMismatch
  | RecurringCategoryMismatch
  | RecurringWalletNotFound
  | RecurringCategoryNotFound
  | RecurringNoEdits;
```

Note: `InvalidDescription` MAY be reused from `TransactionError` to avoid duplicate classes — domain conventions allow cross-aggregate error reuse when the meaning is identical. Decision: duplicate (clean dependencies, recurring errors stay self-contained). Compromise: 1 LOC saved by sharing isn't worth coupling aggregates.

## 3. Repository

### 3.1 Interface

```ts
import type { RecurringTransaction } from './RecurringTransaction.js';
import type { RecurringTransactionId } from './RecurringTransactionId.js';
import type { TransactionId } from '../transaction/TransactionId.js';
import type { UserId } from '../user/UserId.js';

export interface CreateRecurringInput {
  recurring: RecurringTransaction;
}

export interface UpdateRecurringInput {
  recurring: RecurringTransaction;
}

export interface MaterializeOneInput {
  recurring: RecurringTransaction;
  transactionId: TransactionId;
  nextOccurrenceAt: Date;
  materializedAt: Date;
}

export interface RecurringTransactionRepository {
  create(input: CreateRecurringInput): Promise<void>;
  findById(userId: UserId, recurringId: RecurringTransactionId): Promise<RecurringTransaction | null>;
  listByUser(userId: UserId): Promise<RecurringTransaction[]>;
  listPending(userId: UserId, now: Date, limit: number): Promise<RecurringTransaction[]>;
  update(input: UpdateRecurringInput): Promise<void>;
  hardDelete(input: { userId: UserId; recurringId: RecurringTransactionId }): Promise<void>;
  materializeOne(input: MaterializeOneInput): Promise<{ transactionId: TransactionId }>;
}
```

### 3.2 DynamoDB implementation

#### Key shapes (add to `keyBuilders.ts`)

```ts
export const recurringSK = (recurringId: string): string => `RECURRING#${recurringId}`;
export const recurringSKPrefix = (): string => 'RECURRING#';
export const recurringGsi1SK = (
  nextOccurrenceAtIso: string,
  recurringId: string,
): string => `RECURNEXT#${nextOccurrenceAtIso}#${recurringId}`;
export const recurringGsi1SKPrefix = (): string => 'RECURNEXT#';
```

#### Mapper

`recurringToItem(recurring)` produces:
```ts
{
  PK: USER#{userId},
  SK: RECURRING#{recurringId},
  GSI1PK: USER#{userId},
  GSI1SK: RECURNEXT#{nextOccurrenceAtIso}#{recurringId},
  entity: 'recurring',
  recurringId, walletId, type, amount: cents (number), currency, categoryId,
  description: optional,
  cadence: 'monthly',
  dayOfMonth, nextOccurrenceAt, lastMaterializedAt: optional,
  createdAt, updatedAt,
}
```

`itemToRecurring(item)` returns `Result<RecurringTransaction, RecurringError>` (uses `rehydrate` after validating value objects).

#### `materializeOne` TransactWriteItems

```ts
TransactWriteItems({
  TransactItems: [
    // 1. Put Transaction
    {
      Put: {
        TableName,
        Item: transactionToItem(newTransaction),
        ConditionExpression: 'attribute_not_exists(PK) AND attribute_not_exists(SK)',
      },
    },
    // 2. Update wallet balance
    {
      Update: {
        TableName,
        Key: { PK: userPK(userId), SK: walletSK(walletId) },
        UpdateExpression: 'SET balance = balance + :delta, updatedAt = :now',
        ConditionExpression: 'attribute_exists(PK) AND attribute_not_exists(deletedAt)',
        ExpressionAttributeValues: { ':delta': signedDeltaCents, ':now': materializedAt.toISOString() },
      },
    },
    // 3. Update recurring (advance nextOccurrenceAt, set lastMaterializedAt)
    {
      Update: {
        TableName,
        Key: { PK: userPK(userId), SK: recurringSK(recurringId) },
        UpdateExpression:
          'SET nextOccurrenceAt = :next, lastMaterializedAt = :now, updatedAt = :now, GSI1SK = :gsi1sk',
        ConditionExpression: 'nextOccurrenceAt = :expected',
        ExpressionAttributeValues: {
          ':expected': currentNextOccurrenceAtIso,
          ':next': nextOccurrenceAtIso,
          ':now': materializedAt.toISOString(),
          ':gsi1sk': recurringGsi1SK(nextOccurrenceAtIso, recurringId),
        },
      },
    },
  ],
})
```

#### Error mapping

The repo catches `TransactionCanceledException` and inspects `CancellationReasons`:
- Index 0 fail (transaction Put collision): UUID collision — re-throw as generic error (extremely rare).
- Index 1 fail (wallet condition): wallet was deleted → throw `RecurringWalletNotFound`.
- Index 2 fail (recurring condition): race lost → throw typed `RecurringRaceLost` (NOT a `RecurringError`; an internal repo sentinel). Use case catches and skips.

`RecurringRaceLost` lives at `packages/api/src/adapters/dynamodb/repositories/DynamoDBRecurringTransactionRepository.ts` as a local class.

#### `listPending` query

```ts
Query({
  TableName,
  IndexName: 'GSI1',
  KeyConditionExpression: 'GSI1PK = :pk AND GSI1SK <= :max',
  ExpressionAttributeValues: {
    ':pk': userPK(userId),
    ':max': recurringGsi1SK(now.toISOString(), '￿'), // sentinel high-char to include all UUIDs at that timestamp
  },
  Limit: limit,
})
```

Important: this index also stores non-recurring rows (wallets, transactions, etc. that happen to have `GSI1PK = USER#…`). Filter for `entity === 'recurring'` post-query, or — better — give recurring's GSI1SK a unique prefix `RECURNEXT#` so the `<=` only matches recurring entries. Confirmed by inspecting key builders: existing GSI1SK uses prefix `CAT#` for transactions. `RECURNEXT#` is distinct. The `<=` comparison includes `CAT#…` BUT the sort orders `CAT#` BEFORE `RECURNEXT#` (alphabetical: `C` < `R`), so `<= RECURNEXT#{nowIso}#~` matches all CAT# entries too. **Solution**: use a `KeyConditionExpression` with `BETWEEN`:
```ts
KeyConditionExpression: 'GSI1PK = :pk AND GSI1SK BETWEEN :min AND :max',
ExpressionAttributeValues: {
  ':pk': userPK(userId),
  ':min': 'RECURNEXT#',
  ':max': recurringGsi1SK(now.toISOString(), '￿'),
},
```
This restricts to only `RECURNEXT#` rows and only those due by `now`.

## 4. Use cases

### 4.1 `MakeCreateRecurring`

```ts
export interface CreateRecurringDeps {
  walletRepo: WalletRepository;
  categoryRepo: CategoryRepository;
  recurringRepo: RecurringTransactionRepository;
  idGen: IdGenerator;
  clock: Clock;
}

export interface CreateRecurringInput {
  userId: UserId;
  walletId: WalletId;
  type: TransactionType;
  amount: Money;
  categoryId: string;
  description: string | null;
  dayOfMonth: number;
}

export const makeCreateRecurring = (deps: CreateRecurringDeps) =>
  async (input: CreateRecurringInput): Promise<Result<{ recurring: RecurringTransaction }, RecurringError>> => {
    const wallet = await deps.walletRepo.findById(input.userId, input.walletId);
    if (wallet === null || wallet.deletedAt !== null) return err(new RecurringWalletNotFound());
    if (wallet.currency !== input.amount.currency) return err(new RecurringWalletMismatch());
    const cat = await deps.categoryRepo.findById(input.userId, input.categoryId);
    if (cat === null) return err(new RecurringCategoryNotFound());
    if (cat.type !== input.type) return err(new RecurringCategoryMismatch());
    const idRes = RecurringTransactionId.create(deps.idGen.uuid());
    if (idRes.isErr) return err(idRes.error);
    const entityRes = RecurringTransaction.create({
      id: idRes.value, walletId: input.walletId, userId: input.userId,
      type: input.type, amount: input.amount, categoryId: input.categoryId,
      description: input.description, dayOfMonth: input.dayOfMonth, clock: deps.clock,
    });
    if (entityRes.isErr) return err(entityRes.error);
    await deps.recurringRepo.create({ recurring: entityRes.value });
    return ok({ recurring: entityRes.value });
  };
```

### 4.2 `MakeUpdateRecurring`

Loads, applies edits, re-validates category if changed, persists. Same pattern as `UpdateTransaction`.

### 4.3 `MakeMaterializeRecurrings`

```ts
export const makeMaterializeRecurrings = (deps: MaterializeDeps) =>
  async (userId: UserId): Promise<Result<{ materializedCount: number; materializedTransactionIds: string[] }, RecurringError>> => {
    const now = deps.clock.now();
    const ids: string[] = [];
    const SAFETY = 50;
    const PAGE = 20;
    for (let iter = 0; iter < SAFETY; iter++) {
      const pending = await deps.recurringRepo.listPending(userId, now, PAGE);
      if (pending.length === 0) break;
      for (const r of pending) {
        const txId = TransactionId.create(deps.idGen.uuid());
        if (txId.isErr) continue;
        const outcome = r.materializeOne(now);
        try {
          await deps.recurringRepo.materializeOne({
            recurring: r,
            transactionId: txId.value,
            nextOccurrenceAt: outcome.nextOccurrenceAt,
            materializedAt: outcome.materializedAt,
          });
          r.applyMaterializationOutcome(outcome.nextOccurrenceAt, outcome.materializedAt);
          ids.push(txId.value.toString());
        } catch (e) {
          if (e instanceof RecurringRaceLost) continue;
          // Wallet deletion or other: surface a single error and bail.
          if (e instanceof RecurringWalletNotFound) return err(e);
          throw e;
        }
      }
    }
    return ok({ materializedCount: ids.length, materializedTransactionIds: ids });
  };
```

**Concern**: `RecurringRaceLost` is a repo-internal class (defined in the api package). The domain use case can't `instanceof`-check a type it doesn't import. **Fix**: the repo throws an error with a stable string discriminator `name = 'RecurringRaceLost'`. The use case checks `e?.name === 'RecurringRaceLost'`. This crosses the layer boundary without requiring the domain to import api types.

## 5. Shared-types schemas

`packages/shared-types/src/schemas/recurring.ts`:

```ts
import { z } from 'zod';
import { zUuid } from './shared.js';
import { zMoneyAmount } from './shared.js';
import { zCurrency } from './shared.js';

export const RecurringIdPathSchema = z.object({ recurringId: zUuid });

export const CreateRecurringRequestSchema = z.object({
  walletId: zUuid,
  type: z.enum(['income', 'expense']),
  amount: zMoneyAmount,
  categoryId: z.union([zUuid, /^(income|expense):[a-z]+$/]),
  description: z.string().trim().max(256).optional(),
  dayOfMonth: z.number().int().min(1).max(31),
});
export type CreateRecurringDTO = z.infer<typeof CreateRecurringRequestSchema>;

export const UpdateRecurringRequestSchema = z
  .object({
    amount: zMoneyAmount.optional(),
    categoryId: z.union([zUuid, /^(income|expense):[a-z]+$/]).optional(),
    description: z.union([z.string().trim().max(256), z.null()]).optional(),
    dayOfMonth: z.number().int().min(1).max(31).optional(),
  })
  .strict()
  .refine(
    (d) => d.amount !== undefined || d.categoryId !== undefined || d.description !== undefined || d.dayOfMonth !== undefined,
    { message: 'At least one editable field must be present' },
  );
export type UpdateRecurringDTO = z.infer<typeof UpdateRecurringRequestSchema>;

export const RecurringResponseSchema = z.object({
  recurringId: zUuid,
  walletId: zUuid,
  type: z.enum(['income', 'expense']),
  amount: zMoneyAmount,
  currency: zCurrency,
  categoryId: z.string(),
  description: z.string().nullable(),
  cadence: z.literal('monthly'),
  dayOfMonth: z.number().int(),
  nextOccurrenceAt: z.string(),
  lastMaterializedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type RecurringResponseDTO = z.infer<typeof RecurringResponseSchema>;

export const ListRecurringResponseSchema = z.object({
  items: z.array(RecurringResponseSchema),
});
export type ListRecurringResponseDTO = z.infer<typeof ListRecurringResponseSchema>;

export const MaterializeRecurringResponseSchema = z.object({
  materializedCount: z.number().int(),
  materializedTransactionIds: z.array(z.string()),
});
export type MaterializeRecurringResponseDTO = z.infer<typeof MaterializeRecurringResponseSchema>;
```

`index.ts` re-exports.

## 6. Handlers

Standard 6 handlers + 1 materialize. Pattern identical to `transaction/addTransaction.ts`. Key body of `materializeRecurrings.ts`:

```ts
const _main = async (event: AuthedEvent): Promise<APIGatewayProxyResultV2> => {
  const result = await container.materializeRecurrings(event.userId);
  if (result.isErr) return domainErrorToResponse(result.error);
  return responseOk(result.value);
};
export const main = withErrorHandler(withAuth(_main));
```

Returns 200 always on success (even count 0).

## 7. Container additions

```ts
const recurringRepo = new DynamoDBRecurringTransactionRepository();

// inside container export:
createRecurring: makeCreateRecurring({ walletRepo, categoryRepo, recurringRepo, idGen, clock }),
listRecurring: makeListRecurring({ recurringRepo }),
getRecurring: makeGetRecurring({ recurringRepo }),
updateRecurring: makeUpdateRecurring({ walletRepo, categoryRepo, recurringRepo, clock }),
deleteRecurring: makeDeleteRecurring({ recurringRepo }),
materializeRecurrings: makeMaterializeRecurrings({ recurringRepo, idGen, clock }),
```

## 8. serverless.yml additions

```yaml
createRecurring:
  handler: src/handlers/recurring/createRecurring.main
  events:
    - httpApi: { path: /recurring, method: post, authorizer: { name: cognitoJwt } }

listRecurring:
  handler: src/handlers/recurring/listRecurring.main
  events:
    - httpApi: { path: /recurring, method: get, authorizer: { name: cognitoJwt } }

getRecurring:
  handler: src/handlers/recurring/getRecurring.main
  events:
    - httpApi: { path: /recurring/{recurringId}, method: get, authorizer: { name: cognitoJwt } }

patchRecurring:
  handler: src/handlers/recurring/patchRecurring.main
  events:
    - httpApi: { path: /recurring/{recurringId}, method: patch, authorizer: { name: cognitoJwt } }

deleteRecurring:
  handler: src/handlers/recurring/deleteRecurring.main
  events:
    - httpApi: { path: /recurring/{recurringId}, method: delete, authorizer: { name: cognitoJwt } }

materializeRecurrings:
  handler: src/handlers/recurring/materializeRecurrings.main
  events:
    - httpApi: { path: /recurring/materialize, method: post, authorizer: { name: cognitoJwt } }
```

**Order matters in API Gateway HTTP API**: `/recurring/materialize` must NOT be matched by `/recurring/{recurringId}` (which would treat `materialize` as a UUID and fail validation). HTTP API v2 prefers exact-path routes over greedy ones, so this should resolve correctly. **Defensive**: validate the path with Zod UUID schema on `{recurringId}` handlers; if the request is `/recurring/materialize` and APIGW mis-routes to `getRecurring`, the Zod failure returns 400, not silent bug. Document in handler comment.

## 9. Web: api + queries

`recurringApi.ts`:
```ts
export const recurringApi = {
  list: (): Promise<ListRecurringResponseDTO> => apiClient.get('/recurring'),
  byId: (id: string): Promise<RecurringResponseDTO> => apiClient.get(`/recurring/${id}`),
  create: (dto: CreateRecurringDTO): Promise<RecurringResponseDTO> => apiClient.post('/recurring', dto),
  update: (id: string, dto: UpdateRecurringDTO): Promise<RecurringResponseDTO> => apiClient.patch(`/recurring/${id}`, dto),
  remove: (id: string): Promise<void> => apiClient.del(`/recurring/${id}`),
  materialize: (): Promise<MaterializeRecurringResponseDTO> => apiClient.post('/recurring/materialize', {}),
};
```

`queries.ts`:
```ts
export const recurringKeys = {
  all: ['recurring'] as const,
  detail: (id: string) => ['recurring', 'detail', id] as const,
};

export const useRecurringList = () => useQuery({ queryKey: recurringKeys.all, queryFn: () => recurringApi.list() });
export const useRecurring = (id: string) => useQuery({
  queryKey: recurringKeys.detail(id),
  queryFn: () => recurringApi.byId(id),
  enabled: id !== '',
});
export const useCreateRecurring = () => { /* invalidates recurringKeys.all */ };
export const useUpdateRecurring = (id: string) => { /* invalidates list + detail */ };
export const useDeleteRecurring = () => { /* invalidates recurringKeys.all */ };
export const useMaterializeRecurrings = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => recurringApi.materialize(),
    onSuccess: (res) => {
      if (res.materializedCount > 0) {
        void qc.invalidateQueries({ queryKey: ['wallets'] });
        void qc.invalidateQueries({ queryKey: ['transactions'] });
        void qc.invalidateQueries({ queryKey: recurringKeys.all });
      }
    },
  });
};
```

## 10. DashboardPage auto-materialize

```tsx
const materialize = useMaterializeRecurrings();
const materializedOnce = useRef(false);
useEffect(() => {
  if (materializedOnce.current) return;
  materializedOnce.current = true;
  materialize.mutate(undefined, {
    onError: (e) => { console.error('[dashboard] materialize failed', e); },
  });
}, []); // eslint-disable-line react-hooks/exhaustive-deps -- intentionally one-shot
```

Placement: after the existing hooks (`usePreferredCurrency`, `useState(override)`) but BEFORE the dashboard probe call. The mutation is fire-and-forget; the user sees the skeleton while materialize runs in parallel with `useMonthlyDashboard`. When materialize finishes, the invalidation triggers a refetch of the dashboard data.

## 11. RecurringListItem layout

```tsx
<Card className="flex items-center gap-3 p-4">
  <span className={`size-3 rounded-full ${COLOR_DOT[meta.color]}`} />
  <div className="flex-1 min-w-0">
    <div className="flex items-baseline gap-2">
      <span className="text-base font-semibold">{description ?? t.recurring.descriptionFallback}</span>
      <span className="font-mono text-[11px] uppercase tracking-caption text-foreground/55">
        {formatRelativeDate(nextOccurrenceAt)}  {/* "5 may" */}
      </span>
    </div>
    <div className="mt-0.5 text-sm text-foreground/70 truncate">
      {wallet.name} · {meta.name}
    </div>
  </div>
  <div className="flex items-center gap-2">
    <span className={cn('text-[15px] font-semibold', type === 'income' ? 'text-mint-ink' : 'text-coral-ink')}>
      {type === 'income' ? '+' : '−'}{formatCurrency(amount, currency)}
    </span>
    <button onClick={onEdit}><Pencil className="size-4" /></button>
    <button onClick={onDelete}><Trash2 className="size-4" /></button>
  </div>
</Card>
```

## 12. RecurringForm

Same skeleton as TransactionForm. Adds `dayOfMonth` field after Description:
```tsx
<FormField name="dayOfMonth" render={({ field }) => (
  <FormItem>
    <FormLabel>{t.recurring.dayOfMonthLabel}</FormLabel>
    <FormControl>
      <Input type="number" min={1} max={31} {...field}
        onChange={(e) => field.onChange(parseInt(e.target.value, 10))} />
    </FormControl>
    <p className="font-mono text-[11px] text-foreground/55">{t.recurring.dayOfMonthHelper}</p>
    <FormMessage />
  </FormItem>
)} />
```

Form schema:
```ts
const FormSchema = CreateRecurringRequestSchema.extend({
  amount: z.string().regex(LOOSE_DECIMAL_REGEX, 'Ingresa un monto válido'),
});
```

`mode: 'onChange'`, normalize amount in submit. Same pattern as transactions.

## 13. Edit Page diff-and-PATCH

```ts
const buildPatch = (orig, current) => {
  const patch: UpdateRecurringDTO = {};
  if (orig.amount !== current.amount) patch.amount = current.amount;
  if (orig.categoryId !== current.categoryId) patch.categoryId = current.categoryId;
  if ((orig.description ?? '') !== current.description) patch.description = current.description || null;
  if (orig.dayOfMonth !== current.dayOfMonth) patch.dayOfMonth = current.dayOfMonth;
  return patch;
};
```

If `Object.keys(patch).length === 0`, show `editNoChanges` toast and skip the API call.

## 14. BottomTabBar with 6 items at 320px

5 items @ 16px-height-each-with-label fit on 320px. 6 items push to ~52px per slot — labels may wrap. Decision: on `<sm` viewport, hide labels for ALL tabs (icon-only). Use Tailwind `sm:inline hidden` on the `<span>` inside each tab. Existing labels are short ("Resumen", "Billeteras", "Recurrentes", "Categorías", "Ajustes") so on `sm+` they all fit.

Alternative considered and rejected: collapse Settings into a profile dropdown. Adds UX inconsistency.

## 15. Cross-cutting decisions

| Decision | Reason |
|---|---|
| `RecurringRaceLost` discriminator via `error.name === 'RecurringRaceLost'` | Domain shouldn't import from api package. Name-string check is the standard pattern. |
| `nextDayOfMonthOnOrAfter` works in UTC | Avoids per-user timezone state for MVP. User experiences ±1 day drift relative to local time; acceptable. |
| `description` PATCH accepts `null` to clear | Mirrors existing PATCH transaction. Set to `null` explicitly to remove. |
| Materialize endpoint not idempotent via Idempotency-Key | The per-recurring ConditionExpression already provides idempotency. An extra header would complicate without adding safety. |
| AUTO-04 ref guard | StrictMode double-mount in dev would otherwise fire 2 materialize calls. Server-side it's safe (race lost), but it's wasteful. |
| Description fallback in list | Anonymous recurrings without description still need a visible label — fallback string. |
| No `recurringId` on materialized tx | YAGNI for MVP. Migration to add later is trivial (nullable field). |

## 16. Risks revisited

- **API Gateway routing** `/recurring/materialize` vs `/recurring/{id}`: defensive Zod path check returns 400 if a static word lands in the id handler. Verified that HTTP API v2 prefers exact routes (industry standard).
- **GSI1 `<=` collision with CAT# rows**: solved via `BETWEEN 'RECURNEXT#' AND :max`.
- **Materialize during wallet delete**: TransactWrite condition fails → use case returns `RecurringWalletNotFound` (400). User must clean up manually. (Cascading delete is future work.)
- **DayOfMonth 31 in February**: Clamps to 28/29 via `effectiveDay`. Documented in i18n helper.
- **Materialize 12+ months back**: Looping handles it (S-13). Cap at 50×20 = 1000 entries per request.

## 17. LOC estimate (refined)

| Area | LOC |
|---|---|
| Domain entity + id + dateMath + errors + repo iface | ~310 |
| 6 use cases | ~280 |
| DDB repo + mapper + keyBuilders update | ~360 |
| 6 handlers | ~210 |
| Container + serverless.yml | ~50 |
| Shared-types | ~90 |
| Web: api + queries + 3 pages + 5 components | ~430 |
| Routes + Nav + i18n + Dashboard auto-trigger | ~70 |
| **Total** | **~1800** |

Higher than the proposal estimate (1380). **Strategy stays single PR with `size:exception`** — coupling between backend and frontend is total (the dashboard auto-trigger lives next to the dashboard, and the form/list pages can't be tested without the endpoints). Chained PRs would require feature-flag scaffolding that itself adds LOC. Accept the size and ship.

## 18. Smoke plan

After typecheck + build:
- Local dev with `pnpm --filter @smart-wallet/api dev` and `pnpm --filter @smart-wallet/web dev`.
- Create a recurring with `dayOfMonth = today + 1` → see it in `/recurring`. Materialize is no-op (not due).
- Edit `dayOfMonth = today - 5` → backend recomputes `nextOccurrenceAt` to ~25 days ago. **Wait**: this means historical materialization. Per S-13 the use case will catch up. But user UX may not expect "back-dating". Accepted: `applyEdits` recomputes from `LATER(currentNext, now)`, so editing dayOfMonth never goes backwards. Confirmed.
- Force a due recurring by editing in DDB Local or creating with dayOfMonth=1 around month boundary.
- Open dashboard → see materialized tx appear in MTD totals.
- Delete recurring → row vanishes, materialized tx remains.

User runs the actual smoke; assistant only confirms typecheck/build.
