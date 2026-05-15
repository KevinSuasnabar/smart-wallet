# Design: wallet-edit-delete

> SDD phase: design
> Project: smart-wallet
> Change: wallet-edit-delete
> Date: 2026-05-15
> Engram topic_key: `sdd/wallet-edit-delete/design`

---

## 1. Files affected

### New

```
packages/domain/src/wallet/usecases/
  UpdateWallet.ts
  DeleteWallet.ts

packages/api/src/handlers/wallet/
  patchWallet.ts
  deleteWallet.ts

packages/infra-sls/src/handlers/wallet/
  patchWallet.ts          # re-export shim
  deleteWallet.ts         # re-export shim

packages/web/src/features/wallets/
  pages/EditWalletPage.tsx
  components/DeleteWalletDialog.tsx
```

### Modified

```
packages/domain/src/wallet/
  Wallet.ts                            # +applyEdits method
  WalletError.ts                       # +WalletCurrencyLocked
  WalletRepository.ts                  # +update, +hardDeleteWithTransactions
  index.ts                             # re-export new use cases + error

packages/api/src/adapters/dynamodb/repositories/
  DynamoDBWalletRepository.ts          # +update, +hardDeleteWithTransactions impls

packages/api/src/composition/
  container.ts                         # wire updateWallet + deleteWallet

packages/shared-types/src/schemas/wallet.ts   # +UpdateWalletRequestSchema, +UpdateWalletDTO
packages/shared-types/src/index.ts            # re-export new types

packages/infra-sls/serverless.yml            # +patchWallet, +deleteWallet functions

packages/web/src/lib/i18n.ts                 # +wallet edit/delete strings
packages/web/src/lib/api/errors.ts           # +wallet_currency_locked mapping

packages/web/src/features/wallets/
  walletsApi.ts                              # +update, +remove
  queries.ts                                 # +useUpdateWallet, +useDeleteWallet
  pages/WalletDetailPage.tsx                 # +edit/delete action bar, +DeleteWalletDialog wiring

packages/web/src/app/
  routes.ts                                  # +walletEdit
  AppRouter.tsx                              # +EditWalletPage route
```

Total: 10 new files, 13 modified. Estimated ~700 LOC delta.

---

## 2. Domain layer

### 2.1 `WalletError.ts` — add `WalletCurrencyLocked`

Append next to the existing classes:

```ts
/** Cannot change a wallet's currency while it has at least one active transaction. */
export class WalletCurrencyLocked extends DomainError {
  readonly tag = 'domain.wallet.currency_locked' as const;
  readonly httpStatus = 409 as const;

  constructor(message = 'Cannot change currency of a wallet with transactions') {
    super(message);
  }
}
```

Add to the union: `... | WalletCurrencyLocked`.

### 2.2 `Wallet.ts` — add `applyEdits`

Mirrors `Transaction.applyEdits()` from the prior PR. Inserts after `applyTransactionDelta`:

```ts
/**
 * Apply a partial edit in place. Validates each provided field with the
 * factory's validators. Rolls back to the pre-call state on any failure.
 *
 * The use case is responsible for higher-level checks like "is this wallet
 * allowed to change currency given its transactions?".
 */
applyEdits(
  edits: { name?: string; currency?: string },
  clock: Clock,
): Result<void, WalletError> {
  const snapshot: WalletProps = { ...this._props };

  if (edits.name !== undefined) {
    const trimmed = edits.name.trim();
    if (trimmed.length === 0 || trimmed.length > 64) {
      return err(new InvalidWalletName());
    }
    this._props.name = trimmed;
  }

  if (edits.currency !== undefined) {
    if (!VALID_CURRENCIES.includes(edits.currency as Currency)) {
      this._props = snapshot;
      return err(new InvalidWalletCurrency());
    }
    this._props.currency = edits.currency as Currency;
  }

  this._props.updatedAt = clock.now();
  return ok(undefined);
}
```

### 2.3 `WalletRepository.ts` — extend interface

```ts
export interface WalletRepository {
  save(wallet: Wallet): Promise<void>;
  // NEW
  update(wallet: Wallet): Promise<void>;
  // NEW
  hardDeleteWithTransactions(userId: UserId, walletId: WalletId): Promise<void>;
  findById(userId: UserId, walletId: WalletId): Promise<Wallet | null>;
  listByUser(...): Promise<{ items: Wallet[]; nextCursor?: string }>;
}
```

