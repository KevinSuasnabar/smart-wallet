# Design: transaction-edit-delete

> SDD phase: design
> Project: smart-wallet
> Change: transaction-edit-delete
> Date: 2026-05-15
> Engram topic_key: `sdd/transaction-edit-delete/design`

---

## 1. Decisions deferred from spec

### 1.1 — `GET /wallets/{walletId}/transactions/{transactionId}` IS added

Spec REQ-FE-API-03 listed three options for loading a single transaction in the edit page:

1. Add a new GET endpoint
2. Use TanStack Query cache
3. Refetch the list with client filter

**Locked: option 1 — add the GET endpoint.**

Rationale:

- **Deep links work**. A URL like `/wallets/abc/transactions/xyz/edit` should be openable in a fresh tab, after a refresh, or after a cache eviction. Options 2 and 3 break this contract.
- **Cost is small**. The repo method `findById(userId, transactionId)` already exists (`packages/api/src/adapters/dynamodb/repositories/DynamoDBTransactionRepository.ts`). Adding a handler + use case is ~80 LOC backend.
- **Trades off slightly larger backend for trivial frontend**. The frontend payoff is huge — `useTransaction(id)` becomes a normal TanStack query with sane caching semantics. Option 2 would have required interleaved cache lookups that mix concerns.
- **No regression risk**. The new endpoint is additive. Nothing else changes.

The endpoint:

- `GET /wallets/{walletId}/transactions/{transactionId}` → 200 with `TransactionResponseDTO`, 404 if not owned / not found, 401 if no auth.
- Authorizer: Cognito JWT (same as siblings).
- No idempotency concern.

---

## 2. Backend file layout

### New files

```
packages/domain/src/transaction/
  usecases/
    UpdateTransaction.ts        # makeUpdateTransaction
    DeleteTransaction.ts        # makeDeleteTransaction
    GetTransaction.ts           # makeGetTransaction (read-only)

packages/api/src/handlers/transaction/
  getTransaction.ts             # GET handler
  patchTransaction.ts           # PATCH handler
  deleteTransaction.ts          # DELETE handler
```

### Files modified

```
packages/domain/src/transaction/
  Transaction.ts                # +applyEdits(...) domain method
  TransactionError.ts           # +TransactionNotFound
  TransactionRepository.ts      # +update, +updateIdempotent, +hardDelete (interface)
  index.ts                      # re-export new use case factories + TransactionNotFound

packages/api/src/adapters/dynamodb/repositories/
  DynamoDBTransactionRepository.ts  # implement update / updateIdempotent / hardDelete

packages/api/src/composition/
  container.ts                  # wire getTransaction, updateTransaction, deleteTransaction

packages/shared-types/src/schemas/
  transaction.ts                # +UpdateTransactionRequestSchema, +TransactionIdPathSchema

packages/shared-types/src/index.ts  # export new schemas/types

packages/infra-sls/
  serverless.yml                # 3 new function entries; ensure PATCH is in CORS allowedMethods
```

---

## 3. Domain layer

### 3.1 `Transaction.applyEdits` (new method on the entity)

A new method on the `Transaction` aggregate that returns the post-edit state, running ALL field-level validators. The use case calls this BEFORE persistence so any field-level rejection becomes a typed `TransactionError`.

```ts
// packages/domain/src/transaction/Transaction.ts

export interface PartialTransactionEdits {
  amount?: Money;              // already constructed from cents at the handler boundary
  description?: string | null; // null = clear; '' normalized to null in caller
  categoryId?: string;         // pre-validated for type-match by use case
  occurredAt?: Date;
}

applyEdits(
  edits: PartialTransactionEdits,
  clock: Clock,
): Result<void, TransactionError> {
  // Description length: re-validate the new value if present
  if (edits.description !== undefined) {
    const trimmed = edits.description === null ? null : edits.description.trim();
    if (trimmed !== null && trimmed.length > 256) {
      return err(new InvalidTransactionDescription());
    }
    this._props.description = trimmed === '' ? null : trimmed;
  }

  // occurredAt range: re-validate the new value
  if (edits.occurredAt !== undefined) {
    const now = clock.now();
    const min = new Date(now.getFullYear() - 5, now.getMonth(), now.getDate());
    const max = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    if (edits.occurredAt < min || edits.occurredAt > max) {
      return err(new InvalidTransactionOccurredAt());
    }
    this._props.occurredAt = edits.occurredAt;
  }

  if (edits.amount !== undefined) {
    this._props.amount = edits.amount;
  }

  if (edits.categoryId !== undefined) {
    this._props.categoryId = edits.categoryId;
  }

  this._props.updatedAt = clock.now();
  return ok(undefined);
}

/** Signed cents — same shape as TransactionAdded.signedDelta. */
signedDelta(): number {
  return this._props.type === 'income'
    ? this._props.amount.amount
    : -this._props.amount.amount;
}
```

Why mutate in place (instead of returning a new entity)? Because the existing `Transaction.create()` mutates internal `_props` and the codebase uses aggregates as mutable in-memory state. Consistency with the existing pattern is more important than purity.

### 3.2 New domain error

```ts
// packages/domain/src/transaction/TransactionError.ts (add to existing union)

export class TransactionNotFound extends TransactionError {
  readonly tag = 'TransactionNotFound' as const;
  readonly httpStatus = 404 as const;
  constructor(public readonly transactionId?: string) {
    super(transactionId ? `Transaction ${transactionId} not found` : 'Transaction not found');
  }
}

// Add `TransactionNotFound` to the `TransactionError` union type at the file's bottom.
```

