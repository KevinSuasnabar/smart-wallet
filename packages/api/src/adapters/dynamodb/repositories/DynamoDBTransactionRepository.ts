import {
  QueryCommand,
  TransactWriteCommand,
} from '@aws-sdk/lib-dynamodb';
import type {
  TransactionRepository,
  AddTransactionPersistInput,
  Transaction,
  TransactionId,
  UserId,
  WalletId,
  ListByWalletFilter,
  ListByCategoryFilter,
} from '@smart-wallet/domain';
import { ddb, TABLE_NAME, GSI1_NAME } from '../DynamoDBClient.js';
import {
  userPK,
  walletSK,
  transactionSKPrefix,
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

// ── Repository ────────────────────────────────────────────────────────────

export class DynamoDBTransactionRepository implements TransactionRepository {
  /**
   * Atomically:
   *  1. Put the new Transaction item (condition: item must NOT already exist).
   *  2. Update the Wallet balance by the signed delta.
   *
   * Slice 11 (PR3) extends this to include a 3rd op for IdempotencyRecord.
   */
  async add(
    input: AddTransactionPersistInput,
  ): Promise<void> {
    const { transaction, walletBalanceDelta } = input;

    await ddb.send(
      new TransactWriteCommand({
        TransactItems: [
          {
            // Leg 1: Insert the transaction — fail if a duplicate is somehow written
            Put: {
              TableName: TABLE_NAME,
              Item: transactionToItem(transaction),
              ConditionExpression: 'attribute_not_exists(PK) AND attribute_not_exists(SK)',
            },
          },
          {
            // Leg 2: Update wallet balance — fail if wallet is missing or soft-deleted
            Update: {
              TableName: TABLE_NAME,
              Key: {
                PK: userPK(transaction.userId.toString()),
                SK: walletSK(transaction.walletId.toString()),
              },
              UpdateExpression: 'SET balance = balance + :delta, updatedAt = :now',
              ConditionExpression:
                'attribute_exists(PK) AND attribute_not_exists(deletedAt)',
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

  async findById(
    userId: UserId,
    transactionId: TransactionId,
  ): Promise<Transaction | null> {
    // The Transaction SK requires walletId + occurredAt which we don't know here.
    // Use a GSI or Query by PK + SK filter. For MVP findById we query PK
    // (user) with a filter on transactionId since we lack the full SK.
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
        Limit: 1,
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
    const nextCursor = encodeCursor(response.LastEvaluatedKey as Record<string, unknown> | undefined);
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
    const nextCursor = encodeCursor(response.LastEvaluatedKey as Record<string, unknown> | undefined);
    if (nextCursor !== undefined) {
      result.nextCursor = nextCursor;
    }
    return result;
  }

  /**
   * Look up a prior transaction by its idempotency record SK.
   * Deferred to Slice 11 (PR3) — always returns null in this slice.
   */
  findIdempotentTransactionId(
    _userId: UserId,
    _idempotencyRecordSk: string,
  ): Promise<TransactionId | null> {
    return Promise.resolve(null);
  }
}

// Re-export error helpers used by this module so callers don't need
// to import from @smart-wallet/domain directly for error mapping.
export { isTransactionCanceledException };
export type { TransactionCanceledError, CancellationReason };
