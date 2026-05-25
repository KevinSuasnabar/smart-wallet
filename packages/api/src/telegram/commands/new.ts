import type { Bot } from 'grammy';
import type { BotContext } from '../context.js';

/**
 * /nuevo — enters the generic transaction recording conversation.
 * Shows all categories; transaction type is inferred from the selected category.
 */
export const registerNuevoCommand = (bot: Bot<BotContext>): void => {
  bot.command('nuevo', async (ctx) => {
    await ctx.conversation.exitAll();
    await ctx.conversation.enter('recordTransaction:new');
  });
};
