import { Bot } from "grammy";
import { env } from "../env.js";
import type { BotContext } from "./context.js";
import { authMiddleware } from "./middleware/auth.js";
import { registerCommands } from "./commands/index.js";

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
export const bot = new Bot<BotContext>(env.telegramToken);

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
