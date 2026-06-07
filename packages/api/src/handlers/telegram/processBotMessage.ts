import { timingSafeEqual } from 'node:crypto';
import type { Update } from 'grammy/types';
import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2, Context } from 'aws-lambda';
import { env } from '../../env.js';
import { bot } from '../../telegram/bot.js';

const TELEGRAM_SECRET_HEADER = 'x-telegram-bot-api-secret-token';
const TELEGRAM_SECRET_HEADER_CANONICAL = 'X-Telegram-Bot-Api-Secret-Token';

/**
 * Lambda handler para webhook de Telegram.
 *
 * NO usa webhookCallback de grammy porque el adapter aws-lambda se cuelga.
 * En vez de eso, parsea el Update directo del body y llama a bot.handleUpdate().
 *
 * El endpoint queda publico para Telegram, pero en produccion se valida
 * X-Telegram-Bot-Api-Secret-Token antes de procesar el update. Luego
 * userResolverMiddleware resuelve el usuario de la app desde el Telegram ID.
 */
export const handler = async (
  event: APIGatewayProxyEventV2,
  context: Context,
): Promise<APIGatewayProxyResultV2> => {
  try {
    context.callbackWaitsForEmptyEventLoop = false;

    const secretValidation = validateTelegramWebhookSecret(event);
    if (!secretValidation.ok) return secretValidation.response;

    if (!event.body) {
      console.warn('[telegram] Webhook recibido sin body');
      return { statusCode: 200, body: JSON.stringify({ ok: false, error: 'No body' }) };
    }

    const update = JSON.parse(event.body) as Update;
    console.log('[telegram] Update recibido:', update.update_id);

    await bot.handleUpdate(update);

    return { statusCode: 200, body: JSON.stringify({ ok: true }) };
  } catch (error) {
    console.error('[telegram] Error en handler:', error);
    return { statusCode: 200, body: JSON.stringify({ ok: false, error: 'Internal Server Error' }) };
  }
};

const validateTelegramWebhookSecret = (
  event: APIGatewayProxyEventV2,
): { ok: true } | { ok: false; response: APIGatewayProxyResultV2 } => {
  const configuredSecret = env.telegramWebhookSecret;
  const shouldValidate = !env.isOffline || configuredSecret.length > 0;

  if (!shouldValidate) return { ok: true };

  if (configuredSecret.length === 0) {
    console.error('[telegram] TELEGRAM_WEBHOOK_SECRET is required outside offline mode');
    return { ok: false, response: forbidden() };
  }

  const receivedSecret =
    event.headers?.[TELEGRAM_SECRET_HEADER] ?? event.headers?.[TELEGRAM_SECRET_HEADER_CANONICAL];

  if (typeof receivedSecret !== 'string' || receivedSecret.length === 0) {
    console.warn('[telegram] Webhook rejected: missing Telegram secret header');
    return { ok: false, response: unauthorized() };
  }

  if (!safeEqual(receivedSecret, configuredSecret)) {
    console.warn('[telegram] Webhook rejected: invalid Telegram secret header');
    return { ok: false, response: forbidden() };
  }

  return { ok: true };
};

const safeEqual = (a: string, b: string): boolean => {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
};

const unauthorized = (): APIGatewayProxyResultV2 => ({
  statusCode: 401,
  body: JSON.stringify({ ok: false, error: 'Unauthorized' }),
});

const forbidden = (): APIGatewayProxyResultV2 => ({
  statusCode: 403,
  body: JSON.stringify({ ok: false, error: 'Forbidden' }),
});
