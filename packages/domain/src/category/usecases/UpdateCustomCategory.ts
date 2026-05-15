import { ok, err } from '../../shared/Result.js';
import type { Result } from '../../shared/Result.js';
import type { Clock } from '../../shared/Clock.js';
import { UserId } from '../../user/UserId.js';
import type { UserError } from '../../user/UserError.js';
import { CategoryId } from '../CategoryId.js';
import type { Category } from '../Category.js';
import { InvalidCategoryId, CategoryAlreadyDeleted } from '../CategoryError.js';
import type { CategoryError } from '../CategoryError.js';
import type { CategoryRepository } from '../CategoryRepository.js';

export interface UpdateCustomCategoryInput {
  userId: string;
  /** Must be a UUID v4 (custom category). The handler dispatches by kind
   *  before invoking this use case. */
  categoryId: string;
  edits: {
    name?: string;
    color?: string;
  };
}

export interface UpdateCustomCategoryDeps {
  categoryRepo: CategoryRepository;
  clock: Clock;
}

export type UpdateCustomCategoryOutput = Result<
  Category,
  CategoryError | UserError
>;

/**
 * Apply partial edits to a custom category. Validates the edits at the
 * entity level and persists. The use case is reached only via PATCH on a
 * custom (UUID v4) category id — the handler dispatches predefined ids to
 * `ForkPredefinedCategory` instead.
 */
export const makeUpdateCustomCategory =
  (deps: UpdateCustomCategoryDeps) =>
  async (input: UpdateCustomCategoryInput): Promise<UpdateCustomCategoryOutput> => {
    const userIdResult = UserId.create(input.userId);
    if (!userIdResult.ok) return err(userIdResult.error);
    const categoryIdResult = CategoryId.create(input.categoryId);
    if (!categoryIdResult.ok) return err(categoryIdResult.error);

    const userId = userIdResult.value;
    const categoryId = categoryIdResult.value;

    if (categoryId.kind !== 'custom') {
      // The handler should never route a predefined id here, but guard for safety.
      return err(new InvalidCategoryId('UpdateCustomCategory only operates on custom ids'));
    }

    const category = await deps.categoryRepo.findCustomById(userId, categoryId);
    if (category === null) {
      return err(new InvalidCategoryId('Category not found or does not belong to user'));
    }
    if (category.deletedAt !== null) {
      return err(new CategoryAlreadyDeleted());
    }

    const editResult = category.applyEdits(input.edits, deps.clock);
    if (!editResult.ok) return err(editResult.error);

    await deps.categoryRepo.update(category);
    return ok(category);
  };