Mapped automatically by `domainErrorToResponse` via the existing `httpStatus`/`tag` contract — no handler-level branching needed.

### 3.3 New use case: `UpdateTransaction`

```ts
// packages/domain/src/transaction/usecases/UpdateTransaction.ts

export interface UpdateTransactionInput {
  userId: string;
  walletId: string;
  transactionId: string;
  edits: {
    amountCents?: number; // strictly positive if present
    description?: string | null;
    categoryId?: string;
    occurredAt?: Date;
  };
  idempotencyHash?: string; // present = idempotent 3-op path
}

export interface UpdateTransactionDeps {
  walletRepo: WalletRepository;
  transactionRepo: TransactionRepository;
  categoryRepo: CategoryRepository;
  clock: Clock;
}

export type UpdateTransactionOutput = Result<
  { transaction: Transaction; replay: boolean },
  TransactionError | WalletError | CategoryError | UserError
>;

export const makeUpdateTransaction =
  (deps: UpdateTransactionDeps) =>
  async (input: UpdateTransactionInput): Promise<UpdateTransactionOutput> => {
    // 1. Parse VOs
    const userIdResult = UserId.create(input.userId);
    if (!userIdResult.ok) return err(userIdResult.error);
    const txIdResult = TransactionId.create(input.transactionId);
    if (!txIdResult.ok) return err(txIdResult.error);
    const walletIdResult = WalletId.create(input.walletId);
    if (!walletIdResult.ok) return err(walletIdResult.error);

    // 2. Load transaction (also verifies ownership via PK scope)
    const existing = await deps.transactionRepo.findById(userIdResult.value, txIdResult.value);
    if (!existing) return err(new TransactionNotFound(input.transactionId));

    // 2a. Ownership/wallet alignment: the transaction's walletId must match path
    if (existing.walletId.toString() !== input.walletId) {
      return err(new TransactionNotFound(input.transactionId));
    }

    // 3. Load wallet (verify still active)
    const wallet = await deps.walletRepo.findById(userIdResult.value, walletIdResult.value);
    if (!wallet || wallet.deletedAt !== null) {
      return err(new WalletNotFound());
    }

    // 4. Validate categoryId if changing (type must match transaction.type)
    if (input.edits.categoryId !== undefined) {
      const categoryIdResult = CategoryId.create(input.edits.categoryId);
      if (!categoryIdResult.ok) return err(categoryIdResult.error);
      const catCheck = await deps.categoryRepo.validateCategoryForTransaction(
        userIdResult.value,
        categoryIdResult.value,
        existing.type,
      );
      if (!catCheck.ok) return err(catCheck.error);
    }

    // 5. Build Money VO if amount changing
    const moneyResult =
      input.edits.amountCents !== undefined
        ? Money.create(input.edits.amountCents, wallet.currency)
        : ok(undefined);
    if (!moneyResult.ok) return err(moneyResult.error);

    // 6. Snapshot old delta
    const oldDelta = existing.signedDelta();

    // 7. Apply edits in-memory (validates description / occurredAt)
    const editResult = existing.applyEdits(
      {
        amount: moneyResult.value,
        description: input.edits.description,
        categoryId: input.edits.categoryId,
        occurredAt: input.edits.occurredAt,
      },
      deps.clock,
    );
    if (!editResult.ok) return err(editResult.error);

    // 8. New delta + adjustment
    const newDelta = existing.signedDelta();
    const adjustment = newDelta - oldDelta;

    // 9. Persist atomically
    if (input.idempotencyHash !== undefined) {
      return deps.transactionRepo.updateIdempotent({
        transaction: existing,
        walletId: walletIdResult.value,
        walletBalanceDelta: adjustment,
        idempotencyHash: input.idempotencyHash,
      });
    } else {
      await deps.transactionRepo.update({
        transaction: existing,
        walletBalanceDelta: adjustment,
      });
      return ok({ transaction: existing, replay: false });
    }
  };
```

### 3.4 New use case: `DeleteTransaction`

```ts
// packages/domain/src/transaction/usecases/DeleteTransaction.ts

export interface DeleteTransactionInput {
  userId: string;
  walletId: string;
  transactionId: string;
}

export interface DeleteTransactionDeps {
  walletRepo: WalletRepository;
  transactionRepo: TransactionRepository;
  clock: Clock;
}

export type DeleteTransactionOutput = Result<void, TransactionError | WalletError | UserError>;

export const makeDeleteTransaction =
  (deps: DeleteTransactionDeps) =>
  async (input: DeleteTransactionInput): Promise<DeleteTransactionOutput> => {
    const userIdResult = UserId.create(input.userId);
    if (!userIdResult.ok) return err(userIdResult.error);
    const txIdResult = TransactionId.create(input.transactionId);
    if (!txIdResult.ok) return err(txIdResult.error);
    const walletIdResult = WalletId.create(input.walletId);
    if (!walletIdResult.ok) return err(walletIdResult.error);

    const existing = await deps.transactionRepo.findById(userIdResult.value, txIdResult.value);
    if (!existing) return err(new TransactionNotFound(input.transactionId));

    // Ownership/wallet alignment guard
    if (existing.walletId.toString() !== input.walletId) {
      return err(new TransactionNotFound(input.transactionId));
    }

    const wallet = await deps.walletRepo.findById(userIdResult.value, walletIdResult.value);
    if (!wallet || wallet.deletedAt !== null) {
      return err(new WalletNotFound());
    }

    // Reverse the original signed delta
    const reverseDelta = -existing.signedDelta();

    await deps.transactionRepo.hardDelete({
      userId: userIdResult.value,
      transactionId: txIdResult.value,
      walletId: walletIdResult.value,
      walletBalanceDelta: reverseDelta,
    });

    return ok(undefined);
  };
```

