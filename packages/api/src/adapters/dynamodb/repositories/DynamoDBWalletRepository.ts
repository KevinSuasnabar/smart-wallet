import { GetCommand, PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import type { WalletRepository, Wallet, UserId, WalletId } from '@smart-wallet/domain';
import { ddb, TABLE_NAME } from '../DynamoDBClient.js';
import { userPK, walletSK, walletSKPrefix } from '../keyBuilders.js';
import { encodeCursor, decodeCursor } from '../cursor.js';
import { walletToItem, itemToWallet } from '../mappers/WalletMapper.js';
import type { WalletItem } from '../mappers/WalletMapper.js';

export class DynamoDBWalletRepository implements WalletRepository {
  async save(wallet: Wallet): Promise<void> {
    await ddb.send(
      new PutCommand({
        TableName: TABLE_NAME,
        Item: walletToItem(wallet),
      }),
    );
  }

  async findById(userId: UserId, walletId: WalletId): Promise<Wallet | null> {
    const response = await ddb.send(
      new GetCommand({
        TableName: TABLE_NAME,
        Key: {
          PK: userPK(userId.toString()),
          SK: walletSK(walletId.toString()),
        },
      }),
    );

    if (!response.Item) return null;

    const item = response.Item as WalletItem;

    // Soft-deleted wallets are invisible to default queries
    if (item.deletedAt !== undefined) return null;

    const result = itemToWallet(item);
    return result.ok ? result.value : null;
  }

  async listByUser(
    userId: UserId,
    options: { limit: number; cursor?: string },
  ): Promise<{ items: Wallet[]; nextCursor?: string }> {
    const response = await ddb.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :skp)',
        ExpressionAttributeValues: {
          ':pk': userPK(userId.toString()),
          ':skp': walletSKPrefix(),
        },
        FilterExpression: 'attribute_not_exists(deletedAt)',
        Limit: options.limit,
        ExclusiveStartKey: decodeCursor(options.cursor),
      }),
    );

    const items = (response.Items ?? [])
      .map((raw) => itemToWallet(raw as WalletItem))
      .filter((res) => res.ok)
      .map((res) => res.value);

    const result: { items: Wallet[]; nextCursor?: string } = { items };
    const nextCursor = encodeCursor(response.LastEvaluatedKey as Record<string, unknown> | undefined);
    if (nextCursor !== undefined) {
      result.nextCursor = nextCursor;
    }
    return result;
  }
}
