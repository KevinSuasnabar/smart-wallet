import { GetCommand, QueryCommand, TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import { ok, err } from '@smart-wallet/domain';
import type {
  TransactionRepository,
  AddTransactionPersistInput,
  AddIdempotentInput,
  UpdateTransactionPersistInput,
  UpdateIdempotentInput,
  HardDeleteInput,
  Transaction,
  TransactionId,
  UserId,
  WalletId,
  ListByWalletFilter,
  ListByCategoryFilter,
  MonthlyTransactionSummary,
  Result,
  TransactionError,
  WalletError,
} from '@smart-wallet/domain';
import { WalletNotFound, TransactionNotFound } from '@smart-wallet/domain';
import { ddb, TABLE_NAME, GSI1_NAME } from '../DynamoDBClient.js';
import {
  userPK,
  walletSK,
  transactionSK,
  transactionSKPrefix,
  transactionGsi1SK,
  idempotencySK,
} from '../keyBuilders.js';
import { encodeCursor, decodeCursor } from '../cursor.js';
import { transactionToItem, itemToTransaction } from '../mappers/TransactionMapper.js';
import type { TransactionItem } from '../mappers/TransactionMapper.js';

// ── TransactionCanceledException shape (AWS SDK v3) ───────────────────────
// The SDK throws a generic Error but with code 'TransactionCanceledException'
// and a CancellationReasons array. We narrow it manually.

interface CancellationReason {
  Code?: string;
  Message?: string;
}

interface TransactionCanceledError extends Error {
  name: 'TransactionCanceledException';
  CancellationReasons?: CancellationReason[];
}

function isTransactionCanceledException(e: unknown): e is TransactionCanceledError {
  if (e === null || typeof e !== 'object' || !('name' in e)) return false;
  // After 'name' in e, TS narrows e to object & { name: unknown } — no cast needed
  return e.name === 'TransactionCanceledException';
}

// ── IdempotencyRecord item shape ──────────────────────────────────────────

interface IdempotencyRecordItem {
  PK: string;
  SK: string; // IDEMPOTENCY#{hash}
  entityType: 'IdempotencyRecord';
  transactionId: string;
  /** Full TXN#... SK stored to avoid scan-by-transactionId on replay. */
  transactionSK: string;
  /** Unix epoch seconds — DynamoDB native TTL. CDK Slice 12 sets TimeToLiveSpecification on `ttl`. */
  ttl: number;
  createdAt: string;
}

// ── Repository ────────────────────────────────────────────────────────────

export class DynamoDBTransactionRepository implements TransactionRepository {
  /**
   * Atomically persist a new transaction and update wallet balance (2-op path).
   *  [0] Put the new Transaction item — fail if already exists (UUID collision guard).
   *  [1] Update Wallet balance — fail if wallet is missing or soft-deleted.
   *
   * Use `addIdempotent` for the 3-op path when an Idempotency-Key header is present.
   */
  async add(input: AddTransactionPersistInput): Promise<void> {
    const { transaction, walletBalanceDelta } = input;

    await ddb.send(
      new TransactWriteCommand({
        TransactItems: [
          {
            // [0] Insert the transaction — fail if a duplicate is somehow written
            Put: {
              TableName: TABLE_NAME,
              Item: transactionToItem(transaction),
              ConditionExpression: 'attribute_not_exists(PK) AND attribute_not_exists(SK)',
            },
          },
          {
            // [1] Update wallet balance — fail if wallet is missing or soft-deleted
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
      }),
    );
  }

  /**
   * Idempotent 3-op TransactWriteItems:
   *   [0] Transaction Put (attribute_not_exists guard — UUID collision protection)
   *   [1] Wallet Update  (wallet must exist + not soft-deleted)
   *   [2] IdempotencyRecord Put (attribute_not_exists — the idempotency lock)
   *
   * CancellationReasons ordering is FIXED. Error mapping:
   *   [0] ConditionalCheckFailed → UUID collision (extremely unlikely) → 500-equivalent
   *   [1] ConditionalCheckFailed → wallet gone or soft-deleted → WalletNotFound (404)
   *   [2] ConditionalCheckFailed → duplicate request → replay path (200)
   */
  async addIdempotent(
    input: AddIdempotentInput,
  ): Promise<
    Result<{ transaction: Transaction; replay: boolean }, TransactionError | WalletError>
  > {
    const { transaction, walletBalanceDelta, walletId, idempotencyHash } = input;

    const txItem = transactionToItem(transaction);
    const occurredAtIso = transaction.occurredAt.toISOString();
    const txSK = transactionSK(walletId.toString(), occurredAtIso, transaction.id.toString());
    const pk = userPK(transaction.userId.toString());
    const idemSK = idempotencySK(idempotencyHash);
    const now = new Date().toISOString();
    const ttlEpoch = ((Date.now() / 1000) | 0) + 86400; // 24 h from now

    const idempotencyItem: IdempotencyRecordItem = {
      PK: pk,
      SK: idemSK,
      entityType: 'IdempotencyRecord',
      transactionId: transaction.id.toString(),
      transactionSK: txSK,
      ttl: ttlEpoch,
      createdAt: now,
    };

    try {
      await ddb.send(
        new TransactWriteCommand({
          TransactItems: [
            {
              // [0] Transaction Put — UUID collision guard
              Put: {
                TableName: TABLE_NAME,
                Item: txItem,
                ConditionExpression: 'attribute_not_exists(PK) AND attribute_not_exists(SK)',
              },
            },
            {
              // [1] Wallet balance Update — wallet must exist + not be soft-deleted
              Update: {
                TableName: TABLE_NAME,
                Key: {
                  PK: pk,
                  SK: walletSK(walletId.toString()),
                },
                UpdateExpression: 'SET balance = balance + :delta, updatedAt = :now',
                ConditionExpression: 'attribute_exists(PK) AND attribute_not_exists(deletedAt)',
                ExpressionAttributeValues: {
                  ':delta': walletBalanceDelta,
                  ':now': now,
                },
              },
            },
            {
              // [2] IdempotencyRecord Put — attribute_not_exists is the idempotency lock
              Put: {
                TableName: TABLE_NAME,
                Item: idempotencyItem,
                ConditionExpression: 'attribute_not_exists(PK) AND attribute_not_exists(SK)',
              },
            },
          ],
        }),
      );

      return ok({ transaction, replay: false });
    } catch (e: unknown) {
      if (!isTransactionCanceledException(e)) throw e;

      const reasons = e.CancellationReasons ?? [];
      const reason0 = reasons[0];
      const reason1 = reasons[1];
      const reason2 = reasons[2];

      // [2] ConditionalCheckFailed → idempotency lock already exists → replay
      if (reason2?.Code === 'ConditionalCheckFailed') {
        const replayed = await this.replayTransaction(pk, idemSK);
        if (replayed === null) {
          // TTL expired between the condition check and the get — treat as new (re-throw to 500)
          throw new Error(`Idempotency replay failed: record expired for hash ${idempotencyHash}`);
        }
        return ok({ transaction: replayed, replay: true });
      }

      // [1] ConditionalCheckFailed → wallet missing or soft-deleted
      if (reason1?.Code === 'ConditionalCheckFailed') {
        return err(new WalletNotFound());
      }

      // [0] ConditionalCheckFailed → Transaction UUID collision (bug-level event)
      if (reason0?.Code === 'ConditionalCheckFailed') {
        throw new Error(
          `Transaction UUID collision on ${transaction.id.toString()} — this is a bug`,
        );
      }

      // Unhandled cancellation reason — re-throw for withErrorHandler to catch
      throw e;
    }
  }

  /**
   * Fetch the original transaction using the transactionSK cached in the IdempotencyRecord.
   * Avoids a scan-by-transactionId on the replay path.
   */
  private async replayTransaction(pk: string, idemSK: string): Promise<Transaction | null> {
    // 1. Get IdempotencyRecord to read the cached transactionSK
    const idemResponse = await ddb.send(
      new GetCommand({
        TableName: TABLE_NAME,
        Key: { PK: pk, SK: idemSK },
      }),
    );

    const idemItem = idemResponse.Item as IdempotencyRecordItem | undefined;
    if (!idemItem) return null;

    // 2. Get the original Transaction using the cached SK (no scan needed)
    const txResponse = await ddb.send(
      new GetCommand({
        TableName: TABLE_NAME,
        Key: { PK: pk, SK: idemItem.transactionSK },
      }),
    );

    const txItem = txResponse.Item as TransactionItem | undefined;
    if (!txItem) return null;

    const result = itemToTransaction(txItem);
    return result.ok ? result.value : null;
  }

  async findById(userId: UserId, transactionId: TransactionId): Promise<Transaction | null> {
    // The Transaction SK requires walletId + occurredAt which we don't know here.
    // Use a Query by PK + SK begins_with filter on transactionId since we lack the full SK.
    // This is a scan-within-partition — acceptable at MVP scale.
    // A more efficient approach would store a GSI2 with transactionId as SK,
    // but that's deferred to a future slice.
    const response = await ddb.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :skp)',
        FilterExpression: 'transactionId = :tid AND attribute_not_exists(deletedAt)',
        ExpressionAttributeValues: {
          ':pk': userPK(userId.toString()),
          ':skp': 'TXN#',
          ':tid': transactionId.toString(),
        },
      }),
    );

    const first = response.Items?.[0];
    if (!first) return null;

    const result = itemToTransaction(first as TransactionItem);
    return result.ok ? result.value : null;
  }

  async listByWallet(
    userId: UserId,
    walletId: WalletId,
    filter: ListByWalletFilter,
  ): Promise<{ items: Transaction[]; nextCursor?: string }> {
    const skPrefix = transactionSKPrefix(walletId.toString());

    const expressionValues: Record<string, unknown> = {
      ':pk': userPK(userId.toString()),
      ':skp': skPrefix,
    };

    const filterParts: string[] = ['attribute_not_exists(deletedAt)'];

    if (filter.type !== undefined) {
      filterParts.push('#type = :type');
      expressionValues[':type'] = filter.type;
    }
    if (filter.categoryId !== undefined) {
      filterParts.push('categoryId = :categoryId');
      expressionValues[':categoryId'] = filter.categoryId;
    }
    if (filter.from !== undefined) {
      filterParts.push('occurredAt >= :from');
      expressionValues[':from'] = filter.from.toISOString();
    }
    if (filter.to !== undefined) {
      filterParts.push('occurredAt <= :to');
      expressionValues[':to'] = filter.to.toISOString();
    }

    const hasTypeFilter = filter.type !== undefined;

    const response = await ddb.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :skp)',
        FilterExpression: filterParts.join(' AND '),
        ExpressionAttributeValues: expressionValues,
        ...(hasTypeFilter ? { ExpressionAttributeNames: { '#type': 'type' } } : {}),
        Limit: filter.limit,
        ExclusiveStartKey: decodeCursor(filter.cursor),
        ScanIndexForward: false, // newest first
      }),
    );

    const items = (response.Items ?? [])
      .map((raw) => itemToTransaction(raw as TransactionItem))
      .filter((res) => res.ok)
      .map((res) => res.value);

    const result: { items: Transaction[]; nextCursor?: string } = { items };
    const nextCursor = encodeCursor(
      response.LastEvaluatedKey as Record<string, unknown> | undefined,
    );
    if (nextCursor !== undefined) {
      result.nextCursor = nextCursor;
    }
    return result;
  }

  async listByCategory(
    userId: UserId,
    categoryId: string,
    filter: ListByCategoryFilter,
  ): Promise<{ items: Transaction[]; nextCursor?: string }> {
    const expressionValues: Record<string, unknown> = {
      ':pk': userPK(userId.toString()),
      ':gsi1skp': `CAT#${categoryId}#`,
    };

    const filterParts: string[] = ['attribute_not_exists(deletedAt)'];

    if (filter.from !== undefined) {
      filterParts.push('occurredAt >= :from');
      expressionValues[':from'] = filter.from.toISOString();
    }
    if (filter.to !== undefined) {
      filterParts.push('occurredAt <= :to');
      expressionValues[':to'] = filter.to.toISOString();
    }

    const response = await ddb.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        IndexName: GSI1_NAME,
        KeyConditionExpression: 'GSI1PK = :pk AND begins_with(GSI1SK, :gsi1skp)',
        FilterExpression: filterParts.join(' AND '),
        ExpressionAttributeValues: expressionValues,
        Limit: filter.limit,
        ExclusiveStartKey: decodeCursor(filter.cursor),
        ScanIndexForward: false, // newest first
      }),
    );

    const items = (response.Items ?? [])
      .map((raw) => itemToTransaction(raw as TransactionItem))
      .filter((res) => res.ok)
      .map((res) => res.value);

    const result: { items: Transaction[]; nextCursor?: string } = { items };
    const nextCursor = encodeCursor(
      response.LastEvaluatedKey as Record<string, unknown> | undefined,
    );
    if (nextCursor !== undefined) {
      result.nextCursor = nextCursor;
    }
    return result;
  }

  /**
   * Look up a prior transaction by its idempotency record SK.
   * @deprecated Superseded by addIdempotent() which handles replay internally.
   */
  findIdempotentTransactionId(
    _userId: UserId,
    _idempotencyRecordSk: string,
  ): Promise<TransactionId | null> {
    return Promise.resolve(null);
  }

  /**
   * Atomically apply edits to an existing transaction and adjust the wallet
   * balance.
   *
   * The Transaction SK includes `occurredAt` and the GSI1SK includes
   * `categoryId`. When either changes, the item must MOVE (Delete old + Put
   * new) — DynamoDB does not allow Update to mutate keys. When neither
   * changes, a normal Update is fine. We branch on key shape:
   *
   *  - SK unchanged: 2-op TransactWrite (Transaction Update + Wallet Update)
   *  - SK changed:   3-op TransactWrite (Transaction Delete + Transaction Put + Wallet Update)
   */
  async update(input: UpdateTransactionPersistInput): Promise<void> {
    const { transaction, walletBalanceDelta, oldOccurredAt, oldCategoryId: _oldCategoryId } = input;
    void _oldCategoryId; // kept on the interface; categoryId changes do not move the SK (only GSI1SK).

    const pk = userPK(transaction.userId.toString());
    const walletIdStr = transaction.walletId.toString();
    const txIdStr = transaction.id.toString();
    const newOccurredAtIso = transaction.occurredAt.toISOString();
    const oldOccurredAtIso = oldOccurredAt.toISOString();

    // Transaction SK is `TXN#{walletId}#{occurredAt}#{txId}` — depends only on
    // occurredAt. GSI1SK is `CAT#{categoryId}#{occurredAt}#{txId}` — depends on
    // categoryId too, but it's a sibling attribute on the SAME item, so a
    // category change is an attribute Update, not an item move.
    const skMoved = newOccurredAtIso !== oldOccurredAtIso;

    const now = transaction.updatedAt.toISOString();
    const inPlaceUpdate = buildInPlaceUpdate(transaction, oldOccurredAtIso, now);

    if (!skMoved) {
      // 2-op: Update tx in place + Update wallet balance
      await ddb
        .send(
          new TransactWriteCommand({
            TransactItems: [
              {
                Update: {
                  TableName: TABLE_NAME,
                  Key: {
                    PK: pk,
                    SK: transactionSK(walletIdStr, oldOccurredAtIso, txIdStr),
                  },
                  UpdateExpression: inPlaceUpdate.updateExpression,
                  ConditionExpression: 'attribute_exists(PK) AND attribute_not_exists(deletedAt)',
                  ExpressionAttributeValues: inPlaceUpdate.expressionAttributeValues,
                },
              },
              {
                Update: {
                  TableName: TABLE_NAME,
                  Key: { PK: pk, SK: walletSK(walletIdStr) },
                  UpdateExpression: 'SET balance = balance + :delta, updatedAt = :now',
                  ConditionExpression: 'attribute_exists(PK) AND attribute_not_exists(deletedAt)',
                  ExpressionAttributeValues: {
                    ':delta': walletBalanceDelta,
                    ':now': now,
                  },
                },
              },
            ],
          }),
        )
        .catch((e: unknown) => {
          throw mapUpdateCancellation(e, transaction.id);
        });
      return;
    }

    // 3-op: Delete old tx + Put new tx + Update wallet
    const newTxItem = transactionToItem(transaction);

    await ddb
      .send(
        new TransactWriteCommand({
          TransactItems: [
            {
              Delete: {
                TableName: TABLE_NAME,
                Key: {
                  PK: pk,
                  SK: transactionSK(walletIdStr, oldOccurredAtIso, txIdStr),
                },
                ConditionExpression: 'attribute_exists(PK) AND attribute_exists(SK)',
              },
            },
            {
              Put: {
                TableName: TABLE_NAME,
                Item: newTxItem,
                ConditionExpression: 'attribute_not_exists(PK) AND attribute_not_exists(SK)',
              },
            },
            {
              Update: {
                TableName: TABLE_NAME,
                Key: { PK: pk, SK: walletSK(walletIdStr) },
                UpdateExpression: 'SET balance = balance + :delta, updatedAt = :now',
                ConditionExpression: 'attribute_exists(PK) AND attribute_not_exists(deletedAt)',
                ExpressionAttributeValues: {
                  ':delta': walletBalanceDelta,
                  ':now': now,
                },
              },
            },
          ],
        }),
      )
      .catch((e: unknown) => {
        throw mapMovedUpdateCancellation(e, transaction.id);
      });
  }

  /**
   * Idempotent counterpart of `update`. Adds an IdempotencyRecord Put with
   * `attribute_not_exists` as the dedupe lock. Same SK-move branching as
   * `update`, so the operation count is 3 (in-place edit) or 4 (key moved).
   */
  async updateIdempotent(
    input: UpdateIdempotentInput,
  ): Promise<
    Result<{ transaction: Transaction; replay: boolean }, TransactionError | WalletError>
  > {
    const {
      transaction,
      walletId,
      walletBalanceDelta,
      idempotencyHash,
      oldOccurredAt,
      oldCategoryId: _oldCategoryId,
    } = input;
    void _oldCategoryId; // see update() — categoryId never moves the SK.

    const pk = userPK(transaction.userId.toString());
    const walletIdStr = walletId.toString();
    const txIdStr = transaction.id.toString();
    const newOccurredAtIso = transaction.occurredAt.toISOString();
    const oldOccurredAtIso = oldOccurredAt.toISOString();
    const skMoved = newOccurredAtIso !== oldOccurredAtIso;

    const idemSK = idempotencySK(idempotencyHash);
    const now = new Date().toISOString();
    const ttlEpoch = ((Date.now() / 1000) | 0) + 86400;
    const idempotencyItem: IdempotencyRecordItem = {
      PK: pk,
      SK: idemSK,
      entityType: 'IdempotencyRecord',
      transactionId: txIdStr,
      transactionSK: transactionSK(walletIdStr, newOccurredAtIso, txIdStr),
      ttl: ttlEpoch,
      createdAt: now,
    };

    const idempotencyPutOp = {
      Put: {
        TableName: TABLE_NAME,
        Item: idempotencyItem,
        ConditionExpression: 'attribute_not_exists(PK) AND attribute_not_exists(SK)',
      },
    } as const;

    try {
      if (!skMoved) {
        const inPlaceUpdate = buildInPlaceUpdate(transaction, oldOccurredAtIso, now);
        await ddb.send(
          new TransactWriteCommand({
            TransactItems: [
              {
                Update: {
                  TableName: TABLE_NAME,
                  Key: {
                    PK: pk,
                    SK: transactionSK(walletIdStr, oldOccurredAtIso, txIdStr),
                  },
                  UpdateExpression: inPlaceUpdate.updateExpression,
                  ConditionExpression: 'attribute_exists(PK) AND attribute_not_exists(deletedAt)',
                  ExpressionAttributeValues: inPlaceUpdate.expressionAttributeValues,
                },
              },
              {
                Update: {
                  TableName: TABLE_NAME,
                  Key: { PK: pk, SK: walletSK(walletIdStr) },
                  UpdateExpression: 'SET balance = balance + :delta, updatedAt = :now',
                  ConditionExpression: 'attribute_exists(PK) AND attribute_not_exists(deletedAt)',
                  ExpressionAttributeValues: {
                    ':delta': walletBalanceDelta,
                    ':now': now,
                  },
                },
              },
              idempotencyPutOp,
            ],
          }),
        );
      } else {
        const newTxItem = transactionToItem(transaction);
        await ddb.send(
          new TransactWriteCommand({
            TransactItems: [
              {
                Delete: {
                  TableName: TABLE_NAME,
                  Key: {
                    PK: pk,
                    SK: transactionSK(walletIdStr, oldOccurredAtIso, txIdStr),
                  },
                  ConditionExpression: 'attribute_exists(PK) AND attribute_exists(SK)',
                },
              },
              {
                Put: {
                  TableName: TABLE_NAME,
                  Item: newTxItem,
                  ConditionExpression: 'attribute_not_exists(PK) AND attribute_not_exists(SK)',
                },
              },
              {
                Update: {
                  TableName: TABLE_NAME,
                  Key: { PK: pk, SK: walletSK(walletIdStr) },
                  UpdateExpression: 'SET balance = balance + :delta, updatedAt = :now',
                  ConditionExpression: 'attribute_exists(PK) AND attribute_not_exists(deletedAt)',
                  ExpressionAttributeValues: {
                    ':delta': walletBalanceDelta,
                    ':now': now,
                  },
                },
              },
              idempotencyPutOp,
            ],
          }),
        );
      }

      return ok({ transaction, replay: false });
    } catch (e: unknown) {
      if (!isTransactionCanceledException(e)) throw e;
      const reasons = e.CancellationReasons ?? [];
      // The idempotency Put is the LAST item in either branch. If its check
      // fails, this is a replay — read the cached transaction and return it.
      const idempotencyIndex = skMoved ? 3 : 2;
      const idempotencyReason = reasons[idempotencyIndex];
      if (idempotencyReason?.Code === 'ConditionalCheckFailed') {
        const replayed = await this.replayTransaction(pk, idemSK);
        if (replayed === null) {
          throw new Error(`Idempotency replay failed: record expired for hash ${idempotencyHash}`);
        }
        return ok({ transaction: replayed, replay: true });
      }

      // Wallet reason is always the second-to-last item (index 1 for 2-op
      // SK-in-place + idempotency = 3 total; index 2 for 3-op SK-moved + idempotency = 4 total).
      const walletReasonIndex = skMoved ? 2 : 1;
      const walletReason = reasons[walletReasonIndex];
      if (walletReason?.Code === 'ConditionalCheckFailed') {
        return err(new WalletNotFound());
      }

      // Transaction reason: index 0 (the Update/Delete on the tx item).
      const txReason = reasons[0];
      if (txReason?.Code === 'ConditionalCheckFailed') {
        return err(new TransactionNotFound(`Transaction ${txIdStr} not found`));
      }

      // For 3-op path, also check the Put (new SK collision — should not happen).
      if (skMoved && reasons[1]?.Code === 'ConditionalCheckFailed') {
        throw new Error(`Transaction SK collision on move for ${txIdStr} — this is a bug`);
      }

      throw e;
    }
  }

  /**
   * Hard-delete a transaction and reverse its impact on the wallet balance,
   * atomically. Two ops:
   *   [0] Delete the Transaction item (must exist)
   *   [1] Update the Wallet balance (must exist + not soft-deleted)
   */
  async hardDelete(input: HardDeleteInput): Promise<void> {
    const { userId, transactionId, walletId, walletBalanceDelta, occurredAt } = input;
    const pk = userPK(userId.toString());
    const walletIdStr = walletId.toString();
    const txIdStr = transactionId.toString();
    const occurredAtIso = occurredAt.toISOString();
    const now = new Date().toISOString();

    try {
      await ddb.send(
        new TransactWriteCommand({
          TransactItems: [
            {
              Delete: {
                TableName: TABLE_NAME,
                Key: {
                  PK: pk,
                  SK: transactionSK(walletIdStr, occurredAtIso, txIdStr),
                },
                ConditionExpression: 'attribute_exists(PK) AND attribute_exists(SK)',
              },
            },
            {
              Update: {
                TableName: TABLE_NAME,
                Key: { PK: pk, SK: walletSK(walletIdStr) },
                UpdateExpression: 'SET balance = balance + :delta, updatedAt = :now',
                ConditionExpression: 'attribute_exists(PK) AND attribute_not_exists(deletedAt)',
                ExpressionAttributeValues: {
                  ':delta': walletBalanceDelta,
                  ':now': now,
                },
              },
            },
          ],
        }),
      );
    } catch (e: unknown) {
      throw mapDeleteCancellation(e, transactionId);
    }
  }

  async sumExpensesByPeriod(
    userId: UserId,
    filter: { from: Date; to: Date; currency: string; categoryId?: string },
  ): Promise<number> {
    if (filter.categoryId !== undefined) {
      return this.sumExpensesCategory(
        userId,
        filter as { from: Date; to: Date; currency: string; categoryId: string },
      );
    }
    return this.sumExpensesGlobal(userId, filter);
  }

  async summarizeMonthlyByCurrency(
    userId: UserId,
    range: { from: Date; to: Date },
  ): Promise<MonthlyTransactionSummary[]> {
    const pk = userPK(userId.toString());
    const fromIso = range.from.toISOString();
    const toIso = range.to.toISOString();
    const byCurrency = new Map<
      string,
      {
        incomeCents: number;
        expenseCents: number;
        categoryExpenses: Map<string, number>;
      }
    >();

    let lastKey: Record<string, unknown> | undefined;
    do {
      const res = await ddb.send(
        new QueryCommand({
          TableName: TABLE_NAME,
          KeyConditionExpression: 'PK = :pk AND begins_with(SK, :skp)',
          FilterExpression:
            'occurredAt >= :from AND occurredAt <= :to AND attribute_not_exists(deletedAt)',
          ExpressionAttributeValues: {
            ':pk': pk,
            ':skp': 'TXN#',
            ':from': fromIso,
            ':to': toIso,
          },
          ProjectionExpression: '#type, amount, #currency, categoryId, occurredAt, deletedAt',
          ExpressionAttributeNames: { '#type': 'type', '#currency': 'currency' },
          ...(lastKey !== undefined ? { ExclusiveStartKey: lastKey } : {}),
        }),
      );

      for (const raw of res.Items ?? []) {
        const item = raw as Partial<TransactionItem>;
        if (
          typeof item.currency !== 'string' ||
          typeof item.type !== 'string' ||
          typeof item.amount !== 'number'
        ) {
          continue;
        }

        const bucket = byCurrency.get(item.currency) ?? {
          incomeCents: 0,
          expenseCents: 0,
          categoryExpenses: new Map<string, number>(),
        };

        if (item.type === 'income') {
          bucket.incomeCents += item.amount;
        } else if (item.type === 'expense') {
          bucket.expenseCents += item.amount;
          if (typeof item.categoryId === 'string') {
            bucket.categoryExpenses.set(
              item.categoryId,
              (bucket.categoryExpenses.get(item.categoryId) ?? 0) + item.amount,
            );
          }
        }

        byCurrency.set(item.currency, bucket);
      }

      lastKey = res.LastEvaluatedKey as Record<string, unknown> | undefined;
    } while (lastKey !== undefined);

    return Array.from(byCurrency.entries())
      .map(([currency, summary]) => ({
        currency,
        incomeCents: summary.incomeCents,
        expenseCents: summary.expenseCents,
        topExpenseCategories: Array.from(summary.categoryExpenses.entries())
          .map(([categoryId, amountCents]) => ({ categoryId, amountCents }))
          .sort((a, b) => b.amountCents - a.amountCents || a.categoryId.localeCompare(b.categoryId))
          .slice(0, 3),
      }))
      .sort((a, b) => a.currency.localeCompare(b.currency));
  }

  private async sumExpensesCategory(
    userId: UserId,
    filter: { from: Date; to: Date; currency: string; categoryId: string },
  ): Promise<number> {
    const pk = userPK(userId.toString());
    const fromBound = `CAT#${filter.categoryId}#${filter.from.toISOString()}`;
    const toBound = `CAT#${filter.categoryId}#${filter.to.toISOString()}`;

    let total = 0;
    let lastKey: Record<string, unknown> | undefined;

    do {
      const res = await ddb.send(
        new QueryCommand({
          TableName: TABLE_NAME,
          IndexName: GSI1_NAME,
          KeyConditionExpression: 'GSI1PK = :pk AND GSI1SK BETWEEN :from AND :to',
          FilterExpression:
            '#type = :expense AND #currency = :currency AND attribute_not_exists(deletedAt)',
          ExpressionAttributeNames: { '#type': 'type', '#currency': 'currency' },
          ExpressionAttributeValues: {
            ':pk': pk,
            ':from': fromBound,
            ':to': toBound,
            ':expense': 'expense',
            ':currency': filter.currency,
          },
          ...(lastKey !== undefined ? { ExclusiveStartKey: lastKey } : {}),
        }),
      );
      for (const item of res.Items ?? []) {
        total += (item.amount as number) ?? 0;
      }
      lastKey = res.LastEvaluatedKey as Record<string, unknown> | undefined;
    } while (lastKey !== undefined);

    return total;
  }

  private async sumExpensesGlobal(
    userId: UserId,
    filter: { from: Date; to: Date; currency: string },
  ): Promise<number> {
    const pk = userPK(userId.toString());

    let total = 0;
    let lastKey: Record<string, unknown> | undefined;

    do {
      const res = await ddb.send(
        new QueryCommand({
          TableName: TABLE_NAME,
          KeyConditionExpression: 'PK = :pk AND begins_with(SK, :skp)',
          FilterExpression:
            'occurredAt >= :from AND occurredAt < :to AND #type = :expense AND #currency = :currency AND attribute_not_exists(deletedAt)',
          ExpressionAttributeNames: { '#type': 'type', '#currency': 'currency' },
          ExpressionAttributeValues: {
            ':pk': pk,
            ':skp': 'TXN#',
            ':from': filter.from.toISOString(),
            ':to': filter.to.toISOString(),
            ':expense': 'expense',
            ':currency': filter.currency,
          },
          ...(lastKey !== undefined ? { ExclusiveStartKey: lastKey } : {}),
        }),
      );
      for (const item of res.Items ?? []) {
        total += (item.amount as number) ?? 0;
      }
      lastKey = res.LastEvaluatedKey as Record<string, unknown> | undefined;
    } while (lastKey !== undefined);

    return total;
  }
}

