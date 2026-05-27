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

export const hiddenPredefinedSK = (predefinedCategoryId: string): string =>
  `HIDDENCAT#${predefinedCategoryId}`;

export const recurringSK = (recurringId: string): string => `RECURRING#${recurringId}`;

/** GSI1SK for recurring rows: lets us query pending materializations by ISO timestamp. */
export const recurringGsi1SK = (nextOccurrenceAtIso: string, recurringId: string): string =>
  `RECURNEXT#${nextOccurrenceAtIso}#${recurringId}`;

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

export const hiddenPredefinedSKPrefix = (): string => 'HIDDENCAT#';

export const recurringSKPrefix = (): string => 'RECURRING#';

export const recurringGsi1SKPrefix = (): string => 'RECURNEXT#';

// ── Telegram sessions table key ───────────────────────────────────────────
// The sessions table is a separate table (not the single-table) with PK=chatId.
// This helper documents the intended key shape for the sessions adapter.

export const telegramSessionKey = (chatId: string): { chatId: string } => ({ chatId });

// ── Telegram link keys (single-table) ────────────────────────────────────
// TELEGRAM#<telegramId> / LINK         → forward lookup: telegramId → userId
// USER#<userId>         / TELEGRAMLINK → reverse lookup: userId → telegramId
// USER#<userId>         / TELEGRAMTOKEN → one-time link token (with TTL)

export const telegramLinkPK = (telegramId: string | number): string => `TELEGRAM#${telegramId}`;

export const telegramLinkSK = (): 'LINK' => 'LINK';

export const telegramReverseLinkSK = (): 'TELEGRAMLINK' => 'TELEGRAMLINK';

export const telegramTokenSK = (): 'TELEGRAMTOKEN' => 'TELEGRAMTOKEN';
