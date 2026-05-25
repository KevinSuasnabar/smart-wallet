import type { Bot } from "grammy";
import type { BotContext } from "../context.js";
import { container } from "../../composition/container.js";
import { env } from "../../env.js";

const CURRENCY_SYMBOL: Record<string, string> = {
  USD: '$',
  PEN: 'S/',
};

function formatBalance(cents: number, currency: string): string {
  const symbol = CURRENCY_SYMBOL[currency] ?? currency;
  const abs = (Math.abs(cents) / 100).toFixed(2);
  if (cents < 0) return `-${symbol}${abs}`;
  if (cents > 0) return `+${symbol}${abs}`;
  return `${symbol}${abs}`;
}

function balanceEmoji(cents: number): string {
  if (cents > 0) return '🟢';
  if (cents < 0) return '🔴';
  return '⚪';
}

export const registerBalanceCommand = (bot: Bot<BotContext>) => {
  bot.command("balance", async (ctx) => {
    const result = await container.listWallets({ userId: env.botUserId });

    if (!result.ok) {
      await ctx.reply("❌ Error al obtener las wallets.");
      return;
    }

    const { items } = result.value;

    if (items.length === 0) {
      await ctx.reply("No tenés wallets creadas. Creá una desde la web primero.");
      return;
    }

    const lines = items.map((w) => {
      const emoji = balanceEmoji(w.balance);
      const balance = formatBalance(w.balance, w.currency);
      return `${emoji} *${w.name}*: ${balance}`;
    });

    await ctx.reply(`💰 *Tus wallets*\n\n${lines.join('\n')}`, {
      parse_mode: 'Markdown',
    });
  });
};