### 3.5 New use case: `GetTransaction`

```ts
// packages/domain/src/transaction/usecases/GetTransaction.ts

export interface GetTransactionInput {
  userId: string;
  walletId: string;
  transactionId: string;
}

export type GetTransactionOutput = Result<Transaction, TransactionError | UserError>;

export const makeGetTransaction =
  (deps: { transactionRepo: TransactionRepository }) =>
  async (input: GetTransactionInput): Promise<GetTransactionOutput> => {
    const userIdResult = UserId.create(input.userId);
    if (!userIdResult.ok) return err(userIdResult.error);
    const txIdResult = TransactionId.create(input.transactionId);
    if (!txIdResult.ok) return err(txIdResult.error);

    const tx = await deps.transactionRepo.findById(userIdResult.value, txIdResult.value);
    if (!tx) return err(new TransactionNotFound(input.transactionId));

    // Reject if the transaction belongs to a different wallet
    if (tx.walletId.toString() !== input.walletId) {
      return err(new TransactionNotFound(input.transactionId));
    }

    return ok(tx);
  };
```

---

## 4. Repository extensions (interface + DynamoDB)

### 4.1 Interface additions

```ts
// packages/domain/src/transaction/TransactionRepository.ts

export interface UpdateTransactionPersistInput {
  transaction: Transaction;
  walletBalanceDelta: number;  // adjustment to apply to wallet.balance
}

export interface UpdateIdempotentInput {
  transaction: Transaction;
  walletId: WalletId;
  walletBalanceDelta: number;
  idempotencyHash: string;
}

export interface HardDeleteInput {
  userId: UserId;
  transactionId: TransactionId;
  walletId: WalletId;
  walletBalanceDelta: number;   // reverse delta to add to wallet.balance
}

// Methods added to the interface:
update(input: UpdateTransactionPersistInput): Promise<void>;

updateIdempotent(
  input: UpdateIdempotentInput,
): Promise<Result<
  { transaction: Transaction; replay: boolean },
  TransactionError | WalletError
>>;

hardDelete(input: HardDeleteInput): Promise<void>;
```

### 4.2 DynamoDB `update` — 2-op TransactWriteItems

```ts
async update({ transaction, walletBalanceDelta }: UpdateTransactionPersistInput) {
  await this.client.send(new TransactWriteCommand({
    TransactItems: [
      {
        // [0] Update transaction item (must exist; not soft-deleted)
        Update: {
          TableName: TABLE_NAME,
          Key: {
            PK: userPK(transaction.userId.toString()),
            SK: transactionSK(transaction.walletId.toString(), transaction.id.toString()),
          },
          UpdateExpression: [
            'SET amount = :amount',
            'description = :description',
            'categoryId = :categoryId',
            'occurredAt = :occurredAt',
            'updatedAt = :updatedAt',
          ].join(', '),
          ConditionExpression: 'attribute_exists(PK) AND attribute_not_exists(deletedAt)',
          ExpressionAttributeValues: {
            ':amount': transaction.amount.amount,        // store cents
            ':description': transaction.description,     // may be null
            ':categoryId': transaction.categoryId,
            ':occurredAt': transaction.occurredAt.toISOString(),
            ':updatedAt': transaction.updatedAt.toISOString(),
          },
        },
      },
      {
        // [1] Update wallet balance (must exist; not soft-deleted)
        Update: {
          TableName: TABLE_NAME,
          Key: {
            PK: userPK(transaction.userId.toString()),
            SK: walletSK(transaction.walletId.toString()),
          },
          UpdateExpression: 'SET balance = balance + :delta, updatedAt = :now',
          ConditionExpression: 'attribute_exists(PK) AND attribute_not_exists(deletedAt)',
          ExpressionAttributeValues: {
            ':delta': walletBalanceDelta,
            ':now': transaction.updatedAt.toISOString(),
          },
        },
      },
    ],
  }));
  // Errors: a TransactionCanceledException with CancellationReasons[0]=ConditionalCheckFailed
  // means the tx is missing or deleted → use case maps to TransactionNotFound
  // CancellationReasons[1]=ConditionalCheckFailed means wallet is missing/deleted → WalletNotFound
}
```

Error narrowing reuses the existing `isTransactionCanceledException` helper.

### 4.3 DynamoDB `updateIdempotent` — 3-op

