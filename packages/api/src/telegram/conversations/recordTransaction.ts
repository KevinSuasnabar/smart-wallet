import type { Context } from 'grammy';
import type { Conversation } from '@grammyjs/conversations';
import type { BotContext } from '../context.js';
import { container } from '../../composition/container.js';
import { env } from '../../env.js';
import { parseAmountForCurrency } from '../../shared/boundary/index.js';
import { PREDEFINED_CATEGORIES } from '@smart-wallet/shared-types';
import { buildWalletKeyboard } from '../keyboards/wallet.js';
import { buildCategoryKeyboard } from '../keyboards/category.js';
import { buildConfirmKeyboard } from '../keyboards/confirm.js';

/**
 * Inner conversation context: plain Context (no session/conversation flavor).
 * The outer BotContext (with ConversationFlavor) is for middleware only.
 * Inside conversations, grammy provides the plain ctx.
 */
type InnerCtx = Context;
type Conv = Conversation<BotContext, InnerCtx>;

/**
 * Multi-step conversation factory for recording transactions.
 *
 * Returns a grammy conversation function parameterised by type ('expense' | 'income').
 * Register as:
 *   createConversation(recordTransaction('expense'), 'recordTransaction:expense')
 *   createConversation(recordTransaction('income'),  'recordTransaction:income')
 *
 * CRITICAL: ALL container/IO calls are wrapped in conversation.external() to prevent
 * double-execution on grammy's replay mechanism. Missing wrappers = silent double-write bugs.
 */
export const recordTransaction =
  (type: 'expense' | 'income') =>
  async (conversation: Conv, ctx: InnerCtx): Promise<void> => {
    // ── Step 1: Amount + Description ───────────────────────────────────────
    await ctx.reply(
      '¿Cuánto y descripción? Ejemplo: 50.50 almuerzo\n\n' +
        '(Solo el monto también funciona: 200)',
    );

    const msgCtx = await conversation.waitFor('message:text');
    const text = msgCtx.message.text.trim();

    // Split: first token = amount, rest = description
    const parts = text.split(/\s+/);
    const amountStr = parts[0] ?? '';
    const description = parts.slice(1).join(' ') || null;

    // Validate amount format
    const amountPattern = /^\d+(\.\d{1,2})?$/;
    if (!amountPattern.test(amountStr)) {
      await ctx.reply(
        '❌ Formato de monto inválido. Usá números como 50 o 50.50\n' +
          'Por favor, volvé a iniciar con /gasto o /ingreso.',
      );
      return;
    }

    const moneyResult = parseAmountForCurrency(amountStr, 'PEN');
    if (!moneyResult.ok) {
      await ctx.reply(
        '❌ Monto inválido (debe ser mayor a cero). Volvé a iniciar con /gasto o /ingreso.',
      );
      return;
    }

    const money = moneyResult.value;

    // ── Step 2: Wallet Selection ────────────────────────────────────────────
    // Map to plain objects inside external() — class getters (wallet.name, wallet.id.value)
    // are lost when grammy serializes the result to JSON for replay. Plain objects survive.
    const wallets = await conversation.external(async () => {
      const result = await container.listWallets({ userId: env.botUserId });
      if (!result.ok) return null;
      return result.value.items.map((w) => ({ id: w.id.value, name: w.name }));
    });

    if (wallets === null) {
      await ctx.reply('❌ No pude consultar las billeteras. Intentá de nuevo más tarde.');
      return;
    }

    if (wallets.length === 0) {
      await ctx.reply('❌ No tenés billeteras creadas. Creá una desde la web primero.');
      return;
    }

    await ctx.reply('¿En qué billetera?', {
      reply_markup: buildWalletKeyboard(wallets),
    });

    const walletCtx = await conversation.waitForCallbackQuery(/^w:/);
    await walletCtx.answerCallbackQuery();
    const walletId = walletCtx.callbackQuery.data.slice(2);

    // Resolve wallet name for summary display
    const selectedWallet = wallets.find((w) => w.id === walletId);
    const walletName = selectedWallet?.name ?? walletId;

    // ── Step 3: Category Selection ──────────────────────────────────────────
    await ctx.reply('¿Categoría?', {
      reply_markup: buildCategoryKeyboard(type),
    });

    const catCtx = await conversation.waitForCallbackQuery(/^c:/);
    await catCtx.answerCallbackQuery();
    const categoryId = catCtx.callbackQuery.data.slice(2);

    // Resolve category name for summary display
    const selectedCategory = PREDEFINED_CATEGORIES.find((c) => c.categoryId === categoryId);
    const categoryName = selectedCategory?.name ?? categoryId;

    // ── Step 4: Confirmation ────────────────────────────────────────────────
    const typeLabel = type === 'expense' ? 'Gasto' : 'Ingreso';
    const amountDisplay = (money.amount / 100).toFixed(2);
    const descDisplay = description !== null ? `\n📝 Descripción: ${description}` : '';

    const summary =
      `📋 *Confirmar ${typeLabel}*\n\n` +
      `💰 Monto: S/ ${amountDisplay}${descDisplay}\n` +
      `🏦 Billetera: ${walletName}\n` +
      `🏷️ Categoría: ${categoryName}`;

    await ctx.reply(summary, {
      parse_mode: 'Markdown',
      reply_markup: buildConfirmKeyboard(),
    });

    const confirmCtx = await conversation.waitForCallbackQuery(/^cf:/);
    await confirmCtx.answerCallbackQuery();

    if (confirmCtx.callbackQuery.data !== 'cf:y') {
      await ctx.reply('❌ Operación cancelada.');
      return;
    }

    // ── Confirmed: Write Transaction ────────────────────────────────────────
    const result = await conversation.external(() =>
      container.addTransaction({
        userId: env.botUserId,
        walletId,
        type,
        amountCents: money.amount,
        currency: 'PEN',
        categoryId,
        description,
        occurredAt: new Date(),
      }),
    );

    if (!result.ok) {
      await ctx.reply(
        '❌ Error al registrar la transacción. Intentá confirmar de nuevo o reiniciá con /gasto o /ingreso.',
      );
      return;
    }

    await ctx.reply(
      `✅ ${typeLabel} de S/ ${amountDisplay} registrado en ${walletName} exitosamente.`,
    );
  };
