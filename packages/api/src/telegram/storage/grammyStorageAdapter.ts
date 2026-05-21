import type { ConversationData, VersionedState } from '@grammyjs/conversations';
import type { TelegramSessionRepository } from '../ports/TelegramSessionRepository.js';

/**
 * Bridges the grammy/conversations v2 VersionedStateStorage interface to our
 * TelegramSessionRepository port.
 *
 * grammy/conversations v2 stores VersionedState<ConversationData> objects.
 * The port stores raw strings — JSON serialisation lives here only.
 *
 * The returned object satisfies ConversationStorage (type?: never variant),
 * which makes grammy use ctx.chatId as the storage key automatically.
 */
export const makeConversationStorage = (repo: TelegramSessionRepository) => ({
  async read(key: string): Promise<VersionedState<ConversationData> | undefined> {
    const raw = await repo.read(key);
    if (raw === undefined) return undefined;
    return JSON.parse(raw) as VersionedState<ConversationData>;
  },

  async write(key: string, state: VersionedState<ConversationData>): Promise<void> {
    await repo.write(key, JSON.stringify(state));
  },

  async delete(key: string): Promise<void> {
    await repo.delete(key);
  },
});