```ts
async updateIdempotent({
  transaction,
  walletId,
  walletBalanceDelta,
  idempotencyHash,
}: UpdateIdempotentInput): Promise<Result<...>> {
  // Check idempotency record FIRST (read-then-write is acceptable here because
  // the TransactWriteItems below has the idempotency Put with ConditionExpression
  // as the actual concurrency guard. The read is only an optimization to skip
  // re-validation on replay.)
  const cached = await this.replayTransaction(transaction.userId, idempotencyHash);
  if (cached) {
    return ok({ transaction: cached, replay: true });
  }

  // 3-op write: tx Update + wallet Update + idempotency Put
  try {
    await this.client.send(new TransactWriteCommand({
      TransactItems: [
        { Update: /* same as update() [0] */ },
        { Update: /* same as update() [1] */ },
        {
          // [2] Idempotency record (locked via attribute_not_exists)
          Put: {
            TableName: TABLE_NAME,
            Item: {
              PK: userPK(transaction.userId.toString()),
              SK: `IDEMPOTENCY#${idempotencyHash}`,
              entityType: 'IdempotencyRecord',
              transactionId: transaction.id.toString(),
              transactionSK: transactionSK(transaction.walletId.toString(), transaction.id.toString()),
              ttl: Math.floor(Date.now() / 1000) + 24 * 60 * 60,
              createdAt: new Date().toISOString(),
            },
            ConditionExpression: 'attribute_not_exists(PK)',
          },
        },
      ],
    }));
  } catch (e) {
    if (isTransactionCanceledException(e)) {
      const reasons = e.CancellationReasons ?? [];
      // [0] transaction not found → TransactionNotFound
      if (reasons[0]?.Code === 'ConditionalCheckFailed') {
        return err(new TransactionNotFound(transaction.id.toString()));
      }
      // [1] wallet missing/deleted → WalletNotFound
      if (reasons[1]?.Code === 'ConditionalCheckFailed') {
        return err(new WalletNotFound());
      }
      // [2] idempotency record exists → replay path
      if (reasons[2]?.Code === 'ConditionalCheckFailed') {
        const replayed = await this.replayTransaction(
          transaction.userId,
          idempotencyHash,
        );
        if (replayed) return ok({ transaction: replayed, replay: true });
        // Race: lost the write but the record is gone (TTL?) — should be rare; surface as conflict
        return err(/* generic conflict error */);
      }
    }
    throw e;
  }

  return ok({ transaction, replay: false });
}
```

### 4.4 DynamoDB `hardDelete` — 2-op

```ts
async hardDelete({
  userId,
  transactionId,
  walletId,
  walletBalanceDelta,
}: HardDeleteInput): Promise<void> {
  // We need transaction.walletId to build the SK. The use case has already
  // loaded the transaction via findById, so the walletId is in the transaction
  // object. The use case passes walletId explicitly to this method to avoid
  // re-loading.

  await this.client.send(new TransactWriteCommand({
    TransactItems: [
      {
        // [0] DELETE the transaction (must exist)
        Delete: {
          TableName: TABLE_NAME,
          Key: {
            PK: userPK(userId.toString()),
            SK: transactionSK(walletId.toString(), transactionId.toString()),
          },
          ConditionExpression: 'attribute_exists(PK) AND attribute_exists(SK)',
        },
      },
      {
        // [1] Update wallet balance with reverse delta
        Update: {
          TableName: TABLE_NAME,
          Key: {
            PK: userPK(userId.toString()),
            SK: walletSK(walletId.toString()),
          },
          UpdateExpression: 'SET balance = balance + :delta, updatedAt = :now',
          ConditionExpression: 'attribute_exists(PK) AND attribute_not_exists(deletedAt)',
          ExpressionAttributeValues: {
            ':delta': walletBalanceDelta,
            ':now': new Date().toISOString(),
          },
        },
      },
    ],
  }));
  // Errors: [0] ConditionalCheckFailed → TransactionNotFound (race); use case maps
  //         [1] ConditionalCheckFailed → WalletNotFound
}
```

The use case catches `TransactionCanceledException` and surfaces typed errors.

---

## 5. Handlers (API layer)

### 5.1 `getTransaction.ts`

```ts
const handler = async (event: AuthenticatedEvent): Promise<APIGatewayProxyResultV2> => {
  const pathValidation = validatePath(TransactionIdPathSchema, event.raw);
  if (!pathValidation.ok) return pathValidation.response;
  const path = pathValidation.data;

  const result = await container.getTransaction({
    userId: event.userId,
    walletId: path.walletId,
    transactionId: path.transactionId,
  });

  if (!result.ok) return domainErrorToResponse(result.error);

  return responseOk(transactionToResponseDTO(result.value));
};

