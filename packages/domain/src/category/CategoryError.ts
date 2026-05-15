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

/** Invalid color value passed to a category. */
export class InvalidCategoryColor extends DomainError {
  readonly tag = 'domain.category.invalid_color' as const;
  readonly httpStatus = 400 as const;

  constructor(message = 'Category color must be one of the predefined palette values') {
    super(message);
  }
}

/** Attempted to fork-edit a predefined category that the user already hid. */
export class CategoryAlreadyHidden extends DomainError {
  readonly tag = 'domain.category.already_hidden' as const;
  readonly httpStatus = 409 as const;

  constructor(message = 'Predefined category is already hidden for this user') {
    super(message);
  }
}

/**
 * A custom category cannot be deleted while it has at least one active
 * transaction referencing it. Detected via TransactionRepository.listByCategory
 * with limit 1.
 */
export class CategoryHasTransactions extends DomainError {
  readonly tag = 'domain.category.has_transactions' as const;
  readonly httpStatus = 409 as const;

  constructor(message = 'Cannot delete a category that has transactions') {
    super(message);
  }
}

export type CategoryError =
  | InvalidCategoryId
  | InvalidCategoryName
  | InvalidCategoryType
  | InvalidCategoryColor
  | CannotDeletePredefined
  | CategoryTypeMismatch
  | CategoryAlreadyDeleted
  | CategoryHasTransactions
  | CategoryAlreadyHidden;
