import { QueryCommand, TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import type {
  Currency,
  MonthlyDashboardAggregateRepository,
  MonthlyDashboardAggregateSummary,
  UserId,
} from '@smart-wallet/domain';
import { isTransactionCanceledException } from './DynamoDBTransactionRepository.js';
import { ddb, TABLE_NAME } from '../DynamoDBClient.js';
import {
  monthlyAggregateSK,
  monthlyAggregateSKPrefix,
  monthlyCategoryAggregateSK,
  monthlyCategoryAggregateSKPrefix,
  processedEventSK,
  userPK,
} from '../keyBuilders.js';
import type { TransactionEvent, TransactionSnapshot } from '../../../events/transactionEvents.js';

interface MonthlyAggregateItem {
  PK: string;
  SK: string;
  entityType: 'MonthlyAggregate';
  month: string;
  currency: Currency;
  incomeCents?: number;
  expenseCents?: number;
  updatedAt: string;
}

interface MonthlyCategoryAggregateItem {
  PK: string;
  SK: string;
  entityType: 'MonthlyCategoryAggregate';
  month: string;
  currency: Currency;
  categoryId: string;
  amountCents?: number;
  updatedAt: string;
}

interface TotalDelta {
  month: string;
  currency: Currency;
  incomeCents: number;
  expenseCents: number;
}

interface CategoryDelta {
  month: string;
  currency: Currency;
  categoryId: string;
  amountCents: number;
}

export class DynamoDBMonthlyAggregateRepository implements MonthlyDashboardAggregateRepository {
  async applyTransactionEvent(event: TransactionEvent): Promise<void> {
    const nowIso = new Date().toISOString();
    const totalDeltas = new Map<string, TotalDelta>();
    const categoryDeltas = new Map<string, CategoryDelta>();

    if (event.eventType === 'TransactionCreated') {
      addSnapshotDeltas(event.after, 1, totalDeltas, categoryDeltas);
    } else if (event.eventType === 'TransactionDeleted') {
      addSnapshotDeltas(event.before, -1, totalDeltas, categoryDeltas);
    } else {
      addSnapshotDeltas(event.before, -1, totalDeltas, categoryDeltas);
      addSnapshotDeltas(event.after, 1, totalDeltas, categoryDeltas);
    }

    const pk = userPK(event.userId);
    const transactItems = [
      {
        Put: {
          TableName: TABLE_NAME,
          Item: {
            PK: pk,
            SK: processedEventSK(event.eventId),
            entityType: 'ProcessedEvent',
            eventType: event.eventType,
            processedAt: nowIso,
            ttl: Math.floor(Date.now() / 1000) + 14 * 24 * 60 * 60,
          },
          ConditionExpression: 'attribute_not_exists(PK)',
        },
      },
      ...Array.from(totalDeltas.values()).map((delta) => ({
        Update: {
          TableName: TABLE_NAME,
          Key: { PK: pk, SK: monthlyAggregateSK(delta.month, delta.currency) },
          UpdateExpression:
            'SET entityType = if_not_exists(entityType, :entityType), #month = :month, #currency = :currency, updatedAt = :updatedAt ADD incomeCents :incomeCents, expenseCents :expenseCents',
          ExpressionAttributeNames: {
            '#month': 'month',
            '#currency': 'currency',
          },
          ExpressionAttributeValues: {
            ':entityType': 'MonthlyAggregate',
            ':month': delta.month,
            ':currency': delta.currency,
            ':updatedAt': nowIso,
            ':incomeCents': delta.incomeCents,
            ':expenseCents': delta.expenseCents,
          },
        },
      })),
      ...Array.from(categoryDeltas.values()).map((delta) => ({
        Update: {
          TableName: TABLE_NAME,
          Key: {
            PK: pk,
            SK: monthlyCategoryAggregateSK(delta.month, delta.currency, delta.categoryId),
          },
          UpdateExpression:
            'SET entityType = if_not_exists(entityType, :entityType), #month = :month, #currency = :currency, categoryId = :categoryId, updatedAt = :updatedAt ADD amountCents :amountCents',
          ExpressionAttributeNames: {
            '#month': 'month',
            '#currency': 'currency',
          },
          ExpressionAttributeValues: {
            ':entityType': 'MonthlyCategoryAggregate',
            ':month': delta.month,
            ':currency': delta.currency,
            ':categoryId': delta.categoryId,
            ':updatedAt': nowIso,
            ':amountCents': delta.amountCents,
          },
        },
      })),
    ];

    try {
      await ddb.send(new TransactWriteCommand({ TransactItems: transactItems }));
    } catch (e) {
      if (isDuplicateProcessedEvent(e)) return;
      throw e;
    }
  }

  async listMonthlySummaries(
    userId: UserId,
    month: string,
  ): Promise<MonthlyDashboardAggregateSummary[]> {
    const pk = userPK(userId.toString());
    const totalsResponse = await ddb.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :skp)',
        ExpressionAttributeValues: {
          ':pk': pk,
          ':skp': monthlyAggregateSKPrefix(month),
        },
      }),
    );

    const totals = (totalsResponse.Items ?? []) as MonthlyAggregateItem[];
    const summaries: MonthlyDashboardAggregateSummary[] = [];

    for (const total of totals) {
      const categories = await this.listCategoryAggregates(pk, month, total.currency);
      summaries.push({
        currency: total.currency,
        incomeCents: total.incomeCents ?? 0,
        expenseCents: total.expenseCents ?? 0,
        topExpenseCategories: categories
          .filter((item) => (item.amountCents ?? 0) > 0)
          .map((item) => ({
            categoryId: item.categoryId,
            amountCents: item.amountCents ?? 0,
          }))
          .sort((a, b) => b.amountCents - a.amountCents || a.categoryId.localeCompare(b.categoryId))
          .slice(0, 3),
      });
    }

    return summaries.sort((a, b) => a.currency.localeCompare(b.currency));
  }

  private async listCategoryAggregates(
    pk: string,
    month: string,
    currency: Currency,
  ): Promise<MonthlyCategoryAggregateItem[]> {
    const response = await ddb.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :skp)',
        ExpressionAttributeValues: {
          ':pk': pk,
          ':skp': monthlyCategoryAggregateSKPrefix(month, currency),
        },
      }),
    );
    return (response.Items ?? []) as MonthlyCategoryAggregateItem[];
  }
}

