import type { NextFunction } from 'grammy';
import { env } from '../../env.js';
import { container } from '../../composition/container.js';
import type { BotContext } from '../context.js';

/**
 * Middleware that resolves the app-level userId from the Telegram link table
 * and attaches it to ctx.userId before any command or conversation handler runs.
 *
 * Resolution order:
 *   1. Look up the Telegram ID in the link table (DynamoDB GetItem).
 *   2. If found → set ctx.userId from the stored link, call next().
 *   3. Whitelist fallback: if the Telegram ID matches MY_TELEGRAM_ID (bot owner),
 *      set ctx.userId to env.botUserId and call next(). This is a temporary escape
 *      hatch for the owner while multi-user linking is being rolled out.
 *   4. Otherwise → reply with an unlinked-account error message and stop.
 *
 * This middleware must be registered AFTER the /start command (which has no link yet)
 * and BEFORE conversations() and all other commands.
 */
export const userResolverMiddleware = async (
  ctx: BotContext,
  next: NextFunction,
): Promise<void> => {
  const telegramId = ctx.from?.id;

  if (!telegramId) {
    await ctx.reply('No se pudo identificar tu usuario de Telegram.');
    return;
  }

  const link = await container.telegramLinkRepo.findByTelegramId(telegramId);

  if (link) {
    ctx.userId = link.userId;
    return next();
  }

  // Whitelist fallback for the bot owner (temporal, while multi-user linking rolls out)
  if (String(telegramId) === String(env.myTelegramId)) {
    ctx.userId = env.botUserId;
    return next();
  }

  await ctx.reply(
    'Tu cuenta de Telegram no está vinculada. ' +
      'Generá un token desde la web y enviá /start <token>.',
  );
};
