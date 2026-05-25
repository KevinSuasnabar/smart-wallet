import type { Bot } from 'grammy';
import type { BotContext } from '../context.js';
import { container } from '../../composition/container.js';

/**
 * /start <token> — links a Telegram account to an app user.
 *
 * Flow:
 *   1. Parse the deep-link payload (token) from ctx.match.
 *   2. Validate format: <userId>.<32-hex>
 *   3. Call telegramLinkTokenRepo.consume(userId, token) — atomic read-and-delete.
 *   4. If consume returns false → token is invalid or expired.
 *   5. If consume returns true → save the Telegram→userId link.
 *   6. Reply with success.
 *
 * This command MUST be registered BEFORE userResolverMiddleware in bot.ts because
 * users sending /start <token> are not yet linked — the middleware would reject them.
 *
 * Token format: <userId>.<32-hex>
 * Example: abc123.a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4
 */
export const registerStartCommand = (bot: Bot<BotContext>): void => {
  bot.command('start', async (ctx) => {
    const payload = ctx.match?.trim() ?? '';

    if (!payload) {
      await ctx.reply(
        '¡Hola! Para vincular tu cuenta de Telegram, ' +
          'generá un token desde la web y reenviá el enlace que te damos.',
      );
      return;
    }

    // Validate token format: <userId>.<32-hex>
    const dotIndex = payload.lastIndexOf('.');
    if (dotIndex === -1) {
      await ctx.reply('Token inválido. Generá un nuevo enlace desde la web.');
      return;
    }

    const userId = payload.slice(0, dotIndex);
    const token = payload.slice(dotIndex + 1);

    const hexPattern = /^[0-9a-f]{32}$/i;
    if (!userId || !hexPattern.test(token)) {
      await ctx.reply('Token inválido. Generá un nuevo enlace desde la web.');
      return;
    }

    const telegramId = ctx.from?.id;
    if (!telegramId) {
      await ctx.reply('No se pudo identificar tu usuario de Telegram.');
      return;
    }

    console.log(`[start] linking attempt telegramId=${telegramId} userId=${userId}`);

    // Atomic consume: validates token exists, is not expired, and matches userId
    const consumed = await container.telegramLinkTokenRepo.consume(userId, payload);

    if (!consumed) {
      console.warn(`[start] consume failed — token invalid or expired userId=${userId}`);
      await ctx.reply('Token inválido o expirado. Generá un nuevo enlace desde la web.');
      return;
    }

    console.log(`[start] token consumed — saving link telegramId=${telegramId} userId=${userId}`);

    // Persist the Telegram → userId association
    await container.telegramLinkRepo.save(telegramId, userId);

    console.log(`[start] link saved successfully telegramId=${telegramId} userId=${userId}`);

    await ctx.reply(
      '✅ Cuenta vinculada correctamente. ' +
        'Ya podés usar /nuevo para registrar transacciones y /balance para ver tus billeteras.',
    );
  });
};