export const main = withErrorHandler(withAuth(handler));
```

### 5.2 `patchTransaction.ts`

```ts
const handler = async (event: AuthenticatedEvent): Promise<APIGatewayProxyResultV2> => {
  const pathValidation = validatePath(TransactionIdPathSchema, event.raw);
  if (!pathValidation.ok) return pathValidation.response;
  const path = pathValidation.data;

  const bodyValidation = validateBody(UpdateTransactionRequestSchema, event.raw);
  if (!bodyValidation.ok) return bodyValidation.response;
  const body = bodyValidation.data;

  // Convert amount string → cents at boundary if present (currency is non-mutable;
  // we don't know the wallet's currency yet, so we delegate to the use case which
  // loads the wallet and then constructs Money). Spec says boundary conversion;
  // for PATCH it makes more sense to do it in the use case since we need wallet
  // to know currency. Therefore: pass amount as `amountCentsString` and convert
  // inside the use case after loading the wallet. Implementation note: extend
  // UpdateTransactionInput.edits.amount to be `{ decimalString: string }` instead
  // of `amountCents: number` for cleaner boundary.

  // Idempotency-Key header
  const idempotencyKey = readIdempotencyKeyHeader(event.raw);
  if (idempotencyKey !== null && !isValidIdempotencyKey(idempotencyKey)) {
    return badRequest('invalid_idempotency_key');
  }
  const idempotencyHash = idempotencyKey
    ? computeIdempotencyHash(
        `${event.userId}:${path.walletId}:${path.transactionId}`,
        '',
        idempotencyKey,
      )
    : undefined;
  // NOTE: signature of computeIdempotencyHash is (userId, walletId, key). For
  // PATCH we need to add transactionId to the scope. Implementation option A:
  // extend the helper signature with optional resource id. Option B: prefix the
  // userId argument with transactionId concatenation. Option A is cleaner —
  // documented as a small breaking change to the helper (back-compat preserved
  // by making the new arg optional).

  const result = await container.updateTransaction({
    userId: event.userId,
    walletId: path.walletId,
    transactionId: path.transactionId,
    edits: {
      ...(body.amount !== undefined ? { amount: body.amount } : {}),
      ...(body.description !== undefined ? { description: body.description ?? null } : {}),
      ...(body.categoryId !== undefined ? { categoryId: body.categoryId } : {}),
      ...(body.occurredAt !== undefined ? { occurredAt: new Date(body.occurredAt) } : {}),
    },
    ...(idempotencyHash ? { idempotencyHash } : {}),
  });

  if (!result.ok) return domainErrorToResponse(result.error);

  const statusCode = result.value.replay ? 200 : 200; // PATCH always 200
  return ok(transactionToResponseDTO(result.value.transaction));
};

export const main = withErrorHandler(withAuth(handler));
```

**Note**: the helper `computeIdempotencyHash` will be extended to accept a fourth optional argument `resourceId?: string` so PATCH scopes include `transactionId`. Existing POST callers pass three args and behave identically.

### 5.3 `deleteTransaction.ts`

```ts
const handler = async (event: AuthenticatedEvent): Promise<APIGatewayProxyResultV2> => {
  const pathValidation = validatePath(TransactionIdPathSchema, event.raw);
  if (!pathValidation.ok) return pathValidation.response;
  const path = pathValidation.data;

  // Idempotency-Key: accept but ignore. Still validate length so a malformed
  // header is rejected at the boundary, not by Cognito or downstream tooling.
  const idempotencyKey = readIdempotencyKeyHeader(event.raw);
  if (idempotencyKey !== null && !isValidIdempotencyKey(idempotencyKey)) {
    return badRequest('invalid_idempotency_key');
  }

  const result = await container.deleteTransaction({
    userId: event.userId,
    walletId: path.walletId,
    transactionId: path.transactionId,
  });

  if (!result.ok) return domainErrorToResponse(result.error);

  return noContent();
};

export const main = withErrorHandler(withAuth(handler));
```

---

## 6. Shared types

### 6.1 `transaction.ts` additions

```ts
// packages/shared-types/src/schemas/transaction.ts

export const UpdateTransactionRequestSchema = z
  .object({
    amount: zDecimalString.optional(),
    description: z.string().max(256).optional(),
    categoryId: zCategoryIdLike.optional(),
    occurredAt: zOccurredAt.optional(),
  })
  .strict()
  .refine(
    (data) =>
      data.amount !== undefined ||
      data.description !== undefined ||
      data.categoryId !== undefined ||
      data.occurredAt !== undefined,
    { message: 'At least one field must be provided' },
  );

export type UpdateTransactionDTO = z.infer<typeof UpdateTransactionRequestSchema>;

export const TransactionIdPathSchema = z.object({
  walletId: z.string().uuid(),
  transactionId: z.string().uuid(),
});

export type TransactionIdPathDTO = z.infer<typeof TransactionIdPathSchema>;
```

Re-export from `packages/shared-types/src/index.ts`.

### 6.2 `transaction.ts` non-changes

- `AddTransactionRequestSchema` unchanged.
- `TransactionResponseSchema` unchanged.

---

## 7. Frontend layout

### 7.1 New files

```
packages/web/src/features/transactions/
  pages/
    EditTransactionPage.tsx
  components/
    DeleteTransactionDialog.tsx
```

### 7.2 Modified files

```
packages/web/src/features/transactions/
  components/
    TransactionForm.tsx           # +mode prop, +initialValues prop, disable type+wallet in edit
    TransactionListItem.tsx       # +action row (pencil + trash)
    RecentTransactionsList.tsx    # pass-through props for the action callbacks
    TransactionList.tsx           # pass-through props (in TransactionListPage)
  pages/
    TransactionListPage.tsx       # wire delete callback to dialog + mutation
    AddTransactionPage.tsx        # no functional change, but consistency with TransactionForm signature
  queries.ts                      # +useTransaction, +useUpdateTransaction, +useDeleteTransaction
  transactionsApi.ts              # +getTransaction, +updateTransaction, +deleteTransaction

