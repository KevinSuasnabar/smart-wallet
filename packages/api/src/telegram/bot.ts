import { Bot, session } from 'grammy';
import { conversations, createConversation } from '@grammyjs/conversations';
import { env } from '../env.js';
import type { BotContext, SessionData } from './context.js';
import { authMiddleware } from './middleware/auth.js';
import { registerCommands } from './commands/index.js';
import { makeGrammyStorage } from './storage/grammyStorageAdapter.js';
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
 *   1. authMiddleware       — filtra por MY_TELEGRAM_ID
 *   2. session()            — carga/guarda estado de grammy desde DynamoDB
 *   3. conversations()      — habilita el plugin de conversaciones
 *   4. createConversation() — registra recordTransaction:expense
 *   5. createConversation() — registra recordTransaction:income
 *   6. Comandos registrados  — cancel, gasto, ingreso, balance, ...
 *   7. Handler por defecto   — mensaje no reconocido
 *
 * NOTA: el orden de registro importa. session() y conversations() DEBEN ir
 * antes de createConversation() y antes de los comandos.
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

// ── 1. Auth middleware ─────────────────────────────────────────────────────
bot.use(authMiddleware);

// ── 2. Session middleware (persists conversation state in DynamoDB) ─────────
// The storage adapter stores opaque JSON; cast to SessionData for the type parameter.
bot.use(
  session<SessionData, BotContext>({
    initial: (): SessionData => ({}),
    storage: makeGrammyStorage(container.telegramSessionRepo) as import('grammy').StorageAdapter<SessionData>,
  }),
);

// ── 3. Conversations plugin ────────────────────────────────────────────────
bot.use(conversations());

// ── 4–5. Register conversation handlers ───────────────────────────────────
bot.use(createConversation(recordTransaction('expense'), 'recordTransaction:expense'));
bot.use(createConversation(recordTransaction('income'), 'recordTransaction:income'));

// ── 6. Comandos ────────────────────────────────────────────────────────────
registerCommands(bot);

// ── 7. Respuesta por defecto ───────────────────────────────────────────────
bot.on('message:text', async (ctx) => {
  await ctx.reply(
    'No reconozco ese comando\n\n' +
      'Comandos disponibles:\n' +
      '  /gasto — registrar un gasto (flujo interactivo)\n' +
      '  /ingreso — registrar un ingreso (flujo interactivo)\n' +
      '  /balance\n' +
      '  /cancel — cancelar operación en curso',
  );
});
