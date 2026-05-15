import type { Result } from '../shared/Result.js';
import type { UserId } from '../user/UserId.js';
import type { TransactionType } from '../transaction/TransactionType.js';
import type { Transaction } from '../transaction/Transaction.js';
import type { Category } from './Category.js';
import type { CategoryId } from './CategoryId.js';
import type { CategoryError } from './CategoryError.js';

export interface ForkPredefinedInput {
  userId: UserId;
  predefinedCategoryId: string;
  /** The new custom Category that replaces the predefined for this user. */
  newCustom: Category;
  /**
   * Transactions that currently reference the predefined id and need their
   * `categoryId` rewritten to the new custom id. The repo computes the
   * required DynamoDB operations (Update of categoryId attribute + GSI1SK)
   * from each Transaction's current state.
   */
  transactionsToMigrate: Transaction[];
}

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

  /**
   * Persist edits to an existing custom Category. Implementation MUST use a
   * ConditionExpression that requires the item to exist; a vanished custom
   * category surfaces as an error the use case maps to InvalidCategoryId.
   */
  update(category: Category): Promise<void>;

  /**
   * Persist a `HiddenPredefinedCategory` marker. Idempotent at the
   * implementation level — the impl uses `attribute_not_exists(PK)` and maps
   * the conditional-check-failed to ok(undefined) so a re-hide is a no-op.
   */
  hide(userId: UserId, predefinedCategoryId: string): Promise<Result<void, CategoryError>>;

  /**
   * Return the list of predefined category ids that this user has hidden.
   * The order is unspecified.
   */
  listHiddenPredefined(userId: UserId): Promise<string[]>;

  /**
   * Atomically (per chunk) write the new custom Category, the hidden-
   * predefined marker, and migrate every supplied transaction to point at
   * the new custom id. See design §4.4 for the chunking algorithm.
   */
  forkPredefined(input: ForkPredefinedInput): Promise<void>;
}
