import { Bot } from 'grammy';
import { conversations, createConversation } from '@grammyjs/conversations';
import { env } from '../env.js';
import type { BotContext } from './context.js';
import { userResolverMiddleware } from './middleware/userResolver.js';
import { registerCommands } from './commands/index.js';
import { registerStartCommand } from './commands/start.js';
import { makeConversationStorage } from './storage/grammyStorageAdapter.js';
import { container } from '../composition/container.js';
import { recordTransaction } from './conversations/recordTransaction.js';

// Extraer el ID numérico de forma automática a partir de tu variable env.telegramToken
const getBotIdFromToken = (token: string): number => {
  console.log('TOKEN TO GET BOT ID', token);
  const botIdStr = token.split(':');
  const parsedId = Number(botIdStr);
  console.log('PARSED ID', parsedId);
  return isNaN(parsedId) ? 0 : parsedId;
};

/**
 * Singleton del Bot de Telegram.
 *
 * Creado a nivel de módulo (cold start de Lambda), igual que los adapters
 * en container.ts. Las conexiones se reusan en invocaciones warm.
 *
 * Middleware chain (orden de ejecución — el orden importa):
 *   1. /start command         — must run BEFORE userResolverMiddleware so that
 *                               unlinked users can complete the linking flow
 *   2. userResolverMiddleware — resolves ctx.userId from the link table (or owner whitelist)
 *   3. conversations()        — habilita el plugin con storage en DynamoDB
 *   4. createConversation()   — registra recordTransaction:new (tipo inferido de categoría)
 *   5. Comandos registrados   — cancel, nuevo, balance, ...
 *   6. Handler por defecto    — mensaje no reconocido
 *
 * NOTA: conversations() v2 gestiona su propio storage (DynamoDB) directamente.
 * No se usa session() middleware — grammy/conversations v2 no lo necesita.
 */
export const bot = new Bot<BotContext>(env.telegramToken, {
  botInfo: {
    id: getBotIdFromToken(env.telegramToken),
    is_bot: true,
    first_name: 'Mi Guardián Financiero',
    username: 'my_finanzas_personal_bot',
    can_join_groups: true,
    can_read_all_group_messages: false,
    supports_inline_queries: false,
    can_connect_to_business: false,
    has_main_web_app: false,
    can_manage_bots: false,
    has_topics_enabled: false,
    allows_users_to_create_topics: false,
  },
  client: {
    // Usar fetch nativo de Node 20 en vez de node-fetch@2.
    // node-fetch@2 no es compatible con el AbortSignal moderno que grammy
    // crea internamente para sus timeouts (tira "Expected signal to be an
    // instanceof AbortSignal").
    fetch: globalThis.fetch,
    // Timeout más agresivo: 10s en vez de los 500s default de grammy.
    timeoutSeconds: 10,
  },
});

// ── 1. /start command — registered BEFORE userResolverMiddleware ───────────
// Users sending /start <token> are not yet linked; the resolver would reject
// them before they complete linking. Registering here bypasses the middleware.
registerStartCommand(bot);

// ── 2. User resolver middleware ────────────────────────────────────────────
// Resolves ctx.userId from the TelegramLink table (or owner whitelist fallback).
// All commands and conversations below this point require ctx.userId to be set.
bot.use(userResolverMiddleware);

// ── 3. Conversations plugin with DynamoDB storage ──────────────────────────
// grammy/conversations v2 manages its own VersionedStateStorage — no session()
// middleware needed. The storage adapter bridges to TelegramSessionRepository.
bot.use(conversations({ storage: makeConversationStorage(container.telegramSessionRepo) }));

// ── 4. Register conversation handler ──────────────────────────────────────
bot.use(createConversation(recordTransaction(), 'recordTransaction:new'));

// ── 5. Comandos ────────────────────────────────────────────────────────────
registerCommands(bot);

// ── 6. Respuesta por defecto ───────────────────────────────────────────────
bot.on('message:text', async (ctx) => {
  await ctx.reply(
    'Comandos disponibles:\n' +
      '  /nuevo — registrar una transacción\n' +
      '  /balance\n' +
      '  /cancel — cancelar operación en curso',
  );
});

// ── 7. Fallback para callback queries sin conversación activa ──────────────
// Botones de mensajes viejos llegan aquí cuando no hay conversación esperándolos.
// Responder cierra el spinner de "Cargando..." en Telegram con un aviso claro.
bot.on('callback_query', async (ctx) => {
  await ctx.answerCallbackQuery('Esta acción ya expiró. Usá /nuevo para empezar.');
});
