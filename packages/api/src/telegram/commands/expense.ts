import type { Bot } from 'grammy';
import type { BotContext } from '../context.js';

/**
 * /gasto — enters the guided 4-step expense recording conversation.
 *
 * The one-shot argument form (/gasto <monto> <descripción>) has been removed.
 * Arguments are ignored; the interactive flow handles all input collection.
 * This satisfies REQ-COMPAT-01 and REQ-CONV-01.
 */
export const registerGastoCommand = (bot: Bot<BotContext>): void => {
  bot.command('gasto', async (ctx) => {
    await ctx.conversation.enter('recordTransaction:expense');
  });
};
