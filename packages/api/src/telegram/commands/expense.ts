import type { Bot } from "grammy";
import { z } from "zod";
import { container } from "../../composition/container.js";
import { parseAmountForCurrency } from "../../shared/boundary/index.js";
import { env } from "../../env.js";
import type { BotContext } from "../context.js";

const GastoArgsSchema = z.object({
  amount: z.string().regex(/^\d+(\.\d{1,2})?$/),
  description: z.string().optional(),
});

type GastoArgs = z.infer<typeof GastoArgsSchema>;

function parseGastoArgs(match: string | undefined): GastoArgs | null {
  if (!match || match.trim().length === 0) return null;

  const parts = match.trim().split(/\s+/);
  const result = GastoArgsSchema.safeParse({
    amount: parts[0],
    description: parts.slice(1).join(" ") || undefined,
  });

  return result.success ? result.data : null;
}

async function findOrCreateGastosWallet(userId: string): Promise<string | null> {
  const walletsResult = await container.listWallets({ userId });
  if (!walletsResult.ok) return null;

  const existing = walletsResult.value.items.find(
    (w) => w.name.toLowerCase() === "gastos",
  );
  if (existing) return existing.id.value;

  const createdResult = await container.createWallet({
    userId,
    name: "Gastos",
    currency: "PEN",
    color: "coral",
  });

  if (!createdResult.ok) return null;
  return createdResult.value.id.value;
}

export const registerGastoCommand = (bot: Bot<BotContext>) => {
  bot.command("gasto", async (ctx) => {
    console.log("env.botUserId ->>>>>>>>: ", env.botUserId);
    if (!env.botUserId) {
      await ctx.reply("❌ Bot no configurado. Falta BOT_USER_ID.");
      return;
    }

    const args = parseGastoArgs(ctx.match);
    console.log("ARGS", args);
    if (!args) {
      await ctx.reply("❌ Formato: /gasto <monto> [descripción]\nEj: /gasto 50.50 almuerzo");
      return;
    }

    const moneyResult = parseAmountForCurrency(args.amount, "PEN");
    if (!moneyResult.ok) {
      await ctx.reply("❌ Monto inválido. Usá números como 50 o 50.50");
      return;
    }

    const money = moneyResult.value;

    const walletId = await findOrCreateGastosWallet(env.botUserId);
    if (!walletId) {
      await ctx.reply("❌ No pude crear/encontrar la wallet 'Gastos'. Revisá los logs.");
      return;
    }

    console.log("WALLET ID", walletId);

    const result = await container.addTransaction({
      userId: env.botUserId,
      walletId,
      type: "expense",
      amountCents: money.amount,
      currency: "PEN",
      categoryId: "expense:other",
      description: args.description ?? null,
      occurredAt: new Date(),
    });

    console.log("RESULTADO DEL ADD TRANSACTION", result);

    if (!result.ok) {
      await ctx.reply("❌ Error al registrar el gasto. Intentalo de nuevo.");
      return;
    }

    await ctx.reply(`✅ Gasto de S/ ${args.amount} registrado en Gastos`);
  });
};
