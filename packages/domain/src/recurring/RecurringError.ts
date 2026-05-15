import { DomainError } from '../shared/DomainError.js';

// ── Recurring-transaction-domain error classes (flat — no namespaces per ESLint) ──

export class InvalidRecurringId extends DomainError {
  readonly tag = 'domain.recurring.invalid_id' as const;
  readonly httpStatus = 400 as const;

  constructor(message = 'Invalid recurring transaction identifier') {
    super(message);
  }
}

export class InvalidDayOfMonth extends DomainError {
  readonly tag = 'domain.recurring.invalid_day_of_month' as const;
  readonly httpStatus = 400 as const;

  constructor(message = 'Day of month must be an integer in [1, 31]') {
    super(message);
  }
}

export class InvalidCadence extends DomainError {
  readonly tag = 'domain.recurring.invalid_cadence' as const;
  readonly httpStatus = 400 as const;

  constructor(message = "Cadence must be 'monthly'") {
    super(message);
  }
}

export class InvalidRecurringDescription extends DomainError {
  readonly tag = 'domain.recurring.invalid_description' as const;
  readonly httpStatus = 400 as const;

  constructor(message = 'Description must be at most 256 characters') {
    super(message);
  }
}

export class RecurringNotFound extends DomainError {
  readonly tag = 'domain.recurring.not_found' as const;
  readonly httpStatus = 404 as const;

  constructor(message = 'Recurring transaction not found') {
    super(message);
  }
}

export class RecurringWalletMismatch extends DomainError {
  readonly tag = 'domain.recurring.wallet_mismatch' as const;
  readonly httpStatus = 400 as const;

  constructor(message = 'Recurring currency does not match wallet currency') {
    super(message);
  }
}

export class RecurringCategoryMismatch extends DomainError {
  readonly tag = 'domain.recurring.category_mismatch' as const;
  readonly httpStatus = 400 as const;

  constructor(message = 'Category type does not match recurring type') {
    super(message);
  }
}

export class RecurringWalletNotFound extends DomainError {
  readonly tag = 'domain.recurring.wallet_not_found' as const;
  readonly httpStatus = 400 as const;

  constructor(message = 'The wallet for this recurring does not exist or was deleted') {
    super(message);
  }
}

export class RecurringCategoryNotFound extends DomainError {
  readonly tag = 'domain.recurring.category_not_found' as const;
  readonly httpStatus = 400 as const;

  constructor(message = 'The category for this recurring does not exist') {
    super(message);
  }
}

export class RecurringNoEdits extends DomainError {
  readonly tag = 'domain.recurring.no_edits' as const;
  readonly httpStatus = 400 as const;

  constructor(message = 'At least one editable field must be provided') {
    super(message);
  }
}

export class RecurringAmountInvalid extends DomainError {
  readonly tag = 'domain.recurring.invalid_amount' as const;
  readonly httpStatus = 400 as const;

  constructor(message = 'Recurring amount must be a strictly positive integer (cents)') {
    super(message);
  }
}

export type RecurringError =
  | InvalidRecurringId
  | InvalidDayOfMonth
  | InvalidCadence
  | InvalidRecurringDescription
  | RecurringNotFound
  | RecurringWalletMismatch
  | RecurringCategoryMismatch
  | RecurringWalletNotFound
  | RecurringCategoryNotFound
  | RecurringNoEdits
  | RecurringAmountInvalid;
