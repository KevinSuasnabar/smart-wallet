import { DomainError } from '../shared/DomainError.js';

// ── Category-domain error classes (flat — no namespaces per ESLint rule) ──

export class InvalidCategoryId extends DomainError {
  readonly tag = 'domain.category.invalid_id' as const;
  readonly httpStatus = 400 as const;

  constructor(message = 'Category ID must be a UUID v4 or a predefined "type:slug" string') {
    super(message);
  }
}

export class InvalidCategoryName extends DomainError {
  readonly tag = 'domain.category.invalid_name' as const;
  readonly httpStatus = 400 as const;

  constructor(message = 'Category name must be 1–32 non-empty characters') {
    super(message);
  }
}

export class InvalidCategoryType extends DomainError {
  readonly tag = 'domain.category.invalid_type' as const;
  readonly httpStatus = 400 as const;

  constructor(message = 'Category type must be "income" or "expense"') {
    super(message);
  }
}

/** Attempted to delete a predefined category ID (type:slug form). */
export class CannotDeletePredefined extends DomainError {
  readonly tag = 'domain.category.cannot_delete_predefined' as const;
  readonly httpStatus = 400 as const;

  constructor(message = 'Predefined categories cannot be deleted') {
    super(message);
  }
}

/**
 * Transaction type does not match category type.
 * Used by CategoryRepository.validateCategoryForTransaction and AddTransaction.
 */
export class CategoryTypeMismatch extends DomainError {
  readonly tag = 'domain.category.type_mismatch' as const;
  readonly httpStatus = 409 as const;

  constructor(message = 'Category type does not match the transaction type') {
    super(message);
  }
}

/** Attempted to use a soft-deleted custom category. */
export class CategoryAlreadyDeleted extends DomainError {
  readonly tag = 'domain.category.already_deleted' as const;
  readonly httpStatus = 409 as const;

  constructor(message = 'Category has already been deleted') {
    super(message);
  }
}

export type CategoryError =
  | InvalidCategoryId
  | InvalidCategoryName
  | InvalidCategoryType
  | CannotDeletePredefined
  | CategoryTypeMismatch
  | CategoryAlreadyDeleted;
