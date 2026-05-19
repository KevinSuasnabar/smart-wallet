import type { Update } from "grammy/types";
import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2, Context } from "aws-lambda";
import { bot } from "../../telegram/bot.js";

/**
 * Lambda handler para webhook de Telegram.
 *
 * NO usa webhookCallback de grammy porque el adapter "aws-lambda" se cuelga
 * esperando que el callback de Lambda se resuelva de una forma que no
 * podemos garantizar. En vez de eso, parsea el Update directo del body
 * y llama a bot.handleUpdate().
 *
 * Sin withAuth ni withErrorHandler porque:
 * - La auth se maneja dentro de grammy (authMiddleware en telegram/bot.ts)
 * - El error handling es manual con try/catch para poder pasar el context
 */
export const handler = async (
  event: APIGatewayProxyEventV2,
  context: Context,
): Promise<APIGatewayProxyResultV2> => {
  try {
    context.callbackWaitsForEmptyEventLoop = false;

    if (!event.body) {
      console.warn("[telegram] Webhook recibido sin body");
      return { statusCode: 200, body: JSON.stringify({ ok: false, error: "No body" }) };
    }

    const update = JSON.parse(event.body) as Update;
    console.log("[telegram] Update recibido:", update.update_id);

    await bot.handleUpdate(update);
    console.log("HANDLE UPDATE COMPLETED");

    return { statusCode: 200, body: JSON.stringify({ ok: true }) };
  } catch (error) {
    console.error("[telegram] Error en handler:", error);
    return { statusCode: 200, body: JSON.stringify({ ok: false, error: "Internal Server Error" }) };
  }
};
