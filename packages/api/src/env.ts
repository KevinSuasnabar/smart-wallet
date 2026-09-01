/**
 * Centralised environment configuration for the API package.
 * All process.env reads are colocated here — adapters import from this module
 * instead of reading process.env directly.
 */
import { isValidTimeZone } from '@smart-wallet/domain';

const DEFAULT_APP_TIMEZONE = 'America/Lima';

/**
 * Resolve the single accounting timezone at module load. `env.ts` is imported
 * by every handler, so an invalid value must NOT throw — that would take the
 * whole API down over an unrelated typo. Invalid/absent/blank logs one error
 * and falls back to `America/Lima` (which is the intended value anyway, so the
 * read/write month invariant still holds).
 */
const resolveAppTimezone = (raw: string | undefined): string => {
  const trimmed = raw?.trim() ?? '';
  if (isValidTimeZone(trimmed)) return trimmed;
  console.error(
    `[env] APP_TIMEZONE ${
      trimmed === ''
        ? 'is unset or blank'
        : `value "${raw ?? ''}" is not a valid IANA time zone`
    }; falling back to "${DEFAULT_APP_TIMEZONE}"`,
  );
  return DEFAULT_APP_TIMEZONE;
};

export const env = {
  isOffline: process.env.IS_OFFLINE === 'true',
  region: process.env.AWS_REGION ?? 'us-east-1',
  tableName: process.env.TABLE_NAME ?? 'smart-wallet-local',
  gsi1Name: process.env.GSI1_NAME ?? 'GSI1',
  dynamoEndpoint: process.env.DYNAMODB_ENDPOINT ?? 'http://localhost:8000',
  telegramToken: process.env.TELEGRAM_TOKEN ?? '',
  telegramWebhookSecret: process.env.TELEGRAM_WEBHOOK_SECRET ?? '',
  myTelegramId: Number(process.env.MY_TELEGRAM_ID) || 0,
  botUserId: process.env.BOT_USER_ID ?? '',
  /** Fallback userId when running offline and no `X-Mock-User-Id` header is provided. */
  localUserId: process.env.LOCAL_USER_ID,
  telegramSessionsTable:
    process.env.TELEGRAM_SESSIONS_TABLE ?? 'smart-wallet-telegram-sessions-local',
  transactionEventsQueueUrl: process.env.TRANSACTION_EVENTS_QUEUE_URL ?? '',
  /** Single configured IANA accounting timezone for all monthly boundaries. */
  appTimezone: resolveAppTimezone(process.env.APP_TIMEZONE),
} as const;
