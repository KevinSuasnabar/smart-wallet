import type { Bot } from "grammy";
import type { BotContext } from "../context.js";

export const registerBalanceCommand = (bot: Bot<BotContext>) => {
  bot.command("balance", async (ctx) => {
    // TODO: listar wallets del usuario y mostrar saldos
    //   const wallets = await container.listWallets({ userId });
    //   wallets.forEach(w => ...)
    await ctx.reply("⏳ Comando /balance en desarrollo — pronto verás tus saldos aquí");
  });
};
