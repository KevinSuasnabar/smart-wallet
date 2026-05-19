/* eslint-disable @typescript-eslint/prefer-nullish-coalescing */
import type { Update } from "grammy/types";
import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2, Context } from "aws-lambda";
import { bot } from "../../telegram/bot.js";

// Inicialización lazy: bot.init() se llama UNA vez y se cachea en el
// contexto reusado de Lambda (los módulos se cargan una sola vez).
let initPromise: Promise<void> | null = null;
async function ensureBotInit(): Promise<void> {
  if (!initPromise) {
    initPromise = bot.init();
  }
  await initPromise;
}

/**
 * Lambda handler para webhook de Telegram.
 *
 * NO usa webhookCallback de grammy porque el adapter "aws-lambda" se cuelga.
 * En vez de eso, parsea el Update directo del body y llama a
 * bot.handleUpdate().
 *
 * authMiddleware (dentro de telegram/bot.ts) filtra por MY_TELEGRAM_ID.
 */
export const handler = async (
  event: APIGatewayProxyEventV2,
  context: Context,
): Promise<APIGatewayProxyResultV2> => {
  try {
    context.callbackWaitsForEmptyEventLoop = false;
    console.log("LLEGA A LAMBDA", event);
    if (!event.body) {
      console.warn("[telegram] Webhook recibido sin body");
      return { statusCode: 200, body: JSON.stringify({ ok: false, error: "No body" }) };
    }

    const update = JSON.parse(event.body) as Update;
    console.log("[telegram] Update recibido:", update.update_id);

    // Inicializar el bot si es la primera vez (cacheado en contexto Lambda)
    await ensureBotInit();

    await bot.handleUpdate(update);

    return { statusCode: 200, body: JSON.stringify({ ok: true }) };
  } catch (error) {
    console.error("[telegram] Error en handler:", error);
    return { statusCode: 200, body: JSON.stringify({ ok: false, error: "Internal Server Error" }) };
  }
};
