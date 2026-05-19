import { webhookCallback } from "grammy";
import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2, Context } from "aws-lambda";
import { bot } from "../../telegram/bot.js";

// "aws-lambda" + timeout 5s: si ctx.reply() se cuelga, grammy corta
// con "return" en vez de lanzar excepción. El tercer arg es un callback
// que el adapter de Lambda requiere (el tradicional (error, result)).
const telegramExecute = webhookCallback(bot, "aws-lambda", {
  onTimeout: "return",
  timeoutMilliseconds: 5000,
});

/**
 * Lambda handler para webhook de Telegram.
 *
 * Sin withAuth ni withErrorHandler porque:
 * - La auth se maneja dentro de grammy (authMiddleware en telegram/bot.ts)
 * - El error handling es manual con try/catch para poder pasar el context
 *
 * context.callbackWaitsForEmptyEventLoop = false evita que Lambda espere
 * a que el event loop de Node se vacíe antes de responder.
 */
export const handler = async (
  event: APIGatewayProxyEventV2,
  context: Context,
): Promise<APIGatewayProxyResultV2> => {
  try {
    context.callbackWaitsForEmptyEventLoop = false;

    // callback siempre 200 → Telegram no reintenta
    await telegramExecute(event, context, async () => {});

    return { statusCode: 200, body: JSON.stringify({ ok: true }) };
  } catch (error) {
    console.error("[telegram] Error en handler:", error);
    return { statusCode: 200, body: JSON.stringify({ ok: false, error: "Internal Server Error" }) };
  }
};
