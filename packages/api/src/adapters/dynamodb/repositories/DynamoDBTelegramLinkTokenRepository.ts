import { ConditionalCheckFailedException } from '@aws-sdk/client-dynamodb';
import { DeleteCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import type { TelegramLinkTokenRepository } from '../../../telegram/ports/TelegramLinkTokenRepository.js';
import { ddb, TABLE_NAME } from '../DynamoDBClient.js';
import { userPK, telegramTokenSK } from '../keyBuilders.js';

/**
 * DynamoDB adapter for TelegramLinkTokenRepository.
 *
 * Single-table schema:
 *   PK  USER#<userId>   (S)
 *   SK  TELEGRAMTOKEN   (S)
 *   token               (S) — 32-hex random token
 *   ttl                 (N) — epoch seconds; DynamoDB TTL auto-deletes expired items
 *
 * consume() is atomic: a conditional DeleteCommand reads-then-deletes in one
 * operation. ConditionExpression guards against expired tokens even when DynamoDB
 * TTL has not yet purged the item. Returns true only if the item existed and was
 * not yet expired.
 */
export class DynamoDBTelegramLinkTokenRepository implements TelegramLinkTokenRepository {
  async create(userId: string, token: string, ttlSeconds: number): Promise<void> {
    const ttl = Math.floor(Date.now() / 1000) + ttlSeconds;
    await ddb.send(
      new PutCommand({
        TableName: TABLE_NAME,
        Item: {
          PK: userPK(userId),
          SK: telegramTokenSK(),
          token,
          ttl,
        },
      }),
    );
  }

  async consume(userId: string, token: string): Promise<boolean> {
    try {
      const response = await ddb.send(
        new DeleteCommand({
          TableName: TABLE_NAME,
          Key: {
            PK: userPK(userId),
            SK: telegramTokenSK(),
          },
          ConditionExpression: 'attribute_exists(PK) AND #ttl > :now AND #token = :token',
          ExpressionAttributeNames: {
            '#ttl': 'ttl',
            '#token': 'token',
          },
          ExpressionAttributeValues: {
            ':now': Math.floor(Date.now() / 1000),
            ':token': token,
          },
          ReturnValues: 'ALL_OLD',
        }),
      );

      // If the item was deleted, Attributes will be present
      return response.Attributes !== undefined && response.Attributes !== null;
    } catch (err) {
      if (err instanceof ConditionalCheckFailedException) {
        return false;
      }
      throw err;
    }
  }
}
