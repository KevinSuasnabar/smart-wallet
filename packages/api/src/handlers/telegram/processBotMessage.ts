import { Bot, webhookCallback } from "grammy";
import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";
import { withErrorHandler } from "../../middleware/withErrorHandler.js";
import { env } from "../../env.js";

const bot = new Bot(env.telegramToken);

// ==========================================
// 1. PROCESO DE FINANZAS
// ==========================================
bot.command("gasto", async (ctx) => {
  await ctx.reply("Gasto registrado");
});

bot.command("balance", async (ctx) => {
  await ctx.reply("Tu balance actual es...");
});

// ==========================================
// 2. PROCESO DE PELÍCULAS
// ==========================================
bot.command("buscar_peli", async (ctx) => {
  const peli = ctx.match;
  await ctx.reply(`Buscando y descargando: ${peli}`);
});

// ==========================================
// 3. RESPUESTA POR DEFECTO
// ==========================================
bot.on("message:text", async (ctx) => {
  await ctx.reply("No entiendo ese comando. Intenta con /gasto o /buscar_peli");
});

// ==========================================
// HANDLER
// ==========================================
const telegramExecute = webhookCallback(bot, "aws-lambda-async");

const _handler = async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> => {
  const body = event.body ? JSON.parse(event.body) : null;
  const telegramUserId = body?.message?.from?.id ?? null;

  if (telegramUserId !== env.myTelegramId) {
    console.log("Acceso no autorizado de ID:", telegramUserId);
    return { statusCode: 200, body: JSON.stringify({ ok: false, error: "Unauthorized" }) };
  }

  // grammy "aws-lambda-async" maneja el webhook internamente y devuelve void
  await telegramExecute(event, {});

  // Respondemos 200 para que Telegram no reintente
  return { statusCode: 200, body: JSON.stringify({ ok: true }) };
};

export const handler = withErrorHandler(_handler);