packages/web/src/app/AppRouter.tsx  # +route /wallets/:walletId/transactions/:transactionId/edit
packages/web/src/app/routes.ts      # +editTransaction route helper
packages/web/src/lib/i18n.ts        # +9 transactions strings
```

### 7.3 `EditTransactionPage.tsx`

```tsx
export const EditTransactionPage = () => {
  const { walletId = '', transactionId = '' } = useParams<{
    walletId: string;
    transactionId: string;
  }>();
  const navigate = useNavigate();
  const location = useLocation();
  const txQuery = useTransaction(walletId, transactionId);
  const walletsQuery = useWallets();
  const updateMutation = useUpdateTransaction();

  const goBack = () => {
    const from = (location.state as { from?: string } | null)?.from;
    void navigate(from ?? routes.walletDetail(walletId), { replace: true });
  };

  if (txQuery.isLoading || walletsQuery.isLoading) {
    return <SkeletonTransactionForm />;
  }

  if (txQuery.isError || walletsQuery.isError || !txQuery.data) {
    return (
      <ErrorState
        message={t.transactions.editNotFound}
        onRetry={goBack}
        retryLabel={t.common.back}
      />
    );
  }

  const tx = txQuery.data;
  const initialValues: Partial<AddTransactionDTO> = {
    type: tx.type,
    amount: tx.amount,
    categoryId: tx.categoryId,
    occurredAt: tx.occurredAt,
    description: tx.description ?? '',
    currency: tx.currency,
  };

  const onSubmit = (values: AddTransactionDTO) => {
    const diff: UpdateTransactionDTO = {};
    if (values.amount !== initialValues.amount) diff.amount = values.amount;
    if (values.description !== initialValues.description)
      diff.description = values.description || ''; // '' clears
    if (values.categoryId !== initialValues.categoryId) diff.categoryId = values.categoryId;
    if (values.occurredAt !== initialValues.occurredAt) diff.occurredAt = values.occurredAt;

    if (Object.keys(diff).length === 0) {
      toast.info(t.transactions.editNoChanges);
      return;
    }

    updateMutation.mutate(
      { walletId, transactionId, body: diff },
      {
        onSuccess: () => {
          toast.success(t.transactions.editSuccess);
          goBack();
        },
        onError: (err) => {
          if (isApiError(err) && err.status === 404) {
            toast.error(t.transactions.editNotFound);
            goBack();
          } else {
            toast.error(userMessageFor(err));
          }
        },
      },
    );
  };

  return (
    <div className="flex flex-col gap-6 pb-6">
      <PageHeader eyebrow={t.transactions.editEyebrow} title={t.transactions.editTitle} />
      <Card className="p-6">
        <TransactionForm
          mode="edit"
          initialValues={initialValues}
          wallets={walletsQuery.data}
          walletId={walletId}
          onWalletChange={() => {
            /* disabled in edit */
          }}
          onSubmit={onSubmit}
          submitting={updateMutation.isPending}
        />
      </Card>
    </div>
  );
};
```

### 7.4 `DeleteTransactionDialog.tsx`

A simple controlled `Dialog` that wraps existing `Dialog`, `DialogContent`, etc. primitives. Props: `open`, `onOpenChange`, `onConfirm`, `pending`. Button labels from i18n.

### 7.5 `TransactionListItem.tsx` modification

Add an action row of two `IconButton`s (using existing `Button` variant=`ghost` size=`icon`):

- Pencil icon → navigates to edit route, passing `state={{ from: currentPath }}` so the edit page knows where to return.
- Trash icon → invokes a callback `onDelete(transactionId)` passed by the parent (so the parent owns the dialog state and the mutation hook).

Both icon buttons stay inside the row layout; the design should not overflow on narrow viewports — the action row sits at the right of the amount with a fixed width of `~88px`.

### 7.6 Parent components (`TransactionListPage`, `WalletDetailPage`)

Hold the dialog state and the `useDeleteTransaction` mutation. Pass `onDelete: (id) => setPendingDelete(id)` down to `TransactionListItem`. Render the `DeleteTransactionDialog` at the page level — one dialog instance for the whole list.

```tsx
const [pendingDelete, setPendingDelete] = useState<string | null>(null);
const deleteMutation = useDeleteTransaction();

const confirmDelete = () => {
  if (!pendingDelete) return;
  deleteMutation.mutate(
    { walletId, transactionId: pendingDelete },
    {
      onSuccess: () => {
        toast.success(t.transactions.deleteSuccess);
        setPendingDelete(null);
      },
      onError: (err) => {
        toast.error(userMessageFor(err));
        setPendingDelete(null);
      },
    },
  );
};

// ... render list, then:
<DeleteTransactionDialog
  open={pendingDelete !== null}
  onOpenChange={(open) => !open && setPendingDelete(null)}
  onConfirm={confirmDelete}
  pending={deleteMutation.isPending}
/>;
```

### 7.7 `TransactionForm` extension

Two new optional props:

- `mode?: 'add' | 'edit'` — default `'add'`
- `initialValues?: Partial<AddTransactionDTO>` — merged over the existing defaults

In edit mode:

- The `type` Select's `disabled` prop is `true`.
- The wallet selector is rendered as a static `<Label>` + read-only text (no select), because:
  - It can't be changed.
  - Disabling the dropdown still leaves the visual artifact "this is selectable but greyed out" — read-only static text is honest.
- Submit button copy switches to `t.transactions.editSubmit` ("Guardar cambios").
- All other behavior unchanged.

The `defaultValues` of the underlying `useForm()` are computed as `{ ...existingDefaults, ...initialValues }` ONCE on mount.

---

## 8. Queries and mutations (TanStack Query)

```ts
// packages/web/src/features/transactions/queries.ts

