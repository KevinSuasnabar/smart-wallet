import { Bot, webhookCallback } from "grammy";
import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";
import { withErrorHandler } from "../../middleware/withErrorHandler.js";
import { env } from "../../env.js";

const bot = new Bot(env.telegramToken);
console.log("Bot initialized token: ", env.telegramToken);

// ... Aquí dejas tus comandos (bot.command("gasto", ...)) ...

const telegramExecute = webhookCallback(bot, "aws-lambda-async");

const _handler = async (
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2> => {
  console.log("Webhook recibido de Telegram:", event.body);

  // Telegram envía el update directamente como body JSON.
  // grammY se encarga de parsearlo y ejecutar los comandos registrados.
  const result = await telegramExecute(event, {});
  console.log("Result test: ", JSON.stringify(result, null, 2));

  return result as unknown as APIGatewayProxyResultV2;
};

// NOTA: Sin withAuth — Telegram webhooks no tienen autenticación de usuario.
// El endpoint es público (protegido por la URL del webhook + token del bot).
export const handler = withErrorHandler(_handler);
