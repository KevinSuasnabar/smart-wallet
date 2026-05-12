import { createHash } from 'node:crypto';

/**
 * Computes a stable idempotency hash for an `AddTransaction` operation.
 *
 * The hash is scoped to (userId, walletId, idempotencyKey) so that the same
 * client key cannot accidentally collide across different users or wallets.
 *
 * Returns the first 32 hex characters of a SHA-256 digest (128 bits of
 * entropy — sufficient for idempotency record SKs at MVP scale).
 */
export const computeIdempotencyHash = (
  userId: string,
  walletId: string,
  key: string,
): string => {
  return createHash('sha256')
    .update(`${userId}:${walletId}:${key}`)
    .digest('hex')
    .slice(0, 32);
};
