import {
  GetCommand,
  PutCommand,
  UpdateCommand,
  QueryCommand,
  TransactWriteCommand,
} from '@aws-sdk/lib-dynamodb';
import { ok, err } from '@smart-wallet/domain';
import type {
  CategoryRepository,
  Category,
  CategoryId,
  ForkPredefinedInput,
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
import {
  userPK,
  categorySK,
  categorySKPrefix,
  transactionSK,
  transactionGsi1SK,
  hiddenPredefinedSK,
  hiddenPredefinedSKPrefix,
} from '../keyBuilders.js';
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

  async update(category: Category): Promise<void> {
    await ddb.send(
      new PutCommand({
        TableName: TABLE_NAME,
        Item: categoryToItem(category),
        ConditionExpression: 'attribute_exists(PK)',
      }),
    );
  }

  async hide(
    userId: UserId,
    predefinedCategoryId: string,
  ): Promise<Result<void, CategoryError>> {
    try {
      await ddb.send(
        new PutCommand({
          TableName: TABLE_NAME,
          Item: {
            PK: userPK(userId.toString()),
            SK: hiddenPredefinedSK(predefinedCategoryId),
            entityType: 'HiddenPredefinedCategory',
            predefinedCategoryId,
            createdAt: new Date().toISOString(),
          },
          ConditionExpression: 'attribute_not_exists(PK)',
        }),
      );
      return ok(undefined);
    } catch (e) {
      if (isConditionalCheckFailedException(e)) {
        // Already hidden — idempotent success
        return ok(undefined);
      }
      throw e;
    }
  }

  async listHiddenPredefined(userId: UserId): Promise<string[]> {
    const ids: string[] = [];
    let cursor: Record<string, unknown> | undefined = undefined;
    do {
      const resp = await ddb.send(
        new QueryCommand({
          TableName: TABLE_NAME,
          KeyConditionExpression: 'PK = :pk AND begins_with(SK, :skp)',
          ExpressionAttributeValues: {
            ':pk': userPK(userId.toString()),
            ':skp': hiddenPredefinedSKPrefix(),
          },
          ProjectionExpression: 'predefinedCategoryId',
          ...(cursor !== undefined ? { ExclusiveStartKey: cursor } : {}),
        }),
      );
      for (const item of resp.Items ?? []) {
        const id: unknown = item.predefinedCategoryId;
        if (typeof id === 'string') ids.push(id);
      }
      cursor = resp.LastEvaluatedKey as Record<string, unknown> | undefined;
    } while (cursor !== undefined);
    return ids;
  }

  /**
   * Chunked TransactWriteItems: writes the new custom + hide marker in the
   * first chunk plus up to 98 transaction migrations; subsequent chunks
   * migrate 100 transactions each. Per-chunk atomic; partial failure between
   * chunks is recoverable on retry (the use case rebuilds a fresh fork
   * attempt with a new UUID).
   *
   * Each transaction migration is a single Update op that rewrites
   * `categoryId` and `GSI1SK` (the transaction's primary key, SK, doesn't
   * include categoryId, so we don't have to move the item).
   */
  async forkPredefined(input: ForkPredefinedInput): Promise<void> {
    const { userId, predefinedCategoryId, newCustom, transactionsToMigrate } = input;
    const pk = userPK(userId.toString());
    const newCustomIdStr = newCustom.id.toString();
    const now = new Date().toISOString();

    const customPutOp = {
      Put: {
        TableName: TABLE_NAME,
        Item: categoryToItem(newCustom),
        ConditionExpression: 'attribute_not_exists(PK)',
      },
    };

    const hidePutOp = {
      Put: {
        TableName: TABLE_NAME,
        Item: {
          PK: pk,
          SK: hiddenPredefinedSK(predefinedCategoryId),
          entityType: 'HiddenPredefinedCategory',
          predefinedCategoryId,
          createdAt: now,
        },
        ConditionExpression: 'attribute_not_exists(PK)',
      },
    };

    // Build per-tx migration Update ops. Each migration:
    //   SET categoryId = :cat, GSI1SK = :gsi, updatedAt = :now
    const buildMigrationOp = (tx: typeof transactionsToMigrate[number]) => {
      const walletIdStr = tx.walletId.toString();
      const txIdStr = tx.id.toString();
      const occurredAtIso = tx.occurredAt.toISOString();
      return {
        Update: {
          TableName: TABLE_NAME,
          Key: {
            PK: pk,
            SK: transactionSK(walletIdStr, occurredAtIso, txIdStr),
          },
          UpdateExpression:
            'SET categoryId = :cat, GSI1SK = :gsi, updatedAt = :now',
          ConditionExpression: 'attribute_exists(PK)',
          ExpressionAttributeValues: {
            ':cat': newCustomIdStr,
            ':gsi': transactionGsi1SK(newCustomIdStr, occurredAtIso, txIdStr),
            ':now': now,
          },
        },
      };
    };

    // First chunk: custom + hide (2 ops) + up to 98 tx migrations = 100 ops
    const FIRST_CHUNK_TX = 98;
    const SUBSEQ_CHUNK_TX = 100;

    const firstChunkTxs = transactionsToMigrate.slice(0, FIRST_CHUNK_TX);
    await ddb.send(
      new TransactWriteCommand({
        TransactItems: [
          customPutOp,
          hidePutOp,
          ...firstChunkTxs.map(buildMigrationOp),
        ],
      }),
    );

    // Subsequent chunks: 100 tx migrations each
    for (let i = FIRST_CHUNK_TX; i < transactionsToMigrate.length; i += SUBSEQ_CHUNK_TX) {
      const chunk = transactionsToMigrate.slice(i, i + SUBSEQ_CHUNK_TX);
      await ddb.send(
        new TransactWriteCommand({
          TransactItems: chunk.map(buildMigrationOp),
        }),
      );
    }
  }
}

function isConditionalCheckFailedException(e: unknown): boolean {
  if (e === null || typeof e !== 'object' || !('name' in e)) return false;
  return (e).name === 'ConditionalCheckFailedException';
}