### 2.4 `UpdateWallet.ts` use case

```ts
export interface UpdateWalletInput {
  userId: string;
  walletId: string;
  edits: { name?: string; currency?: string };
}

export interface UpdateWalletDeps {
  walletRepo: WalletRepository;
  transactionRepo: TransactionRepository;
  clock: Clock;
}

export type UpdateWalletOutput = Result<
  Wallet,
  WalletError | UserError
>;

export const makeUpdateWallet =
  (deps: UpdateWalletDeps) =>
  async (input: UpdateWalletInput): Promise<UpdateWalletOutput> => {
    const userIdResult = UserId.create(input.userId);
    if (!userIdResult.ok) return err(userIdResult.error);
    const walletIdResult = WalletId.create(input.walletId);
    if (!walletIdResult.ok) return err(walletIdResult.error);

    const wallet = await deps.walletRepo.findById(userIdResult.value, walletIdResult.value);
    if (wallet === null || wallet.deletedAt !== null) {
      return err(new WalletNotFound());
    }

    // Currency-lock check: only if currency is actually changing.
    if (
      input.edits.currency !== undefined &&
      input.edits.currency !== wallet.currency
    ) {
      const probe = await deps.transactionRepo.listByWallet(
        userIdResult.value,
        walletIdResult.value,
        { limit: 1 },
      );
      if (probe.items.length > 0) {
        return err(new WalletCurrencyLocked());
      }
    }

    const editResult = wallet.applyEdits(input.edits, deps.clock);
    if (!editResult.ok) return err(editResult.error);

    await deps.walletRepo.update(wallet);
    return ok(wallet);
  };
```

### 2.5 `DeleteWallet.ts` use case

```ts
export interface DeleteWalletInput {
  userId: string;
  walletId: string;
}

export interface DeleteWalletDeps {
  walletRepo: WalletRepository;
  clock: Clock;
}

export type DeleteWalletOutput = Result<void, WalletError | UserError>;

export const makeDeleteWallet =
  (deps: DeleteWalletDeps) =>
  async (input: DeleteWalletInput): Promise<DeleteWalletOutput> => {
    const userIdResult = UserId.create(input.userId);
    if (!userIdResult.ok) return err(userIdResult.error);
    const walletIdResult = WalletId.create(input.walletId);
    if (!walletIdResult.ok) return err(walletIdResult.error);

    // Existence check before issuing the cascade
    const wallet = await deps.walletRepo.findById(userIdResult.value, walletIdResult.value);
    if (wallet === null || wallet.deletedAt !== null) {
      return err(new WalletNotFound());
    }

    try {
      await deps.walletRepo.hardDeleteWithTransactions(userIdResult.value, walletIdResult.value);
    } catch (e) {
      // The repo throws if the wallet was concurrently removed between
      // findById and the cascade. Map it to WalletNotFound for consistency.
      if (isWalletConcurrentlyRemoved(e)) {
        return err(new WalletNotFound());
      }
      throw e;
    }

    return ok(undefined);
  };
```

The `isWalletConcurrentlyRemoved` predicate inspects the `TransactionCanceledException`'s `CancellationReasons` array to check whether the final wallet Delete failed its `ConditionExpression`. Defined in the same file or a small helper.

---

## 3. Repository implementation (DynamoDB)

### 3.1 `update(wallet)` — Put with conditional

```ts
async update(wallet: Wallet): Promise<void> {
  await ddb.send(new PutCommand({
    TableName: TABLE_NAME,
    Item: walletToItem(wallet),
    ConditionExpression: 'attribute_exists(PK)',
  }));
}
```

If the wallet doesn't exist (concurrent delete), the Put throws `ConditionalCheckFailedException`. The use case catches it; rare in practice (the use case did `findById` immediately before).

### 3.2 `hardDeleteWithTransactions(userId, walletId)` — chunked cascade

