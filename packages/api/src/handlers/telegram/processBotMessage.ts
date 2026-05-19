import { webhookCallback } from "grammy";
import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";
import { withErrorHandler } from "../../middleware/withErrorHandler.js";
import { bot } from "../../telegram/bot.js";

const telegramExecute = webhookCallback(bot, "aws-lambda-async");

/**
 * Lambda handler para webhook de Telegram.
 *
 * Delgado a propósito: toda la lógica (auth, comandos, respuestas)
 * vive en telegram/ vía grammy. Este handler solo:
 *   1. Recibe el evento de API Gateway
 *   2. Se lo pasa a grammy (webhookCallback)
 *   3. Devuelve 200 para que Telegram no reintente
 *
 * NOTA: Sin withAuth — Telegram webhooks no tienen autenticación de usuario.
 * La autorización se maneja internamente vía authMiddleware en telegram/bot.ts.
 * El endpoint es público (protegido por la URL secreta + token del bot).
 */
const _handler = async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> => {
  await telegramExecute(event, {});
  return { statusCode: 200, body: JSON.stringify({ ok: true }) };
};

export const handler = withErrorHandler(_handler);