// ── Error narrowing helpers ────────────────────────────────────────────────
// These translate TransactWriteItems CancellationReasons into typed domain
// errors. Re-thrown so the use case can catch and return them via Result.

function mapUpdateCancellation(e: unknown, transactionId: TransactionId): Error {
  if (!isTransactionCanceledException(e)) return e instanceof Error ? e : new Error(String(e));
  const reasons = e.CancellationReasons ?? [];
  // 2-op: [0] tx Update, [1] wallet Update
  if (reasons[0]?.Code === 'ConditionalCheckFailed') {
    return new TransactionNotFound(`Transaction ${transactionId.toString()} not found`);
  }
  if (reasons[1]?.Code === 'ConditionalCheckFailed') {
    return new WalletNotFound();
  }
  return e;
}

function mapMovedUpdateCancellation(e: unknown, transactionId: TransactionId): Error {
  if (!isTransactionCanceledException(e)) return e instanceof Error ? e : new Error(String(e));
  const reasons = e.CancellationReasons ?? [];
  // 3-op: [0] tx Delete, [1] tx Put (new SK), [2] wallet Update
  if (reasons[0]?.Code === 'ConditionalCheckFailed') {
    return new TransactionNotFound(`Transaction ${transactionId.toString()} not found`);
  }
  if (reasons[1]?.Code === 'ConditionalCheckFailed') {
    return new Error(
      `Transaction SK collision on move for ${transactionId.toString()} — this is a bug`,
    );
  }
  if (reasons[2]?.Code === 'ConditionalCheckFailed') {
    return new WalletNotFound();
  }
  return e;
}

