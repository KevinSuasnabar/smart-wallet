import { DeleteCommand, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import type { TelegramSessionRepository } from '../../../telegram/ports/TelegramSessionRepository.js';
import { ddb } from '../DynamoDBClient.js';
import { env } from '../../../env.js';

/** TTL duration for session items: 10 minutes (600 seconds). */
const SESSION_TTL_SECONDS = 600;

/**
 * DynamoDB adapter for TelegramSessionRepository.
 *
 * Table schema:
 *   PK  chatId  (S) — Telegram chat ID as string
 *   value       (S) — opaque JSON blob from grammy
 *   ttl         (N) — epoch seconds; DynamoDB TTL auto-deletes after 10 min
 *
 * Uses the shared `ddb` DynamoDBDocumentClient from DynamoDBClient.ts.
 * Table name is resolved from env.telegramSessionsTable.
 */
export class DynamoDBTelegramSessionRepository implements TelegramSessionRepository {
  async read(chatId: string): Promise<string | undefined> {
    const response = await ddb.send(
      new GetCommand({
        TableName: env.telegramSessionsTable,
        Key: { chatId },
      }),
    );
    const value = response.Item?.['value'];
    return typeof value === 'string' ? value : undefined;
  }

  async write(chatId: string, value: string): Promise<void> {
    const ttl = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;
    await ddb.send(
      new PutCommand({
        TableName: env.telegramSessionsTable,
        Item: { chatId, value, ttl },
      }),
    );
  }

  async delete(chatId: string): Promise<void> {
    await ddb.send(
      new DeleteCommand({
        TableName: env.telegramSessionsTable,
        Key: { chatId },
      }),
    );
  }
}
