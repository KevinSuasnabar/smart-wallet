import {
  DeleteCommand,
  GetCommand,
  QueryCommand,
  TransactWriteCommand,
} from '@aws-sdk/lib-dynamodb';
import type {
  RecurringTransaction,
  RecurringTransactionId,
  RecurringTransactionRepository,
  CreateRecurringPersistInput,
  UpdateRecurringPersistInput,
  MaterializeOneInput,
  TransactionId,
  UserId,
} from '@smart-wallet/domain';
import { ddb, TABLE_NAME, GSI1_NAME } from '../DynamoDBClient.js';
import {
  userPK,
  walletSK,
  recurringSK,
  recurringSKPrefix,
  recurringGsi1SK,
  recurringGsi1SKPrefix,
} from '../keyBuilders.js';
import {
  recurringToItem,
  itemToRecurring,
  type RecurringItem,
} from '../mappers/RecurringMapper.js';
import { transactionToItem } from '../mappers/TransactionMapper.js';
import { Transaction } from '@smart-wallet/domain';
import {
  isTransactionCanceledException,
} from './DynamoDBTransactionRepository.js';

/**
 * Internal sentinel error thrown by `materializeOne` when the optimistic
 * lock on the recurring's `nextOccurrenceAt` is lost (another concurrent
 * request advanced the row). The use case discriminates by `error.name` to
 * avoid coupling the domain to api-package types.
 */
class RecurringRaceLost extends Error {
  override readonly name = 'RecurringRaceLost';
  constructor() {
    super('Recurring transaction race lost');
  }
}

class RecurringWalletGone extends Error {
  override readonly name = 'RecurringWalletNotFound';
  constructor() {
    super('Wallet for recurring is missing or deleted');
  }
}

