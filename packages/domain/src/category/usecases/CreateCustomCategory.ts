import { err } from '../../shared/Result.js';
import type { Result } from '../../shared/Result.js';
import type { Clock } from '../../shared/Clock.js';
import type { IdGenerator } from '../../shared/IdGenerator.js';
import { UserId } from '../../user/UserId.js';
import type { UserError } from '../../user/UserError.js';
import { Category } from '../Category.js';
import { CategoryId } from '../CategoryId.js';
import type { CategoryRepository } from '../CategoryRepository.js';
import type { CategoryType } from '../CategoryType.js';
import type { CategoryError } from '../CategoryError.js';

export interface CreateCustomCategoryInput {
  /** Raw userId string from JWT — validated here before use. */
  userId: string;
  name: string;
  type: CategoryType;
}

export interface CreateCustomCategoryDeps {
  categoryRepo: CategoryRepository;
  idGen: IdGenerator;
  clock: Clock;
}

export type CreateCustomCategoryOutput = Result<Category, CategoryError | UserError>;

export const makeCreateCustomCategory =
  (deps: CreateCustomCategoryDeps) =>
  async (input: CreateCustomCategoryInput): Promise<CreateCustomCategoryOutput> => {
    const userIdResult = UserId.create(input.userId);
    if (!userIdResult.ok) {
      return err(userIdResult.error);
    }

    const categoryId = CategoryId.generateCustom(deps.idGen);

    const categoryResult = Category.create({
      id: categoryId,
      userId: userIdResult.value,
      name: input.name,
      type: input.type,
      clock: deps.clock,
    });

    if (!categoryResult.ok) {
      return categoryResult;
    }

    await deps.categoryRepo.save(categoryResult.value);

    return categoryResult;
  };
