/**
 * Port: TelegramSessionRepository
 *
 * Defines the contract for reading and writing opaque grammy session blobs.
 * Values are serialised JSON strings — the storage adapter is responsible for
 * JSON serialisation; this port is agnostic to the wire format details.
 *
 * Placed in packages/api (not packages/domain) because Telegram session storage
 * is transport-layer infrastructure, not a business entity.
 */
export interface TelegramSessionRepository {
  /** Returns the raw JSON string for the session, or undefined if not found. */
  read(chatId: string): Promise<string | undefined>;

  /** Persists the raw JSON string for the session, refreshing TTL. */
  write(chatId: string, value: string): Promise<void>;

  /** Removes the session item (called on conversation exit / cancel). */
  delete(chatId: string): Promise<void>;
}
