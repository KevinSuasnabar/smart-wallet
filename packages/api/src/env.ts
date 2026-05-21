/**
 * Centralised environment configuration for the API package.
 * All process.env reads are colocated here — adapters import from this module
 * instead of reading process.env directly.
 */
export const env = {
  isOffline: process.env.IS_OFFLINE === 'true',
  region: process.env.AWS_REGION ?? 'us-east-1',
  tableName: process.env.TABLE_NAME ?? 'smart-wallet-local',
  gsi1Name: process.env.GSI1_NAME ?? 'GSI1',
  dynamoEndpoint: process.env.DYNAMODB_ENDPOINT ?? 'http://localhost:8000',
  telegramToken: process.env.TELEGRAM_TOKEN ?? '',
  myTelegramId: Number(process.env.MY_TELEGRAM_ID) || 0,
  botUserId: process.env.BOT_USER_ID ?? '',
  /** Fallback userId when running offline and no `X-Mock-User-Id` header is provided. */
  localUserId: process.env.LOCAL_USER_ID,
  telegramSessionsTable: process.env.TELEGRAM_SESSIONS_TABLE ?? 'smart-wallet-telegram-sessions-local',
} as const;
