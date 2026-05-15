import { DomainError } from '../shared/DomainError.js';

// ── Transaction-domain error classes (flat — no namespaces per ESLint rule) ──

export class InvalidTransactionId extends DomainError {
  readonly tag = 'domain.transaction.invalid_id' as const;
  readonly httpStatus = 400 as const;

  constructor(message = 'Invalid transaction identifier') {
    super(message);
  }
}

/**
 * Money amount is not a strictly positive integer cents value.
 * Lives here because Money is a transaction-domain VO (not a shared concept).
 */
export class InvalidMoneyAmount extends DomainError {
  readonly tag = 'domain.transaction.invalid_money_amount' as const;
  readonly httpStatus = 400 as const;

  constructor(message = 'Amount must be a strictly positive integer (cents)') {
    super(message);
  }
}

export class CurrencyMismatch extends DomainError {
  readonly tag = 'domain.transaction.currency_mismatch' as const;
  readonly httpStatus = 409 as const;

  constructor(message = 'Transaction currency does not match wallet currency') {
    super(message);
  }
}

export class InvalidCategoryReference extends DomainError {
  readonly tag = 'domain.transaction.invalid_category' as const;
  readonly httpStatus = 409 as const;

  constructor(message = 'Category reference is structurally invalid (not a UUID or predefined ID)') {
    super(message);
  }
}

export class InvalidOccurredAt extends DomainError {
  readonly tag = 'domain.transaction.invalid_occurred_at' as const;
  readonly httpStatus = 400 as const;

  constructor(message = 'occurredAt must be a Date within [now − 5 years, now + 1 day]') {
    super(message);
  }
}

export class InvalidDescription extends DomainError {
  readonly tag = 'domain.transaction.invalid_description' as const;
  readonly httpStatus = 400 as const;

  constructor(message = 'Description must be at most 256 characters') {
    super(message);
  }
}

/** categoryId is structurally valid but the referenced category is unknown or deleted. */
export class UnknownCategory extends DomainError {
  readonly tag = 'domain.transaction.unknown_category' as const;
  readonly httpStatus = 409 as const;

  constructor(message = 'Unknown or soft-deleted category') {
    super(message);
  }
}

/** Transaction does not exist, was deleted, or is not owned by the caller. */
export class TransactionNotFound extends DomainError {
  readonly tag = 'domain.transaction.not_found' as const;
  readonly httpStatus = 404 as const;

  constructor(message = 'Transaction not found') {
    super(message);
  }
}

export type TransactionError =
  | InvalidTransactionId
  | InvalidMoneyAmount
  | CurrencyMismatch
  | InvalidCategoryReference
  | InvalidOccurredAt
  | InvalidDescription
  | UnknownCategory
  | TransactionNotFound;
