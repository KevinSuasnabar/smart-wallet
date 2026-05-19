import type { Context } from "grammy";

/**
 * Custom Context para grammy.
 * Se usa para tipar el Bot al crearlo: `new Bot<BotContext>(token)`.
 * Los comandos reciben `ctx` con este tipo en vez del genérico.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface BotContext extends Context {}
