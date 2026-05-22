import type { Context } from 'grammy';
import type { Conversation } from '@grammyjs/conversations';
import type { BotContext } from '../context.js';

type InnerCtx = Context;
type Conv = Conversation<BotContext, InnerCtx>;

/**
 * Waits for a callback query matching pattern and returns the matched data string.
 *
 * Unlike waitForCallbackQuery, this helper loops over all incoming updates so
 * text messages sent while a button is expected receive a contextual reply
 * instead of being silently discarded. answerCallbackQuery is called internally.
 */
export async function waitForButton(
  conversation: Conv,
  pattern: RegExp,
): Promise<{ ctx: InnerCtx; data: string }> {
  while (true) {
    const next = await conversation.wait();
    const data = next.callbackQuery?.data;
    if (data !== undefined && pattern.test(data)) {
      await next.answerCallbackQuery();
      return { ctx: next, data };
    }
    if (next.message?.text) {
      await next.reply('Usá los botones para continuar, o /cancel para cancelar.');
    }
  }
}