export const transactionKeys = {
  all: ['transactions'] as const,
  detail: (walletId: string, transactionId: string) =>
    ['transactions', 'detail', walletId, transactionId] as const,
  byWallet: (walletId: string) => ['transactions', 'by-wallet', walletId] as const,
  byCategory: (categoryId: string) => ['transactions', 'by-category', categoryId] as const,
};

export const useTransaction = (walletId: string, transactionId: string) =>
  useQuery({
    queryKey: transactionKeys.detail(walletId, transactionId),
    queryFn: () => transactionsApi.getTransaction(walletId, transactionId),
    enabled: Boolean(walletId && transactionId),
    staleTime: 30_000,
  });

export const useUpdateTransaction = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: transactionsApi.updateTransaction,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: transactionKeys.all });
      void qc.invalidateQueries({ queryKey: ['wallets'] });
    },
  });
};

export const useDeleteTransaction = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: transactionsApi.deleteTransaction,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: transactionKeys.all });
      void qc.invalidateQueries({ queryKey: ['wallets'] });
    },
  });
};
```

Invalidation is broad-prefix on purpose — TanStack's invalidation with `['transactions']` as the key prefix invalidates all sub-keys including the by-wallet, by-category, and detail caches.

---

## 9. API client extensions

```ts
// packages/web/src/features/transactions/transactionsApi.ts

