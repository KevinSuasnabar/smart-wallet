import type { Bot } from 'grammy';
import type { BotContext } from '../context.js';
import { registerNuevoCommand } from './new.js';
import { registerBalanceCommand } from './balance.js';
import { registerCancelCommand } from './cancel.js';
import { registerPresupuestosCommand } from './presupuestos.js';

// NOTE: registerStartCommand is intentionally NOT included here.
// /start must be registered BEFORE userResolverMiddleware in bot.ts because
// users sending /start <token> are not yet linked and the middleware would reject them.
// It is wired directly in bot.ts at the top of the middleware chain.
export { registerStartCommand } from './start.js';

/**
 * Registra todos los comandos del bot de Telegram que requieren ctx.userId.
 * Se llama desde bot.ts DESPUÉS de userResolverMiddleware.
 *
 * /start es la excepción — se registra en bot.ts antes del middleware de resolución.
 */
export function registerCommands(bot: Bot<BotContext>): void {
  registerCancelCommand(bot);
  registerNuevoCommand(bot);
  registerBalanceCommand(bot);
  registerPresupuestosCommand(bot);
}
