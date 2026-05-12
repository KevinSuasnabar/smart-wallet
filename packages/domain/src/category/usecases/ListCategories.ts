import { ok, err } from '../../shared/Result.js';
import type { Result } from '../../shared/Result.js';
import { UserId } from '../../user/UserId.js';
import type { UserError } from '../../user/UserError.js';
import type { Category } from '../Category.js';
import type { CategoryRepository } from '../CategoryRepository.js';
import type { CategoryType } from '../CategoryType.js';
import {
  PREDEFINED_INCOME_IDS,
  PREDEFINED_EXPENSE_IDS,
} from '../predefinedIds.js';

/** Descriptor for a predefined category — never stored in DynamoDB. */
export interface PredefinedCategoryDescriptor {
  /** e.g. `"income:salary"`, `"expense:food"` */
  readonly id: string;
  readonly type: CategoryType;
  /** The slug portion of the id — e.g. `"salary"`, `"food"`. */
  readonly slug: string;
}

export interface ListCategoriesInput {
  userId: string;
}

export interface ListCategoriesOutput {
  predefined: PredefinedCategoryDescriptor[];
  custom: Category[];
}

export interface ListCategoriesDeps {
  categoryRepo: CategoryRepository;
}

/** Static predefined list — built once at module load. */
const PREDEFINED_LIST: readonly PredefinedCategoryDescriptor[] = [
  ...PREDEFINED_INCOME_IDS.map((id) => ({
    id,
    type: 'income' as const,
    slug: id.slice('income:'.length),
  })),
  ...PREDEFINED_EXPENSE_IDS.map((id) => ({
    id,
    type: 'expense' as const,
    slug: id.slice('expense:'.length),
  })),
];

export const makeListCategories =
  (deps: ListCategoriesDeps) =>
  async (input: ListCategoriesInput): Promise<Result<ListCategoriesOutput, UserError>> => {
    const userIdResult = UserId.create(input.userId);
    if (!userIdResult.ok) {
      return err(userIdResult.error);
    }

    const custom = await deps.categoryRepo.listCustomByUser(userIdResult.value);

    return ok({
      predefined: [...PREDEFINED_LIST],
      custom,
    });
  };