export class DynamoDBRecurringTransactionRepository
  implements RecurringTransactionRepository
{
  async create(input: CreateRecurringPersistInput): Promise<void> {
    await ddb.send(
      new TransactWriteCommand({
        TransactItems: [
          {
            Put: {
              TableName: TABLE_NAME,
              Item: recurringToItem(input.recurring),
              ConditionExpression:
                'attribute_not_exists(PK) AND attribute_not_exists(SK)',
            },
          },
        ],
      }),
    );
  }

  async findById(
    userId: UserId,
    recurringId: RecurringTransactionId,
  ): Promise<RecurringTransaction | null> {
    const res = await ddb.send(
      new GetCommand({
        TableName: TABLE_NAME,
        Key: {
          PK: userPK(userId.toString()),
          SK: recurringSK(recurringId.toString()),
        },
      }),
    );
    if (res.Item === undefined) return null;
    const parsed = itemToRecurring(res.Item as RecurringItem);
    if (!parsed.ok) return null;
    return parsed.value;
  }

  async listByUser(userId: UserId): Promise<RecurringTransaction[]> {
    const res = await ddb.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :skp)',
        ExpressionAttributeValues: {
          ':pk': userPK(userId.toString()),
          ':skp': recurringSKPrefix(),
        },
      }),
    );
    const items = (res.Items ?? []) as RecurringItem[];
    const out: RecurringTransaction[] = [];
    for (const item of items) {
      const parsed = itemToRecurring(item);
      if (parsed.ok) out.push(parsed.value);
    }
    // Sort ASC by nextOccurrenceAt.
    out.sort(
      (a, b) =>
        a.nextOccurrenceAt.getTime() - b.nextOccurrenceAt.getTime(),
    );
    return out;
  }

  async listPending(
    userId: UserId,
    now: Date,
    limit: number,
  ): Promise<RecurringTransaction[]> {
    const max = recurringGsi1SK(now.toISOString(), '￿');
    const res = await ddb.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        IndexName: GSI1_NAME,
        KeyConditionExpression:
          'GSI1PK = :pk AND GSI1SK BETWEEN :min AND :max',
        ExpressionAttributeValues: {
          ':pk': userPK(userId.toString()),
          ':min': recurringGsi1SKPrefix(),
          ':max': max,
        },
        Limit: limit,
      }),
    );
    const items = (res.Items ?? []) as RecurringItem[];
    const out: RecurringTransaction[] = [];
    for (const item of items) {
      const parsed = itemToRecurring(item);
      if (parsed.ok) out.push(parsed.value);
    }
    return out;
  }

  async update(input: UpdateRecurringPersistInput): Promise<void> {
    // Edits may move nextOccurrenceAt → GSI1SK changes. Easiest correct
    // approach: rewrite the whole item via Put (ConditionExpression: item
    // must already exist, sourced via attribute_exists(PK)).
    await ddb.send(
      new TransactWriteCommand({
        TransactItems: [
          {
            Put: {
              TableName: TABLE_NAME,
              Item: recurringToItem(input.recurring),
              ConditionExpression: 'attribute_exists(PK)',
            },
          },
        ],
      }),
    );
  }

  async hardDelete(input: {
    userId: UserId;
    recurringId: RecurringTransactionId;
  }): Promise<void> {
    await ddb.send(
      new DeleteCommand({
        TableName: TABLE_NAME,
        Key: {
          PK: userPK(input.userId.toString()),
          SK: recurringSK(input.recurringId.toString()),
        },
        ConditionExpression: 'attribute_exists(PK)',
      }),
    );
  }

  async materializeOne(
    input: MaterializeOneInput,
  ): Promise<{ transactionId: TransactionId }> {
    const { recurring, transactionId, nextOccurrenceAt, materializedAt } = input;
    const occurredAt = recurring.nextOccurrenceAt;
    const signedDeltaCents =
      recurring.type === 'income'
        ? recurring.amount.amount
        : -recurring.amount.amount;

    // Build a Transaction aggregate to reuse transactionToItem mapping.
    // Note: we bypass Transaction.create to avoid re-validating occurredAt
    // (it may be > 5y ago for back-fill cases). rehydrate is the right tool.
    const tx = Transaction.rehydrate(transactionId, {
      walletId: recurring.walletId,
      userId: recurring.userId,
      type: recurring.type,
      amount: recurring.amount,
      categoryId: recurring.categoryId,
      description: recurring.description,
      occurredAt,
      createdAt: materializedAt,
      updatedAt: materializedAt,
      deletedAt: null,
    });

    const nextIso = nextOccurrenceAt.toISOString();
    const matIso = materializedAt.toISOString();
    const expectedIso = occurredAt.toISOString();

    try {
      await ddb.send(
        new TransactWriteCommand({
          TransactItems: [
            {
              // [0] Put Transaction — UUID collision guard.
              Put: {
                TableName: TABLE_NAME,
                Item: transactionToItem(tx),
                ConditionExpression:
                  'attribute_not_exists(PK) AND attribute_not_exists(SK)',
              },
            },
            {
              // [1] Update wallet balance — wallet must still exist + not be deleted.
              Update: {
                TableName: TABLE_NAME,
                Key: {
                  PK: userPK(recurring.userId.toString()),
                  SK: walletSK(recurring.walletId.toString()),
                },
                UpdateExpression:
                  'SET balance = balance + :delta, updatedAt = :now',
                ConditionExpression:
                  'attribute_exists(PK) AND attribute_not_exists(deletedAt)',
                ExpressionAttributeValues: {
                  ':delta': signedDeltaCents,
                  ':now': matIso,
                },
              },
            },
            {
              // [2] Advance recurring (optimistic lock on nextOccurrenceAt).
              Update: {
                TableName: TABLE_NAME,
                Key: {
                  PK: userPK(recurring.userId.toString()),
                  SK: recurringSK(recurring.id.toString()),
                },
                UpdateExpression:
                  'SET nextOccurrenceAt = :next, lastMaterializedAt = :now, updatedAt = :now, GSI1SK = :gsi1sk',
                ConditionExpression: 'nextOccurrenceAt = :expected',
                ExpressionAttributeValues: {
                  ':expected': expectedIso,
                  ':next': nextIso,
                  ':now': matIso,
                  ':gsi1sk': recurringGsi1SK(nextIso, recurring.id.toString()),
                },
              },
            },
          ],
        }),
      );
    } catch (e) {
      if (!isTransactionCanceledException(e)) throw e;
      const reasons = e.CancellationReasons ?? [];
      // [2] failed → race lost (the row was already advanced by a concurrent request).
      if (reasons[2]?.Code === 'ConditionalCheckFailed') {
        throw new RecurringRaceLost();
      }
      // [1] failed → wallet missing/deleted.
      if (reasons[1]?.Code === 'ConditionalCheckFailed') {
        throw new RecurringWalletGone();
      }
      // [0] failed → UUID collision on transaction. Very rare; surface as-is.
      throw e;
    }

    return { transactionId };
  }
}