```ts
async hardDeleteWithTransactions(userId: UserId, walletId: WalletId): Promise<void> {
  const pk = userPK(userId.toString());
  const skPrefix = transactionSKPrefix(walletId.toString());

  // 1. Paginated Query for all tx SKs
  const txSKs: string[] = [];
  let cursor: Record<string, unknown> | undefined = undefined;
  do {
    const resp = await ddb.send(new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :skp)',
      ExpressionAttributeValues: { ':pk': pk, ':skp': skPrefix },
      ProjectionExpression: 'SK',   // only the SK
      ...(cursor ? { ExclusiveStartKey: cursor } : {}),
    }));
    for (const item of resp.Items ?? []) {
      txSKs.push(item.SK as string);
    }
    cursor = resp.LastEvaluatedKey as Record<string, unknown> | undefined;
  } while (cursor !== undefined);

  // 2. Chunked TransactWriteItems
  const CHUNK_SIZE = 99;  // leave room for 1 wallet op in the final chunk

  if (txSKs.length === 0) {
    // No transactions: single op
    await ddb.send(new TransactWriteCommand({
      TransactItems: [{
        Delete: {
          TableName: TABLE_NAME,
          Key: { PK: pk, SK: walletSK(walletId.toString()) },
          ConditionExpression: 'attribute_exists(PK)',
        },
      }],
    }));
    return;
  }

  for (let i = 0; i < txSKs.length; i += CHUNK_SIZE) {
    const chunk = txSKs.slice(i, i + CHUNK_SIZE);
    const isLast = i + CHUNK_SIZE >= txSKs.length;

    const items = chunk.map(sk => ({
      Delete: { TableName: TABLE_NAME, Key: { PK: pk, SK: sk } },
    }));

    if (isLast) {
      items.push({
        Delete: {
          TableName: TABLE_NAME,
          Key: { PK: pk, SK: walletSK(walletId.toString()) },
          ConditionExpression: 'attribute_exists(PK)',
        },
      });
    }

    await ddb.send(new TransactWriteCommand({ TransactItems: items }));
  }
}
```

Notes:
- `ProjectionExpression: 'SK'` reduces bandwidth (we only need the keys).
- The final wallet Delete has the `ConditionExpression` so concurrent removal surfaces.
- A failure mid-loop propagates; the use case maps it. We accept partial cascade on retry; the next attempt's Query returns only surviving rows.

### 3.3 Error narrowing helper

```ts
function isWalletConcurrentlyRemoved(e: unknown): boolean {
  if (!isTransactionCanceledException(e)) return false;
  const reasons = e.CancellationReasons ?? [];
  // The wallet Delete is always the LAST item in the final chunk
  return reasons.some(r => r?.Code === 'ConditionalCheckFailed');
}
```

In practice we only need this on the final chunk's response, but checking `some` keeps the helper simple.

---

## 4. HTTP handlers

### 4.1 `patchWallet.ts`

```ts
const handler = async (event: AuthenticatedEvent): Promise<APIGatewayProxyResultV2> => {
  const pathValidation = validatePath(WalletIdPathSchema, event.raw);
  if (!pathValidation.ok) return pathValidation.response;
  const { walletId } = pathValidation.data;

  const bodyValidation = validateBody(UpdateWalletRequestSchema, event.raw);
  if (!bodyValidation.ok) return bodyValidation.response;
  const body: UpdateWalletDTO = bodyValidation.data;

  const edits: { name?: string; currency?: string } = {};
  if (body.name !== undefined) edits.name = body.name;
  if (body.currency !== undefined) edits.currency = body.currency;

  const result = await container.updateWallet({
    userId: event.userId,
    walletId,
    edits,
  });

  if (!result.ok) {
    const e = result.error;
    if (e instanceof WalletNotFound) return notFound('wallet_not_found');
    if (e instanceof WalletCurrencyLocked) return conflict('wallet_currency_locked');
    return domainErrorToResponse(e);
  }

  const w = result.value;
  return responseOk({
    walletId: w.id.toString(),
    name: w.name,
    currency: w.currency,
    balance: formatCentsForResponse(w.balance, w.currency),
    createdAt: w.createdAt.toISOString(),
    updatedAt: w.updatedAt.toISOString(),
  });
};

export const main = withErrorHandler(withAuth(handler));
```

### 4.2 `deleteWallet.ts`

```ts
const handler = async (event: AuthenticatedEvent): Promise<APIGatewayProxyResultV2> => {
  const pathValidation = validatePath(WalletIdPathSchema, event.raw);
  if (!pathValidation.ok) return pathValidation.response;
  const { walletId } = pathValidation.data;

  const result = await container.deleteWallet({
    userId: event.userId,
    walletId,
  });

  if (!result.ok) {
    const e = result.error;
    if (e instanceof WalletNotFound) return notFound('wallet_not_found');
    return domainErrorToResponse(e);
  }

  return noContent();
};

export const main = withErrorHandler(withAuth(handler));
```

