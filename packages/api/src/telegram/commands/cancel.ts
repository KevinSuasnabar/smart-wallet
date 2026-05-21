import type { Bot } from 'grammy';
import type { BotContext } from '../context.js';

/**
 * /cancel — exits all active conversations and clears their session state.
 * Safe to call at any step; no-op if no conversation is active.
 */
export const registerCancelCommand = (bot: Bot<BotContext>): void => {
  bot.command('cancel', async (ctx) => {
    await ctx.conversation.exitAll();
    await ctx.reply('Operación cancelada.');
  });
};
