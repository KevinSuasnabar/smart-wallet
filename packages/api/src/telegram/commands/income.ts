import type { Bot } from "grammy";
import { z } from "zod";
import { container } from "../../composition/container.js";
import { parseAmountForCurrency } from "../../shared/boundary/index.js";
import { env } from "../../env.js";
import type { BotContext } from "../context.js";

const IngresoArgsSchema = z.object({
  amount: z.string().regex(/^\d+(\.\d{1,2})?$/),
  description: z.string().optional(),
});

type IngresoArgs = z.infer<typeof IngresoArgsSchema>;

function parseIngresoArgs(match: string | undefined): IngresoArgs | null {
  if (!match || match.trim().length === 0) return null;

  const parts = match.trim().split(/\s+/);
  const result = IngresoArgsSchema.safeParse({
    amount: parts[0],
    description: parts.slice(1).join(" ") || undefined,
  });

  return result.success ? result.data : null;
}

export const registerIngresoCommand = (bot: Bot<BotContext>) => {
  bot.command("ingreso", async (ctx) => {
    if (!env.botUserId) {
      await ctx.reply("❌ Bot no configurado. Falta BOT_USER_ID.");
      return;
    }

    const args = parseIngresoArgs(ctx.match);
    if (!args) {
      await ctx.reply("❌ Formato: /ingreso <monto> [descripción]\nEj: /ingreso 2000 sueldo");
      return;
    }

    const moneyResult = parseAmountForCurrency(args.amount, "PEN");
    if (!moneyResult.ok) {
      await ctx.reply("❌ Monto inválido. Usá números como 1000 o 1000.50");
      return;
    }

    const money = moneyResult.value;

    // Buscar/crear wallet "Gastos" igual que en expense.ts
    const walletsResult = await container.listWallets({ userId: env.botUserId });
    if (!walletsResult.ok) {
      await ctx.reply("❌ No pude consultar tus wallets.");
      return;
    }

    const gastosWallet = walletsResult.value.items.find(
      (w) => w.name.toLowerCase() === "ingresos",
    );

    if (!gastosWallet) {
      await ctx.reply("❌ No encontré la wallet 'Ingresos'. Creala desde la web o usá /ingreso primero.");
      return;
    }

    const result = await container.addTransaction({
      userId: env.botUserId,
      walletId: gastosWallet.id.value,
      type: "income",
      amountCents: money.amount,
      currency: "PEN",
      categoryId: "income:other",
      description: args.description ?? null,
      occurredAt: new Date(),
    });

    if (!result.ok) {
      await ctx.reply("❌ Error al registrar el ingreso. Intentalo de nuevo.");
      return;
    }

    await ctx.reply(`✅ Ingreso de S/ ${args.amount} registrado en Ingresos`);
  });
};