### 4.3 Re-export shims

Same pattern as `transaction-edit-delete`:

```ts
// packages/infra-sls/src/handlers/wallet/patchWallet.ts
export { main } from '@smart-wallet/api/handlers/wallet/patchWallet.js';

// packages/infra-sls/src/handlers/wallet/deleteWallet.ts
export { main } from '@smart-wallet/api/handlers/wallet/deleteWallet.js';
```

---

## 5. Shared types

### 5.1 `schemas/wallet.ts` add

```ts
export const UpdateWalletRequestSchema = z
  .object({
    name: z.string().trim().min(1).max(64).optional(),
    currency: zCurrency.optional(),
  })
  .strict()
  .refine(
    (data) => data.name !== undefined || data.currency !== undefined,
    { message: 'At least one mutable field must be provided' },
  );

export type UpdateWalletDTO = z.infer<typeof UpdateWalletRequestSchema>;
```

Re-export from the root `index.ts`.

---

## 6. Frontend

### 6.1 `walletsApi.ts` — add `update` + `remove`

```ts
export const walletsApi = {
  // existing: list, get, create
  update: (walletId: string, dto: UpdateWalletDTO): Promise<WalletResponseDTO> =>
    apiClient.patch<WalletResponseDTO>(`/wallets/${walletId}`, dto),

  remove: (walletId: string): Promise<void> =>
    apiClient.del(`/wallets/${walletId}`),
};
```

### 6.2 `queries.ts` — add mutations

```ts
export const useUpdateWallet = () => {
  const qc = useQueryClient();
  return useMutation<WalletResponseDTO, Error, { walletId: string; dto: UpdateWalletDTO }>({
    mutationFn: ({ walletId, dto }) => walletsApi.update(walletId, dto),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: walletKeys.all });
    },
  });
};

export const useDeleteWallet = () => {
  const qc = useQueryClient();
  return useMutation<void, Error, { walletId: string }>({
    mutationFn: ({ walletId }) => walletsApi.remove(walletId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: walletKeys.all });
      void qc.invalidateQueries({ queryKey: ['transactions'] });  // cascade scope
    },
  });
};
```

### 6.3 `EditWalletPage.tsx`

```tsx
export const EditWalletPage = () => {
  const { walletId = '' } = useParams<{ walletId: string }>();
  const navigate = useNavigate();
  const location = useLocation();

  const walletQuery = useWallet(walletId);
  const txProbe = useWalletTransactions(walletId, { limit: 1 });  // currency lock probe
  const updateMutation = useUpdateWallet();

  const hasTransactions = (txProbe.data?.pages[0]?.items?.length ?? 0) > 0;

  const goBack = () => {
    const from = (location.state as { from?: string } | null)?.from;
    void navigate(from ?? routes.walletDetail(walletId), { replace: true });
  };

  // Loading / error / form (with diff-and-PATCH submit like EditTransactionPage)
  // CurrencySelect disabled={hasTransactions}
  // Helper line below currency when disabled
};
```

Layout: same shell as `EditTransactionPage` (PageHeader + Card + form).

### 6.4 `DeleteWalletDialog.tsx`

```tsx
interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  pending: boolean;
}

export const DeleteWalletDialog = ({ open, onOpenChange, onConfirm, pending }: Props) => {
  const handleOpenChange = (next: boolean) => {
    if (pending && !next) return;
    onOpenChange(next);
  };
  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        onEscapeKeyDown={(e) => pending && e.preventDefault()}
        onPointerDownOutside={(e) => pending && e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>{t.wallets.deleteDialogTitle}</DialogTitle>
          <DialogDescription>{t.wallets.deleteDialogBody}</DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2">
          <Button variant="outline" disabled={pending} onClick={() => onOpenChange(false)}>
            {t.common.cancel}
          </Button>
          <Button variant="destructive" disabled={pending} onClick={onConfirm}>
            {pending ? t.app.loading : t.wallets.deleteDialogConfirm}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
```

### 6.5 `WalletDetailPage.tsx` — add action bar

Add two icon buttons next to the existing back button area:

```tsx
const [walletDeleteOpen, setWalletDeleteOpen] = useState(false);
const deleteWallet = useDeleteWallet();

const confirmDelete = () => {
  deleteWallet.mutate(
    { walletId: wallet.walletId },
    {
      onSuccess: () => {
        toast.success(t.wallets.deleteSuccess);
        setWalletDeleteOpen(false);
        void navigate(routes.wallets, { replace: true });
      },
      onError: (err) => {
        toast.error(userMessageFor(err));
        setWalletDeleteOpen(false);
      },
    },
  );
};
```

