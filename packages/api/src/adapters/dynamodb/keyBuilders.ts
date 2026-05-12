// ── Single-table key builders ─────────────────────────────────────────────
// All PK/SK strings are constructed through these pure functions.
// Callers MUST NOT hardcode key formats outside this module.

export const userPK = (userId: string): string => `USER#${userId}`;

export const walletSK = (walletId: string): string => `WALLET#${walletId}`;

export const transactionSK = (
  walletId: string,
  occurredAtIso: string,
  transactionId: string,
): string => `TXN#${walletId}#${occurredAtIso}#${transactionId}`;

export const categorySK = (categoryId: string): string => `CATEGORY#${categoryId}`;

export const idempotencySK = (hashedKey: string): string => `IDEMPOTENCY#${hashedKey}`;

export const transactionGsi1SK = (
  categoryId: string,
  occurredAtIso: string,
  transactionId: string,
): string => `CAT#${categoryId}#${occurredAtIso}#${transactionId}`;

// ── SK prefix helpers for begins_with() queries ───────────────────────────

export const walletSKPrefix = (): string => 'WALLET#';

export const transactionSKPrefix = (walletId: string): string => `TXN#${walletId}#`;

export const categorySKPrefix = (): string => 'CATEGORY#';