function mapDeleteCancellation(e: unknown, transactionId: TransactionId): Error {
  if (!isTransactionCanceledException(e)) return e instanceof Error ? e : new Error(String(e));
  const reasons = e.CancellationReasons ?? [];
  // 2-op: [0] tx Delete, [1] wallet Update
  if (reasons[0]?.Code === 'ConditionalCheckFailed') {
    return new TransactionNotFound(`Transaction ${transactionId.toString()} not found`);
  }
  if (reasons[1]?.Code === 'ConditionalCheckFailed') {
    return new WalletNotFound();
  }
  return e;
}

/**
 * Build the UpdateExpression for an in-place transaction edit (when the SK
 * doesn't move). Always rewrites every mutable field plus GSI1SK (which
 * depends on categoryId). Description goes through REMOVE when it transitions
 * to null, otherwise SET — so a "clear description" edit doesn't leave a
 * stale value behind.
 */
function buildInPlaceUpdate(
  transaction: Transaction,
  occurredAtIso: string,
  nowIso: string,
): {
  updateExpression: string;
  expressionAttributeValues: Record<string, unknown>;
} {
  const txIdStr = transaction.id.toString();
  const gsi1sk = transactionGsi1SK(transaction.categoryId, occurredAtIso, txIdStr);

  const setParts = [
    'amount = :amount',
    'categoryId = :categoryId',
    'GSI1SK = :gsi1sk',
    'updatedAt = :now',
  ];
  const removeParts: string[] = [];
  const values: Record<string, unknown> = {
    ':amount': transaction.amount.amount,
    ':categoryId': transaction.categoryId,
    ':gsi1sk': gsi1sk,
    ':now': nowIso,
  };

  if (transaction.description !== null) {
    setParts.push('description = :description');
    values[':description'] = transaction.description;
  } else {
    removeParts.push('description');
  }

  let updateExpression = `SET ${setParts.join(', ')}`;
  if (removeParts.length > 0) {
    updateExpression += ` REMOVE ${removeParts.join(', ')}`;
  }

  return { updateExpression, expressionAttributeValues: values };
}

// Re-export error helpers used by this module so callers don't need
// to import from @smart-wallet/domain directly for error mapping.
export { isTransactionCanceledException };
export type { TransactionCanceledError, CancellationReason };