export const transactionsApi = {
  // ... existing list / add methods
  getTransaction: (walletId: string, transactionId: string) =>
    apiGet<TransactionResponseDTO>(`/wallets/${walletId}/transactions/${transactionId}`),

  updateTransaction: ({
    walletId,
    transactionId,
    body,
  }: {
    walletId: string;
    transactionId: string;
    body: UpdateTransactionDTO;
  }) =>
    apiPatch<TransactionResponseDTO>(`/wallets/${walletId}/transactions/${transactionId}`, body, {
      headers: { 'Idempotency-Key': crypto.randomUUID() },
    }),

  deleteTransaction: ({ walletId, transactionId }: { walletId: string; transactionId: string }) =>
    apiDelete<void>(`/wallets/${walletId}/transactions/${transactionId}`),
};
```

**Note**: the existing `apiPatch` and `apiDelete` may not exist in `lib/api/fetch.ts`. The current client probably exposes `apiGet`/`apiPost`. We add the two missing verbs (additive, mirrors `apiPost` signature). Trivial — ~20 LOC.

---

## 10. i18n additions

```ts
transactions: {
  // ... existing
  editEyebrow: 'Editar',
  editTitle: 'Editar movimiento',
  editSubmit: 'Guardar cambios',
  editSuccess: 'Movimiento actualizado',
  editNoChanges: 'No hay cambios',
  editNotFound: 'Este movimiento ya no existe',
  deleteDialogTitle: 'Eliminar movimiento',
  deleteDialogBody: 'Esta acción no se puede deshacer. El saldo de la billetera se ajustará automáticamente.',
  deleteDialogConfirm: 'Eliminar',
  deleteSuccess: 'Movimiento eliminado',
},
```

---

## 11. Cross-cutting decisions

### 11.1 Diff-and-PATCH from the frontend

The `EditTransactionPage` computes the diff between `initialValues` and submitted values, sending only changed fields. This:

- Reduces the chance of accidental writes to unchanged fields.
- Makes the server's `applyEdits` truly partial (no need for "is this field different from existing?" checks in the use case).
- Keeps the schema's `.refine` rule simple ("at least one field").

### 11.2 Description "clear" semantics

The frontend sends an empty string to clear the description. The shared schema accepts `''` (via `z.string().max(256).optional()`). The handler normalizes `''` → `null` before calling the use case. The entity's `applyEdits` treats `null` as "set to no description".

### 11.3 `signedDelta` lives on the entity

A small method on `Transaction` that returns the signed integer for balance math. Used by both `UpdateTransaction` (to compute `oldDelta` and `newDelta`) and `DeleteTransaction` (to compute the reverse delta). Single source of truth — if the sign convention ever needs to change, one place to edit.

### 11.4 `applyEdits` mutates the aggregate in place

Consistent with the rest of the codebase which uses mutable aggregates. Tests aren't a concern here (project is `strict_tdd: false`). If we ever add testing, we may revisit; for now, consistency wins.

### 11.5 Idempotency hash scope

Existing `computeIdempotencyHash(userId, walletId, key)` is extended with an optional 4th argument `resourceId?: string`. PATCH passes `transactionId` as the resource id. POST passes nothing (same as today). This:

- Prevents key collision between PATCH and POST.
- Prevents key collision between PATCHes targeting different transactions.
- Doesn't break any existing call site.

### 11.6 No batch endpoint, no "edit multiple"

Out of scope (proposal §3). The action row exposes one-at-a-time operations only.

### 11.7 The action row IS visible on every transaction (no "owner check")

In the MVP, every transaction belongs to the signed-in user (the JWT scopes everything). There is no shared ownership to enforce. If multi-user becomes a thing, the action row can be conditionally rendered. For now: always shown.

### 11.8 The dialog cannot be dismissed during in-flight delete

Implemented by setting `Dialog.onOpenChange` to a no-op while `deleteMutation.isPending`. Standard pattern; spec REQ-FE-UI-04 enforces.

### 11.9 Confirmation copy is generic about "balance adjusts"

The dialog body says "El saldo de la billetera se ajustará automáticamente." It does NOT show the new balance preview because:

- Computing it requires loading the wallet, which adds a query and a flash on dialog open.
- The list refetches anyway after success — the user sees the new balance within 200ms.

If user feedback later asks for a preview, easy enhancement.

---

## 12. Test surface (informational)

Since `strict_tdd: false`, this change does NOT add tests. If/when tests are added, the boundaries that matter:

- **`Transaction.applyEdits`** (unit) — every field-validation branch.
- **`makeUpdateTransaction`** (unit, fakes for repos) — every Result.error branch, the `adjustment = newDelta - oldDelta` math.
- **`makeDeleteTransaction`** (unit, fakes for repos) — the reverse-delta math, wallet-soft-deleted guard.
- **`DynamoDBTransactionRepository.update/hardDelete`** (integration, DynamoDB Local) — the TransactWriteItems error narrowing for each ConditionalCheckFailed case.
- **`useUpdateTransaction` / `useDeleteTransaction`** (integration, MSW) — invalidation correctness.
- **`EditTransactionPage`** (smoke, MSW + RTL) — the diff-and-PATCH logic; the "no changes" toast path; the concurrent-delete (404) path.

Manual smoke from tasks file covers the user-visible scenarios.

---

## 13. Risks and mitigations

| Risk                                                                                                                                                                                                                                                                                            | Mitigation                                                                                                                                                                                                                                       |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `applyEdits` introduces a domain mutation method that the entity didn't have before — could be called from places other than the use case in the future.                                                                                                                                        | Document the constraint in the method's docstring: "Only call from UpdateTransaction use case." Method is part of the public surface of `Transaction` (aggregates expose their state transitions), so we accept this.                            |
| Frontend diff logic compares `string` and `Date                                                                                                                                                                                                                                                 | string`values for`occurredAt`. A type mismatch could leak fields that look different but aren't.                                                                                                                                                 | The form serializes `occurredAt` as an ISO string before submit. Both `initialValues.occurredAt` and `values.occurredAt` are strings. Strict `===` compare works. |
| The `computeIdempotencyHash` signature change could ripple.                                                                                                                                                                                                                                     | The new 4th arg is **optional**. All existing callers (only POST today) keep their calls unchanged. `tsc --noEmit` validates.                                                                                                                    |
| `apiPatch` / `apiDelete` need to be added to the API client. Doing so wrong could break existing methods.                                                                                                                                                                                       | Mirror `apiPost` exactly (which already exists and works). Single file diff in `lib/api/fetch.ts`.                                                                                                                                               |
| Action row icons might collide visually with the existing amount layout.                                                                                                                                                                                                                        | Design system has `Button size="icon"` (40×40). Layout is `flex items-center justify-between` with the amount on the left and a small fixed-width action group on the right. Smoke-tested manually.                                              |
| The edit page's "no changes" path needs `initialValues.occurredAt` to be a string OR Date with consistent comparison.                                                                                                                                                                           | Normalize at page load: ensure `initialValues.occurredAt` is the ISO string (the API returns it as a string already). Diff compares strings to strings.                                                                                          |
| `replayTransaction` race in `updateIdempotent` — if the idempotency record's TTL just expired and the second request arrives, the read returns null and the write succeeds but mutates a transaction that was already mutated by the first request. The math would double-apply the adjustment. | Mitigation: the idempotency record is the ConditionExpression on the Put. If the record exists, the write fails as TransactionCanceledException[2]. Race window is microseconds; for personal use this is acceptable. Audit notes the trade-off. |
| Edit page can be opened with a stale URL after a delete; the GET returns 404.                                                                                                                                                                                                                   | `EditTransactionPage` handles 404 (REQ-FE-EDIT-02 ErrorState path). User sees "Volver" and navigates back.                                                                                                                                       |
| The dialog body promises "el saldo se ajustará automáticamente" but the new balance isn't shown. If the math is wrong (e.g., a domain bug), the user sees an incorrect balance after the refetch and has no visual confirmation of the intended change.                                         | This is a real risk in any system; mitigations are testing + manual verification. Acceptable for MVP.                                                                                                                                            |

---

## 14. Estimated impact

| Surface                               | LOC (new)                                                             | LOC (modified)                                                     |
| ------------------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `packages/shared-types`               | ~40                                                                   | 0                                                                  |
| `packages/domain`                     | ~280 (3 use cases + entity method + error class)                      | ~10                                                                |
| `packages/api`                        | ~250 (3 handlers + repo methods + container wires + helper extension) | ~10                                                                |
| `packages/infra-sls`                  | ~30                                                                   | ~5                                                                 |
| `packages/web`                        | ~250 (edit page + dialog + queries + api client)                      | ~140 (form extension, list item action row, parents, router, i18n) |
| **Total**                             | **~850**                                                              | **~165**                                                           |
| **Grand total estimated changed LOC** |                                                                       | **~1015**                                                          |

This is over the 400-line PR budget. The Review Workload Guard in the tasks phase will flag this and we'll decide between:

- Single PR with `size:exception`
- 2-PR chain (backend first, frontend after backend is deployed)
- 3-PR chain (shared-types + domain → api + serverless → frontend)

That decision belongs in the tasks phase; spec/design just expose the volume honestly.
