import type { Bot } from "grammy";
import type { BotContext } from "../context.js";
import { registerGastoCommand } from "./expense.js";
import { registerIngresoCommand } from "./income.js";
import { registerBalanceCommand } from "./balance.js";

/**
 * Registra todos los comandos del bot de Telegram.
 * Se llama desde bot.ts después de crear la instancia del Bot.
 */
export function registerCommands(bot: Bot<BotContext>): void {
  registerGastoCommand(bot);
  registerIngresoCommand(bot);
  registerBalanceCommand(bot);
}
