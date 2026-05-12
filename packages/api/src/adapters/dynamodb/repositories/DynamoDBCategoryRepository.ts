import { GetCommand, PutCommand, UpdateCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { ok, err } from '@smart-wallet/domain';
import type {
  CategoryRepository,
  Category,
  CategoryId,
  UserId,
  TransactionType,
  CategoryError,
  Result,
} from '@smart-wallet/domain';
import {
  InvalidCategoryId,
  CategoryAlreadyDeleted,
  CategoryTypeMismatch,
} from '@smart-wallet/domain';
import { ddb, TABLE_NAME } from '../DynamoDBClient.js';
import { userPK, categorySK, categorySKPrefix } from '../keyBuilders.js';
import { categoryToItem, itemToCategory } from '../mappers/CategoryMapper.js';
import type { CategoryItem } from '../mappers/CategoryMapper.js';

export class DynamoDBCategoryRepository implements CategoryRepository {
  async save(category: Category): Promise<void> {
    await ddb.send(
      new PutCommand({
        TableName: TABLE_NAME,
        Item: categoryToItem(category),
      }),
    );
  }

  async findCustomById(
    userId: UserId,
    categoryId: CategoryId,
  ): Promise<Category | null> {
    const response = await ddb.send(
      new GetCommand({
        TableName: TABLE_NAME,
        Key: {
          PK: userPK(userId.toString()),
          SK: categorySK(categoryId.toString()),
        },
      }),
    );

    if (!response.Item) return null;

    const result = itemToCategory(response.Item as CategoryItem);
    return result.ok ? result.value : null;
  }

  async listCustomByUser(userId: UserId): Promise<Category[]> {
    const response = await ddb.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :skp)',
        FilterExpression: 'attribute_not_exists(deletedAt)',
        ExpressionAttributeValues: {
          ':pk': userPK(userId.toString()),
          ':skp': categorySKPrefix(),
        },
      }),
    );

    return (response.Items ?? [])
      .map((raw) => itemToCategory(raw as CategoryItem))
      .filter((res) => res.ok)
      .map((res) => res.value);
  }

  async softDelete(category: Category): Promise<void> {
    if (category.deletedAt === null) return;

    await ddb.send(
      new UpdateCommand({
        TableName: TABLE_NAME,
        Key: {
          PK: userPK(category.userId.toString()),
          SK: categorySK(category.id.toString()),
        },
        UpdateExpression: 'SET deletedAt = :deletedAt, updatedAt = :updatedAt',
        ConditionExpression: 'attribute_exists(PK)',
        ExpressionAttributeValues: {
          ':deletedAt': category.deletedAt.toISOString(),
          ':updatedAt': category.updatedAt.toISOString(),
        },
      }),
    );
  }

  async validateCategoryForTransaction(input: {
    userId: UserId;
    categoryId: CategoryId;
    transactionType: TransactionType;
  }): Promise<Result<void, CategoryError>> {
    const { userId, categoryId, transactionType } = input;

    if (categoryId.kind === 'predefined') {
      // Predefined IDs have format "income:slug" or "expense:slug"
      const id = categoryId.toString();
      if (id.startsWith('income:') && transactionType !== 'income') {
        return err(
          new CategoryTypeMismatch(
            `Predefined income category cannot be used for an expense transaction`,
          ),
        );
      }
      if (id.startsWith('expense:') && transactionType !== 'expense') {
        return err(
          new CategoryTypeMismatch(
            `Predefined expense category cannot be used for an income transaction`,
          ),
        );
      }
      return ok(undefined);
    }

    // Custom category: must exist, be owned by the user, not be soft-deleted,
    // and have the matching type.
    const category = await this.findCustomById(userId, categoryId);

    if (category === null) {
      return err(new InvalidCategoryId(`Custom category not found: ${categoryId.toString()}`));
    }

    if (category.deletedAt !== null) {
      return err(new CategoryAlreadyDeleted());
    }

    if (category.type !== transactionType) {
      return err(
        new CategoryTypeMismatch(
          `Category type "${category.type}" does not match transaction type "${transactionType}"`,
        ),
      );
    }

    return ok(undefined);
  }
}
