import type { Bot } from 'grammy';
import type { BotContext } from '../context.js';

/**
 * /ingreso — enters the guided 4-step income recording conversation.
 *
 * The one-shot argument form (/ingreso <monto> <descripción>) has been removed.
 * Arguments are ignored; the interactive flow handles all input collection.
 * This satisfies REQ-COMPAT-01 and REQ-CONV-01.
 */
export const registerIngresoCommand = (bot: Bot<BotContext>): void => {
  bot.command('ingreso', async (ctx) => {
    await ctx.conversation.enter('recordTransaction:income');
  });
};
