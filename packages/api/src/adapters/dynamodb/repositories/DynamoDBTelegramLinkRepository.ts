import { GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import type {
  TelegramLink,
  TelegramLinkRepository,
} from '../../../telegram/ports/TelegramLinkRepository.js';
import { ddb, TABLE_NAME } from '../DynamoDBClient.js';
import { telegramLinkPK, telegramLinkSK } from '../keyBuilders.js';

/**
 * DynamoDB adapter for TelegramLinkRepository.
 *
 * Single-table schema:
 *   PK  TELEGRAM#<telegramId>  (S)
 *   SK  LINK                   (S)
 *   userId                     (S) — Cognito / app user ID
 *   linkedAt                   (S) — ISO 8601 timestamp
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

  async save(telegramId: string | number, userId: string): Promise<void> {
    await ddb.send(
      new PutCommand({
        TableName: TABLE_NAME,
        Item: {
          PK: telegramLinkPK(telegramId),
          SK: telegramLinkSK(),
          userId,
          linkedAt: new Date().toISOString(),
        },
      }),
    );
  }
}
