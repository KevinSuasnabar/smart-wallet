import { GetCommand, TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import type {
  TelegramLink,
  TelegramLinkRepository,
  TelegramUserLink,
} from '../../../telegram/ports/TelegramLinkRepository.js';
import { ddb, TABLE_NAME } from '../DynamoDBClient.js';
import { userPK, telegramLinkPK, telegramLinkSK, telegramReverseLinkSK } from '../keyBuilders.js';

/**
 * DynamoDB adapter for TelegramLinkRepository.
 *
 * Single-table schema (two items written atomically on link):
 *   PK  TELEGRAM#<telegramId>  SK  LINK         → forward:  telegramId → userId
 *   PK  USER#<userId>          SK  TELEGRAMLINK  → reverse:  userId → telegramId
 *
 * No TTL — link items are permanent until explicitly removed.
 */
export class DynamoDBTelegramLinkRepository implements TelegramLinkRepository {
  async findByTelegramId(telegramId: string | number): Promise<TelegramLink | null> {
    const response = await ddb.send(
      new GetCommand({
        TableName: TABLE_NAME,
        Key: {
          PK: telegramLinkPK(telegramId),
          SK: telegramLinkSK(),
        },
      }),
    );

    if (!response.Item) return null;

    const { userId, linkedAt } = response.Item as { userId: string; linkedAt: string };
    return { userId, linkedAt };
  }

  async findByUserId(userId: string): Promise<TelegramUserLink | null> {
    const response = await ddb.send(
      new GetCommand({
        TableName: TABLE_NAME,
        Key: {
          PK: userPK(userId),
          SK: telegramReverseLinkSK(),
        },
      }),
    );

    if (!response.Item) return null;

    const { telegramId, linkedAt } = response.Item as { telegramId: string; linkedAt: string };
    return { telegramId, linkedAt };
  }

  async save(telegramId: string | number, userId: string): Promise<void> {
    const linkedAt = new Date().toISOString();
    const telegramIdStr = String(telegramId);

    console.log(
      `[TelegramLinkRepo] save telegramId=${telegramIdStr} userId=${userId} table=${TABLE_NAME}`,
    );

    await ddb.send(
      new TransactWriteCommand({
        TransactItems: [
          {
            Put: {
              TableName: TABLE_NAME,
              Item: {
                PK: telegramLinkPK(telegramId),
                SK: telegramLinkSK(),
                userId,
                linkedAt,
              },
            },
          },
          {
            Put: {
              TableName: TABLE_NAME,
              Item: {
                PK: userPK(userId),
                SK: telegramReverseLinkSK(),
                telegramId: telegramIdStr,
                linkedAt,
              },
            },
          },
        ],
      }),
    );

    console.log(`[TelegramLinkRepo] save OK`);
  }
}
