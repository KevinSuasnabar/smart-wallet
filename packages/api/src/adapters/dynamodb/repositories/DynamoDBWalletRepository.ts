import {
  GetCommand,
  PutCommand,
  QueryCommand,
  TransactWriteCommand,
} from '@aws-sdk/lib-dynamodb';
import type { WalletRepository, Wallet, UserId, WalletId } from '@smart-wallet/domain';
import { ddb, TABLE_NAME } from '../DynamoDBClient.js';
import { userPK, walletSK, walletSKPrefix, transactionSKPrefix } from '../keyBuilders.js';
import { encodeCursor, decodeCursor } from '../cursor.js';
import { walletToItem, itemToWallet } from '../mappers/WalletMapper.js';
import type { WalletItem } from '../mappers/WalletMapper.js';

/** Per the AWS docs: max 100 ops per TransactWriteItems. We reserve 1 slot for
 *  the wallet Delete in the final chunk and use the remaining 99 for tx deletes. */
const TX_CHUNK_SIZE = 99;

export class DynamoDBWalletRepository implements WalletRepository {
  async save(wallet: Wallet): Promise<void> {
    await ddb.send(
      new PutCommand({
        TableName: TABLE_NAME,
        Item: walletToItem(wallet),
      }),
    );
  }

  async update(wallet: Wallet): Promise<void> {
    await ddb.send(
      new PutCommand({
        TableName: TABLE_NAME,
        Item: walletToItem(wallet),
        ConditionExpression: 'attribute_exists(PK)',
      }),
    );
  }

  /**
   * Cascade hard delete: every TXN# item belonging to the wallet, plus the
   * wallet item itself. Implemented via paginated Query + chunked
   * TransactWriteItems. Chunks of up to 99 tx deletes; the final chunk also
   * includes the wallet Delete with a ConditionExpression so a concurrent
   * removal surfaces as ConditionalCheckFailed.
   */
  async hardDeleteWithTransactions(
    userId: UserId,
    walletId: WalletId,
  ): Promise<void> {
    const pk = userPK(userId.toString());
    const skPrefix = transactionSKPrefix(walletId.toString());
    const walletKeyArgs = {
      PK: pk,
      SK: walletSK(walletId.toString()),
    };

    // 1. Paginated Query for all tx SKs (project only the SK for bandwidth)
    const txSKs: string[] = [];
    let cursor: Record<string, unknown> | undefined = undefined;
    do {
      const resp = await ddb.send(
        new QueryCommand({
          TableName: TABLE_NAME,
          KeyConditionExpression: 'PK = :pk AND begins_with(SK, :skp)',
          ExpressionAttributeValues: { ':pk': pk, ':skp': skPrefix },
          ProjectionExpression: 'SK',
          ...(cursor !== undefined ? { ExclusiveStartKey: cursor } : {}),
        }),
      );
      for (const item of resp.Items ?? []) {
        const sk = item.SK;
        if (typeof sk === 'string') txSKs.push(sk);
      }
      cursor = resp.LastEvaluatedKey as Record<string, unknown> | undefined;
    } while (cursor !== undefined);

    // 2. Empty-wallet case: single delete op
    if (txSKs.length === 0) {
      await ddb.send(
        new TransactWriteCommand({
          TransactItems: [
            {
              Delete: {
                TableName: TABLE_NAME,
                Key: walletKeyArgs,
                ConditionExpression: 'attribute_exists(PK)',
              },
            },
          ],
        }),
      );
      return;
    }

    // 3. Chunked cascade
    for (let i = 0; i < txSKs.length; i += TX_CHUNK_SIZE) {
      const chunk = txSKs.slice(i, i + TX_CHUNK_SIZE);
      const isLastChunk = i + TX_CHUNK_SIZE >= txSKs.length;

      const items: Array<{
        Delete: {
          TableName: string;
          Key: Record<string, unknown>;
          ConditionExpression?: string;
        };
      }> = chunk.map((sk) => ({
        Delete: {
          TableName: TABLE_NAME,
          Key: { PK: pk, SK: sk },
        },
      }));

      if (isLastChunk) {
        items.push({
          Delete: {
            TableName: TABLE_NAME,
            Key: walletKeyArgs,
            ConditionExpression: 'attribute_exists(PK)',
          },
        });
      }

      await ddb.send(new TransactWriteCommand({ TransactItems: items }));
    }
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
