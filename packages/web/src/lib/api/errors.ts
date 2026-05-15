import { t } from '../i18n.js';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export const userMessageFor = (err: unknown): string => {
  if (err instanceof ApiError) {
    // Code-based mappings run FIRST so a specific business rule wins over
    // a generic status mapping (e.g. category_has_transactions is 409 today,
    // but the message wouldn't break if the status changed in the future).
    if (err.code === 'category_has_transactions')
      return t.categories.deleteHasTransactionsError;
    if (err.code === 'wallet_currency_locked')
      return t.wallets.currencyLockedError;
    if (err.code === 'validation_failed') return t.errors.validation;
    if (err.code === 'currency_mismatch') return t.errors.currencyMismatch;
    if (err.code === 'category_type_mismatch') return t.errors.categoryTypeMismatch;
    if (err.status === 401) return t.errors.unauthorized;
    if (err.status === 404) return t.errors.notFound;
    if (err.status >= 500) return t.errors.server;
    return t.errors.generic;
  }
  if (err instanceof TypeError && err.message.includes('fetch')) return t.errors.network;
  return t.errors.generic;
};