const monthFromOccurredAt = (occurredAtIso: string): string => {
  const date = new Date(occurredAtIso);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
};

const addSnapshotDeltas = (
  snapshot: TransactionSnapshot,
  sign: 1 | -1,
  totalDeltas: Map<string, TotalDelta>,
  categoryDeltas: Map<string, CategoryDelta>,
): void => {
  const month = monthFromOccurredAt(snapshot.occurredAt);
  const totalKey = `${month}#${snapshot.currency}`;
  const total = totalDeltas.get(totalKey) ?? {
    month,
    currency: snapshot.currency,
    incomeCents: 0,
    expenseCents: 0,
  };

  if (snapshot.type === 'income') {
    total.incomeCents += sign * snapshot.amountCents;
  } else {
    total.expenseCents += sign * snapshot.amountCents;
    const categoryKey = `${month}#${snapshot.currency}#${snapshot.categoryId}`;
    const category = categoryDeltas.get(categoryKey) ?? {
      month,
      currency: snapshot.currency,
      categoryId: snapshot.categoryId,
      amountCents: 0,
    };
    category.amountCents += sign * snapshot.amountCents;
    categoryDeltas.set(categoryKey, category);
  }

  totalDeltas.set(totalKey, total);
};

const isDuplicateProcessedEvent = (error: unknown): boolean => {
  if (!isTransactionCanceledException(error)) return false;
  return error.CancellationReasons?.[0]?.Code === 'ConditionalCheckFailed';
};
