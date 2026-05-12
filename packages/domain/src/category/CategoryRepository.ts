import type { Result } from '../shared/Result.js';
import type { UserId } from '../user/UserId.js';
import type { TransactionType } from '../transaction/TransactionType.js';
import type { Category } from './Category.js';
import type { CategoryId } from './CategoryId.js';
import type { CategoryError } from './CategoryError.js';

export interface CategoryRepository {
  /**
   * Persist a newly created custom Category.
   * Called by CreateCustomCategory use case.
   */
  save(category: Category): Promise<void>;

  /**
   * Look up a custom Category by userId and categoryId.
   * Returns null when not found (or owned by another user).
   * Note: may return a soft-deleted category — callers must check deletedAt.
   */
  findCustomById(userId: UserId, categoryId: CategoryId): Promise<Category | null>;

  /**
   * List all non-deleted custom categories for a user.
   * Soft-deleted categories are excluded.
   */
  listCustomByUser(userId: UserId): Promise<Category[]>;

  /**
   * Persist the soft-deleted state of a Category aggregate.
   * Called by DeleteCustomCategory use case after category.softDelete().
   */
  softDelete(category: Category): Promise<void>;

  /**
   * Validate whether a categoryId is usable for a transaction of the given type.
   *
   * For predefined IDs (kind = 'predefined'):
   *   - Checks that the predefined ID prefix matches the transaction type
   *     ('income:...' for income, 'expense:...' for expense).
   *   - No DB lookup needed.
   *
   * For custom IDs (kind = 'custom'):
   *   - Looks up the custom Category via findCustomById.
   *   - Returns InvalidCategoryId if not found or not owned by the user.
   *   - Returns CategoryAlreadyDeleted if the category is soft-deleted.
   *   - Returns CategoryTypeMismatch if the category.type ≠ transactionType.
   *
   * Returns ok(undefined) when the category is valid for the transaction.
   *
   * Used by AddTransaction to enforce REQ-CAT-04 / REQ-VAL-05 / REQ-DEL-04.
   */
  validateCategoryForTransaction(input: {
    userId: UserId;
    categoryId: CategoryId;
    transactionType: TransactionType;
  }): Promise<Result<void, CategoryError>>;
}
