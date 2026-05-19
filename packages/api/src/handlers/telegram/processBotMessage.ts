import { Bot, webhookCallback } from "grammy";
import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2, Context } from "aws-lambda"; // 1. Importar los tipos reales

const bot = new Bot(process.env.TELEGRAM_TOKEN || "");

// ... (aquí mantienes tu bot.command sin cambios) ...

const telegramExecute = webhookCallback(bot, "aws-lambda");

// 2. Aplicar los tipos correctos en la firma del handler
export const handler = async (
  event: APIGatewayProxyEventV2,
  context: Context
): Promise<APIGatewayProxyResultV2> => {

  context.callbackWaitsForEmptyEventLoop = false;

  try {
    // 3. grammY espera que 'headers' contenga strings puros, así que hacemos un casteo seguro para ESLint
    const formattedEvent = {
      ...event,
      headers: event.headers as Record<string, string>
    };

    const body = event.body ? JSON.parse(event.body) : null;
    const telegramUserId = body?.message?.from?.id;
    const MY_TELEGRAM_ID = Number(process.env.MY_TELEGRAM_ID);

    if (!telegramUserId || telegramUserId !== MY_TELEGRAM_ID) {
      console.warn(`[WARN] Intento de acceso no autorizado o ID inválido: ${telegramUserId}`);
      return {
        statusCode: 200,
        body: JSON.stringify({ ok: false, error: "Unauthorized" })
      };
    }

    // 4. Ahora sí, pasamos el evento formateado y tipado sin que ESLint llore por un 'any'
    const result = await telegramExecute(formattedEvent, context, async () => Promise.resolve({}));
    return result as unknown as APIGatewayProxyResultV2;

  } catch (error: any) {
    console.error("💥 Error crítico en el handler:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Internal Server Error" }),
    };
  }
};
