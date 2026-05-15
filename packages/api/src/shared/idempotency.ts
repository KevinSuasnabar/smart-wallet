import { createHash } from 'node:crypto';

/**
 * Computes a stable idempotency hash for a transaction-scoped operation.
 *
 * Base scope: `(userId, walletId, idempotencyKey)` — prevents the same client
 * key from colliding across users or wallets. Used by POST.
 *
 * Optional `resourceId`: when provided, the hash also includes the resource
 * identifier in its input string. PATCH passes the transactionId here so a
 * client that reuses the same idempotency key for two different transactions
 * still produces different hashes (and so PATCH cannot collide with POST).
 *
 * Returns the first 32 hex characters of a SHA-256 digest (128 bits of
 * entropy — sufficient for idempotency record SKs at MVP scale).
 *
 * Backwards-compatible: existing callers that pass three args produce the
 * exact same digest as before.
 */
export const computeIdempotencyHash = (
  userId: string,
  walletId: string,
  key: string,
  resourceId?: string,
): string => {
  const input =
    resourceId !== undefined
      ? `${userId}:${walletId}:${resourceId}:${key}`
      : `${userId}:${walletId}:${key}`;
  return createHash('sha256')
    .update(input)
    .digest('hex')
    .slice(0, 32);
};
