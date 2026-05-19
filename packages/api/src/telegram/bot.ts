import { Bot } from "grammy";
import { env } from "../env.js";
import type { BotContext } from "./context.js";
import { authMiddleware } from "./middleware/auth.js";
import { registerCommands } from "./commands/index.js";

// Extraer el ID numérico de forma automática a partir de tu variable env.telegramToken
const getBotIdFromToken = (token: string): number => {
  console.log("TOKEN TO GET BOT ID", token);
  const botIdStr = token.split(":");
  const parsedId = Number(botIdStr);
  console.log("PARSED ID", parsedId);
  return isNaN(parsedId) ? 0 : parsedId;
};

/**
 * Singleton del Bot de Telegram.
 *
 * Creado a nivel de módulo (cold start de Lambda), igual que los adapters
 * en container.ts. Las conexiones se reusan en invocaciones warm.
 *
 * Middleware chain (orden de ejecución):
 *   1. authMiddleware — filtra por MY_TELEGRAM_ID
 *   2. Comandos registrados (gasto, ingreso, balance, ...)
 *   3. Handler por defecto (mensaje no reconocido)
 *
 * NOTA: el orden de registro importa. Los comandos se evalúan en orden
 * y el primero que matchea se ejecuta. El handler por defecto se registra
 * al final con `bot.on("message:text", ...)`.
 */
export const bot = new Bot<BotContext>(env.telegramToken, {
  botInfo: {
    id: getBotIdFromToken(env.telegramToken),
    is_bot: true,
    first_name: "Mi Guardián Financiero",
    username: "my_finanzas_personal_bot",
    can_join_groups: true,
    can_read_all_group_messages: false,
    supports_inline_queries: false,
    can_connect_to_business: false,
    has_main_web_app: false,
    can_manage_bots: false,
    has_topics_enabled: false,
    allows_users_to_create_topics: false
  }
});

// ── Middleware global (se ejecuta en CADA update) ──────────────────────
bot.use(authMiddleware);

// ── Comandos ───────────────────────────────────────────────────────────
registerCommands(bot);

// ── Respuesta por defecto ─────────────────────────────────────────────
bot.on("message:text", async (ctx) => {
  await ctx.reply(
    "No reconozco ese comando 📋\n\n" +
      "Comandos disponibles:\n" +
      "  /gasto <monto> <categoria> [descripción]\n" +
      "  /ingreso <monto> <categoria> [descripción]\n" +
      "  /balance",
  );
});
