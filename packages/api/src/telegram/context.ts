import type { Context, SessionFlavor } from 'grammy';
import type { ConversationFlavor } from '@grammyjs/conversations';

/**
 * Opaque session data owned by the @grammyjs/conversations plugin.
 * The conversations plugin writes its replay state here — we do not need to
 * declare any fields; the plugin manages the shape internally.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface SessionData {}

/**
 * Extended BotContext for grammy (outer middleware context):
 *   - SessionFlavor<SessionData>  adds ctx.session (read/write)
 *   - ConversationFlavor<...>     adds ctx.conversation (enter/exitAll/etc.)
 *
 * IMPORTANT: this is the OUTER context type used by middleware and command handlers.
 * Inside conversations the inner context type is plain Context (see recordTransaction.ts).
 * All command handlers and the bot instance use this type.
 */
export type BotContext = ConversationFlavor<Context & SessionFlavor<SessionData>>;
