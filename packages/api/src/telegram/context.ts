import type { Context } from 'grammy';
import type { ConversationFlavor } from '@grammyjs/conversations';

/**
 * Extended BotContext for grammy (outer middleware context).
 * ConversationFlavor adds ctx.conversation (enter/exitAll/etc.).
 *
 * Session middleware is NOT used — grammy/conversations v2 manages its own
 * storage directly via the storage option in conversations(). This keeps the
 * context type simple and avoids the redundant session layer.
 *
 * userId is populated by userResolverMiddleware before any handler runs.
 * It holds the app-level user ID resolved from the Telegram link table.
 */
export type BotContext = ConversationFlavor<Context> & { userId: string };
