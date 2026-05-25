import type { Context } from 'grammy';
import type { Conversation } from '@grammyjs/conversations';
import type { BotContext } from '../context.js';

/**
 * Waits for a callback query matching pattern and returns the matched data string.
 *
 * Unlike waitForCallbackQuery, this helper loops over all incoming updates so
 * text messages sent while a button is expected receive a contextual reply
 * instead of being silently discarded. answerCallbackQuery is called internally.
 *
 * Generic over the inner context type (IC) so it works whether the conversation
 * uses plain Context or BotContext as its inner ctx type.
 */
export async function waitForButton<IC extends Context>(
  conversation: Conversation<BotContext, IC>,
  pattern: RegExp,
): Promise<{ ctx: IC; data: string }> {
  while (true) {
    const next = await conversation.wait();
    const data = next.callbackQuery?.data;
    if (data !== undefined && pattern.test(data)) {
      await next.answerCallbackQuery();
      return { ctx: next, data };
    }
    if (data !== undefined) {
      // Callback query from a different step — close the spinner with a hint
      await next.answerCallbackQuery('Ese botón ya no corresponde al paso actual.');
    } else if (next.message?.text) {
      await next.reply('Usá los botones para continuar, o /cancel para cancelar.');
    }
  }
}
