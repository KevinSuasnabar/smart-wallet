import { err } from '../../shared/Result.js';
import type { Result } from '../../shared/Result.js';
import type { Clock } from '../../shared/Clock.js';
import { UserId } from '../../user/UserId.js';
import type { UserError } from '../../user/UserError.js';
import { CategoryId } from '../CategoryId.js';
import { InvalidCategoryId, CategoryHasTransactions } from '../CategoryError.js';
import type { CategoryError } from '../CategoryError.js';
import type { CategoryRepository } from '../CategoryRepository.js';
import type { TransactionRepository } from '../../transaction/TransactionRepository.js';

export interface HidePredefinedCategoryInput {
  userId: string;
  /** Predefined id (`income:slug` or `expense:slug`). */
  predefinedCategoryId: string;
}

export interface HidePredefinedCategoryDeps {
  categoryRepo: CategoryRepository;
  transactionRepo: TransactionRepository;
  /** Kept for parity with sibling use cases. */
  clock: Clock;
}

export type HidePredefinedCategoryOutput = Result<void, CategoryError | UserError>;

/**
 * "Delete" a predefined category for the current user — persist a hide
 * marker so the category disappears from their list. Idempotent: re-hide is
 * a no-op (returns ok).
 *
 * Blocked if the predefined has at least one active transaction (the
 * existing `CategoryHasTransactions` guard, extended from custom). Forces
 * the user to either edit (fork) or delete the transactions first.
 */
export const makeHidePredefinedCategory =
  (deps: HidePredefinedCategoryDeps) =>
  async (input: HidePredefinedCategoryInput): Promise<HidePredefinedCategoryOutput> => {
    const userIdResult = UserId.create(input.userId);
    if (!userIdResult.ok) return err(userIdResult.error);
    const categoryIdResult = CategoryId.create(input.predefinedCategoryId);
    if (!categoryIdResult.ok) return err(categoryIdResult.error);

    if (categoryIdResult.value.kind !== 'predefined') {
      return err(
        new InvalidCategoryId('HidePredefinedCategory requires a predefined id'),
      );
    }

    const userId = userIdResult.value;
    const predefinedId = input.predefinedCategoryId;

    // Block if any active transaction references this predefined id.
    const probe = await deps.transactionRepo.listByCategory(
      userId,
      predefinedId,
      { limit: 1 },
    );
    if (probe.items.length > 0) {
      return err(new CategoryHasTransactions());
    }

    // Idempotent: the repo maps "already-hidden" (ConditionalCheckFailed) to ok.
    return deps.categoryRepo.hide(userId, predefinedId);
  };
