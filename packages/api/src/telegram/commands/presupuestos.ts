import type { Bot } from 'grammy';
import { PREDEFINED_CATEGORIES } from '@smart-wallet/shared-types';
import type { BotContext } from '../context.js';
import { container } from '../../composition/container.js';

const PREDEFINED_BY_ID: ReadonlyMap<string, string> = new Map(
  PREDEFINED_CATEGORIES.map((c) => [c.categoryId as string, c.name]),
);

const CURRENCY_SYMBOL: Record<string, string> = { USD: '$', PEN: 'S/' };

function formatAmount(cents: number, currency: string): string {
  const symbol = CURRENCY_SYMBOL[currency] ?? currency;
  return `${symbol}${(cents / 100).toFixed(2)}`;
}

function progressBar(pct: number): string {
  const filled = Math.min(Math.round(pct / 10), 10);
  return '▓'.repeat(filled) + '░'.repeat(10 - filled);
}

function statusEmoji(pct: number): string {
  if (pct >= 100) return '🔴';
  if (pct >= 75) return '🟡';
  return '🟢';
}

function resolveLabel(type: string, categoryId: string | undefined): string {
  if (type === 'global' || categoryId === undefined) return 'Global';
  return PREDEFINED_BY_ID.get(categoryId) ?? categoryId.slice(0, 12);
}

export const registerPresupuestosCommand = (bot: Bot<BotContext>): void => {
  bot.command('presupuestos', async (ctx) => {
    const result = await container.listBudgets({ userId: ctx.userId });

    if (!result.ok) {
      await ctx.reply('❌ Error al obtener los presupuestos.');
      return;
    }

    const items = result.value;

    if (items.length === 0) {
      await ctx.reply(
        'No tenés presupuestos configurados. Creá uno desde la web para empezar a hacer seguimiento.',
      );
      return;
    }

    // Group by currency
    const byCurrency = new Map<string, typeof items>();
    for (const item of items) {
      const currency = item.budget.currency;
      const group = byCurrency.get(currency) ?? [];
      group.push(item);
      byCurrency.set(currency, group);
    }

    const sections: string[] = [];

    for (const [currency, budgets] of byCurrency) {
      const lines: string[] = [`💰 *Presupuestos — ${currency}*\n`];

      for (const { budget: b, spentCents, effectiveLimitCents } of budgets) {
        const pct =
          effectiveLimitCents > 0 ? Math.min((spentCents / effectiveLimitCents) * 100, 100) : 0;

        const label = resolveLabel(b.type, b.categoryId);
        const bar = progressBar(pct);
        const emoji = statusEmoji(pct);

        lines.push(
          `${emoji} *${label}*\n` +
            `\`${bar}\` ${Math.round(pct)}%\n` +
            `${formatAmount(spentCents, currency)} gastado de ${formatAmount(effectiveLimitCents, currency)}`,
        );
      }

      sections.push(lines.join('\n'));
    }

    await ctx.reply(sections.join('\n\n'), { parse_mode: 'Markdown' });
  });
};
