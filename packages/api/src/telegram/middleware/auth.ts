import type { Context, NextFunction } from "grammy";
import { env } from "../../env.js";

/**
 * Middleware de autorización para grammy.
 *
 * Filtra todos los updates: si el `from.id` del usuario de Telegram
 * no coincide con `MY_TELEGRAM_ID`, el mensaje se ignora silenciosamente
 * (no se llama a `next()` ni se responde).
 *
 * El Lambda handler siempre devuelve 200 a Telegram, así que no hay
 * reintentos por "failure". El usuario no autorizado ni se entera de
 * que el bot existe.
 */
export const authMiddleware = async (ctx: Context, next: NextFunction) => {
  if (ctx.from?.id !== env.myTelegramId) {
    console.warn(`[telegram] Acceso no autorizado de user_id=${ctx.from?.id}`);
    return;
  }

  await next();
};
