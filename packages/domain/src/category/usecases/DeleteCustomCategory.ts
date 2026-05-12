import { ok, err } from '../../shared/Result.js';
import type { Result } from '../../shared/Result.js';
import type { Clock } from '../../shared/Clock.js';
import { UserId } from '../../user/UserId.js';
import type { UserError } from '../../user/UserError.js';
import { CategoryId } from '../CategoryId.js';
import type { CategoryRepository } from '../CategoryRepository.js';
import { InvalidCategoryId, CannotDeletePredefined } from '../CategoryError.js';
import type { CategoryError } from '../CategoryError.js';

export interface DeleteCustomCategoryInput {
  /** Raw userId string from JWT — validated here before use. */
  userId: string;
  /** Raw categoryId string — validated here before use. */
  categoryId: string;
}

export interface DeleteCustomCategoryDeps {
  categoryRepo: CategoryRepository;
  clock: Clock;
}

export type DeleteCustomCategoryOutput = Result<void, CategoryError | UserError>;

export const makeDeleteCustomCategory =
  (deps: DeleteCustomCategoryDeps) =>
  async (input: DeleteCustomCategoryInput): Promise<DeleteCustomCategoryOutput> => {
    const userIdResult = UserId.create(input.userId);
    if (!userIdResult.ok) {
      return err(userIdResult.error);
    }

    const categoryIdResult = CategoryId.create(input.categoryId);
    if (!categoryIdResult.ok) {
      return categoryIdResult;
    }

    const categoryId = categoryIdResult.value;

    // Predefined categories cannot be deleted — this is a domain invariant
    if (categoryId.kind === 'predefined') {
      return err(new CannotDeletePredefined());
    }

    const userId = userIdResult.value;

    // Load the custom category — null means not found or belongs to another user
    const category = await deps.categoryRepo.findCustomById(userId, categoryId);

    if (category === null) {
      // Return InvalidCategoryId (not-found semantic): handler maps this to 404
      return err(new InvalidCategoryId('Category not found or does not belong to user'));
    }

    // Soft-delete (idempotent — already-deleted returns ok)
    const deleteResult = category.softDelete(deps.clock);
    if (!deleteResult.ok) {
      return deleteResult;
    }

    await deps.categoryRepo.softDelete(category);

    return ok(undefined);
  };
