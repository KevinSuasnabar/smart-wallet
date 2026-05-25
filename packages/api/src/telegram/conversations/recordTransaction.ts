import type { Conversation } from '@grammyjs/conversations';
import type { BotContext } from '../context.js';
import { container } from '../../composition/container.js';
import { parseAmountForCurrency } from '../../shared/boundary/index.js';
import { PREDEFINED_CATEGORIES } from '@smart-wallet/shared-types';
import { buildWalletKeyboard } from '../keyboards/wallet.js';
import { buildCategoryKeyboard } from '../keyboards/category.js';
import { buildConfirmKeyboard } from '../keyboards/confirm.js';
import { waitForButton } from './helpers.js';

/**
 * Inner conversation context: BotContext so that ctx.userId is available on
 * the trigger message (the /nuevo invocation). grammy/conversations v2 passes
 * the outer context type through to the conversation handler — userResolverMiddleware
 * has already populated ctx.userId by the time the conversation is entered.
 *
 * IMPORTANT: userId MUST be read before the first conversation.wait*() call.
 * On replay, grammy re-runs the conversation function with subsequent messages,
 * so ctx.userId on later replays reflects the current message's resolved user —
 * capturing it upfront ensures it comes from the trigger ctx.
 */
type Conv = Conversation<BotContext, BotContext>;

/**
 * Multi-step conversation factory for recording transactions.
 *
 * When type is provided (expense | income), categories are pre-filtered and type
 * is used directly. When omitted (generic /nuevo flow), all categories are shown
 * and the type is inferred from the selected categoryId prefix.
 *
 * Register as:
 *   createConversation(recordTransaction(), 'recordTransaction:new')
 *
 * CRITICAL: ALL container/IO calls are wrapped in conversation.external() to prevent
 * double-execution on grammy's replay mechanism. Missing wrappers = silent double-write bugs.
 */
export const recordTransaction =
  (type?: 'expense' | 'income') =>
  async (conversation: Conv, ctx: BotContext): Promise<void> => {
    // Capture userId BEFORE the first wait — on grammy replay the ctx changes,
    // but the captured closure value is stable for the entire conversation.
    const userId = ctx.userId;
    console.log('USER ID FROM CONVERSATION', userId);
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
          'Por favor, volvé a iniciar con /nuevo.',
      );
      return;
    }

    const moneyResult = parseAmountForCurrency(amountStr, 'PEN');
    if (!moneyResult.ok) {
      await ctx.reply('❌ Monto inválido (debe ser mayor a cero). Volvé a iniciar con /nuevo.');
      return;
    }

    const money = moneyResult.value;

    // ── Step 2: Wallet Selection ────────────────────────────────────────────
    // Map to plain objects inside external() — class getters (wallet.name, wallet.id.value)
    // are lost when grammy serializes the result to JSON for replay. Plain objects survive.
    const wallets = await conversation.external(async () => {
      const result = await container.listWallets({ userId });
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

    const { data: walletData } = await waitForButton(conversation, /^w:/);
    const walletId = walletData.slice(2);

    // Resolve wallet name for summary display
    const selectedWallet = wallets.find((w) => w.id === walletId);
    const walletName = selectedWallet?.name ?? walletId;

    // ── Step 3: Category Selection ──────────────────────────────────────────
    // When type is known upfront, filter categories. Otherwise show all.
    await ctx.reply('¿Categoría?', {
      reply_markup: buildCategoryKeyboard(type),
    });

    const { data: categoryData } = await waitForButton(conversation, /^c:/);
    const categoryId = categoryData.slice(2);

    // Resolve category name and infer type when not provided upfront
    const selectedCategory = PREDEFINED_CATEGORIES.find((c) => c.categoryId === categoryId);
    const categoryName = selectedCategory?.name ?? categoryId;
    const resolvedType = type ?? selectedCategory?.type ?? 'expense';

    // ── Step 4: Confirmation ────────────────────────────────────────────────
    const typeLabel = resolvedType === 'expense' ? 'Gasto' : 'Ingreso';
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

    const { data: confirmData } = await waitForButton(conversation, /^cf:/);

    if (confirmData !== 'cf:y') {
      await ctx.reply('❌ Operación cancelada.');
      return;
    }

    // ── Confirmed: Write Transaction ────────────────────────────────────────
    const result = await conversation.external(() =>
      container.addTransaction({
        userId,
        walletId,
        type: resolvedType,
        amountCents: money.amount,
        currency: 'PEN',
        categoryId,
        description,
        occurredAt: new Date(),
      }),
    );

    if (!result.ok) {
      await ctx.reply(
        '❌ Error al registrar la transacción. Intentá confirmar de nuevo o reiniciá con /nuevo.',
      );
      return;
    }

    await ctx.reply(
      `✅ ${typeLabel} de S/ ${amountDisplay} registrado en ${walletName} exitosamente.`,
    );
  };
