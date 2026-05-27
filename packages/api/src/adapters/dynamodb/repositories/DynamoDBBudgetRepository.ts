import { DeleteCommand, GetCommand, PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import type { Budget, BudgetId, BudgetRepository, UserId } from '@smart-wallet/domain';
import { ddb, TABLE_NAME } from '../DynamoDBClient.js';
import { userPK, budgetSK, budgetSKPrefix } from '../keyBuilders.js';
import { budgetToItem, itemToBudget } from '../mappers/BudgetMapper.js';
import type { BudgetItem } from '../mappers/BudgetMapper.js';

export class DynamoDBBudgetRepository implements BudgetRepository {
  async save(budget: Budget): Promise<void> {
    await ddb.send(
      new PutCommand({
        TableName: TABLE_NAME,
        Item: budgetToItem(budget),
      }),
    );
  }

  async update(budget: Budget): Promise<void> {
    await ddb.send(
      new PutCommand({
        TableName: TABLE_NAME,
        Item: budgetToItem(budget),
        ConditionExpression: 'attribute_exists(PK)',
      }),
    );
  }

  async findById(userId: UserId, budgetId: BudgetId): Promise<Budget | null> {
    const res = await ddb.send(
      new GetCommand({
        TableName: TABLE_NAME,
        Key: {
          PK: userPK(userId.toString()),
          SK: budgetSK(budgetId.toString()),
        },
      }),
    );
    if (!res.Item) return null;
    return itemToBudget(res.Item as BudgetItem);
  }

  async listByUser(userId: UserId): Promise<Budget[]> {
    const items: Budget[] = [];
    let lastKey: Record<string, unknown> | undefined;

    do {
      const res = await ddb.send(
        new QueryCommand({
          TableName: TABLE_NAME,
          KeyConditionExpression: 'PK = :pk AND begins_with(SK, :skp)',
          ExpressionAttributeValues: {
            ':pk': userPK(userId.toString()),
            ':skp': budgetSKPrefix(),
          },
          ...(lastKey !== undefined ? { ExclusiveStartKey: lastKey } : {}),
        }),
      );
      for (const raw of res.Items ?? []) {
        items.push(itemToBudget(raw as BudgetItem));
      }
      lastKey = res.LastEvaluatedKey as Record<string, unknown> | undefined;
    } while (lastKey !== undefined);

    return items;
  }

  async delete(userId: UserId, budgetId: BudgetId): Promise<void> {
    await ddb.send(
      new DeleteCommand({
        TableName: TABLE_NAME,
        Key: {
          PK: userPK(userId.toString()),
          SK: budgetSK(budgetId.toString()),
        },
      }),
    );
  }
}
