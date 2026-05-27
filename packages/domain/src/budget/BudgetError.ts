import { DomainError } from '../shared/DomainError.js';

export class InvalidBudgetId extends DomainError {
  readonly tag = 'domain.budget.invalid_id' as const;
  readonly httpStatus = 400 as const;

  constructor(message = 'Invalid budget identifier') {
    super(message);
  }
}

export class BudgetValidationError extends DomainError {
  readonly tag = 'domain.budget.validation_error' as const;
  readonly httpStatus = 400 as const;

  constructor(message: string) {
    super(message);
  }
}

export class BudgetImmutableFieldError extends DomainError {
  readonly tag = 'domain.budget.immutable_field' as const;
  readonly httpStatus = 400 as const;

  constructor(message = 'Cannot modify immutable budget field') {
    super(message);
  }
}

export class BudgetNotFoundError extends DomainError {
  readonly tag = 'domain.budget.not_found' as const;
  readonly httpStatus = 404 as const;

  constructor(message = 'Budget not found') {
    super(message);
  }
}

export type BudgetError =
  | InvalidBudgetId
  | BudgetValidationError
  | BudgetImmutableFieldError
  | BudgetNotFoundError;