JSX additions next to back button:
```tsx
<div className="flex items-center gap-2">
  <Button variant="ghost" size="icon" onClick={() => navigate(routes.walletEdit(wallet.walletId))}>
    <Pencil className="size-4" />
  </Button>
  <Button variant="ghost" size="icon" onClick={() => setWalletDeleteOpen(true)}>
    <Trash2 className="size-4" />
  </Button>
</div>

<DeleteWalletDialog
  open={walletDeleteOpen}
  onOpenChange={setWalletDeleteOpen}
  onConfirm={confirmDelete}
  pending={deleteWallet.isPending}
/>
```

### 6.6 Routing

Add to `routes.ts`:
```ts
walletEdit: (walletId: string) => `/wallets/${walletId}/edit`,
```

Add to `AppRouter.tsx`:
```tsx
<Route
  path="/wallets/:walletId/edit"
  element={<EditWalletPage />}
/>
```

### 6.7 i18n + error mapping

i18n strings under `t.wallets`: see spec WAL-FE-I18N-01 (verbatim).

`errors.ts`:
```ts
if (err.code === 'wallet_currency_locked')
  return t.wallets.currencyLockedError;
```

Inserted alongside the existing code-checks before the status-based fallbacks.

---

## 7. Cross-cutting decisions

### 7.1 Edit-page diff logic mirrors EditTransactionPage

Both pages compute a diff of `current vs initialValues` and PATCH only changed fields. If `diff` is empty → toast "No hay cambios" and skip the request. Same UX vocabulary.

### 7.2 Cascade query uses ProjectionExpression: 'SK'

Saves bandwidth — we only need the SK to identify which items to delete. The full transaction items are not loaded.

### 7.3 No idempotency-key on PATCH or DELETE wallet

Documented in proposal §4.6. Personal-use, single user.

### 7.4 Currency-change requires re-render of `useWalletTransactions` probe

The edit page mounts the probe alongside the wallet query. Both invalidate on success/error. The probe uses `limit: 1` so it's bounded.

If the probe fails (network) on mount, the page falls back to **assuming the wallet has transactions** (defensive — better to disable a field falsely than to allow a 409 round-trip). Documented inline.

### 7.5 The list page's `WalletCard` does NOT get action buttons

Action affordances live only on the detail page. Reasons:
- Reduces accidental click on a delete on the list.
- Keeps the card focused on its navigation role.
- Consistent with the transaction edit/delete pattern (action row lives inside the row, but the row is itself the "detail" view of a single transaction).

---

## 8. Risks (carried over from proposal + new)

| Risk | Mitigation |
|------|------------|
| Cascade query on a 10k-tx wallet does many pages of Query reads. | Personal-use scale rarely produces such volumes. If observed, switch to a "mark for deletion + async sweeper" pattern. Out of scope here. |
| Concurrent transaction insert during cascade leaves orphans. | The cascade Query is paginated; a transaction inserted mid-cascade with a later sort key may be missed. Unlikely on a single-user app. Documented; not mitigated. |
| `transactionRepo.listByWallet` probe network error during edit page mount blocks the user. | Default to "assume has transactions" (currency locked) on probe error. User can edit name. They retry / refresh to clear the probe error. |
| The cascade's non-atomicity surfaces as a partial state during a long delete | Subsequent retry is safe (query returns only surviving rows). Documented in proposal §4.4. |

---

## 9. Estimated impact

| Surface | LOC delta |
|---------|-----------|
| Shared types | +20 |
| Domain (entity + errors + 2 use cases) | +200 |
| Api (repo +2 methods + 2 handlers + container + shims) | +250 |
| Serverless | +20 |
| Web (page + dialog + queries + api + i18n + errors + router) | +250 |
| **Total** | **~740** |

Above the 400-line budget. Per the existing `delivery_strategy: ask-on-risk` rule and the user's previous "single PR with size:exception" choice for similarly-sized changes, **single PR with size:exception** is the most coherent option (the domain entity, use cases, handlers, and UI are tightly coupled — splitting backend from frontend would force a temporary mismatch where the UI calls endpoints that exist but isn't released).

Decision: **single PR**. Same shape as `transaction-edit-delete` part 2 of the chain.
