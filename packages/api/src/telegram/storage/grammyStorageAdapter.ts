import type { StorageAdapter } from 'grammy';
import type { TelegramSessionRepository } from '../ports/TelegramSessionRepository.js';

/**
 * Bridges the grammy StorageAdapter<unknown> interface to our
 * TelegramSessionRepository port.
 *
 * JSON serialisation lives here — the port stores raw strings, grammy
 * operates on typed objects. This shim is the only place that calls
 * JSON.parse / JSON.stringify for session data.
 */
export const makeGrammyStorage = (
  repo: TelegramSessionRepository,
): StorageAdapter<unknown> => ({
  async read(key: string): Promise<unknown> {
    const raw = await repo.read(key);
    return raw === undefined ? undefined : (JSON.parse(raw) as unknown);
  },

  async write(key: string, value: unknown): Promise<void> {
    await repo.write(key, JSON.stringify(value));
  },

  async delete(key: string): Promise<void> {
    await repo.delete(key);
  },
});
