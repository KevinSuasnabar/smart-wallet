import { ok, err } from '../../shared/Result.js';
import type { Result } from '../../shared/Result.js';
import type { Clock } from '../../shared/Clock.js';
import type { IdGenerator } from '../../shared/IdGenerator.js';
import { UserId } from '../../user/UserId.js';
import type { UserError } from '../../user/UserError.js';
import { Category } from '../Category.js';
import { CategoryId } from '../CategoryId.js';
import {
  InvalidCategoryId,
  CategoryAlreadyHidden,
} from '../CategoryError.js';
import type { CategoryError } from '../CategoryError.js';
import type { CategoryRepository } from '../CategoryRepository.js';
import type { TransactionRepository } from '../../transaction/TransactionRepository.js';
import type { Transaction } from '../../transaction/Transaction.js';
import type { CategoryType } from '../CategoryType.js';

export interface ForkPredefinedCategoryInput {
  userId: string;
  predefinedCategoryId: string;
  /** Catalog descriptor for the predefined — supplied by the handler from
   *  shared-types so the domain doesn't depend on shared-types. */
  predefinedDescriptor: {
    name: string;
    type: CategoryType;
    color: string;
  };
  edits: {
    name?: string;
    color?: string;
  };
}

export interface ForkPredefinedCategoryDeps {
  categoryRepo: CategoryRepository;
  transactionRepo: TransactionRepository;
  idGen: IdGenerator;
  clock: Clock;
}

export type ForkPredefinedCategoryOutput = Result<Category, CategoryError | UserError>;

/**
 * Fork a predefined category into a new custom (per-user). The predefined
 * becomes hidden for the user; their existing transactions referencing the
 * old predefined id are migrated to the new custom id. All three operations
 * (custom Put + hide Put + tx migrations) are atomic per chunk inside the
 * repo's `forkPredefined` implementation.
 *
 * Returns the newly-forked Category — the caller can navigate to it / show
 * it in the list as if it had just been created normally.
 */
export const makeForkPredefinedCategory =
  (deps: ForkPredefinedCategoryDeps) =>
  async (input: ForkPredefinedCategoryInput): Promise<ForkPredefinedCategoryOutput> => {
    const userIdResult = UserId.create(input.userId);
    if (!userIdResult.ok) return err(userIdResult.error);
    const oldIdResult = CategoryId.create(input.predefinedCategoryId);
    if (!oldIdResult.ok) return err(oldIdResult.error);

    if (oldIdResult.value.kind !== 'predefined') {
      return err(new InvalidCategoryId('ForkPredefinedCategory requires a predefined id'));
    }

    const userId = userIdResult.value;
    const predefinedId = input.predefinedCategoryId;

    // 1. Refuse if already hidden (a prior DELETE-as-hide on this predefined).
    const hidden = await deps.categoryRepo.listHiddenPredefined(userId);
    if (hidden.includes(predefinedId)) {
      return err(new CategoryAlreadyHidden());
    }

    // 2. Build merged custom values: edits override the predefined defaults.
    const newName = input.edits.name ?? input.predefinedDescriptor.name;
    const newColor = input.edits.color ?? input.predefinedDescriptor.color;
    const type = input.predefinedDescriptor.type;

    // 3. Generate the new custom id and entity.
    const newCustomId = CategoryId.generateCustom(deps.idGen);
    const newCustomResult = Category.create({
      id: newCustomId,
      userId,
      name: newName,
      type,
      color: newColor,
      clock: deps.clock,
    });
    if (!newCustomResult.ok) return newCustomResult;
    const newCustom = newCustomResult.value;

    // 4. Query all of the user's transactions with the old predefined id.
    //    Pass them straight to the repo — the repo's mapper knows how to
    //    rewrite the categoryId attribute + GSI1SK inside its forkPredefined
    //    implementation.
    const transactionsToMigrate: Transaction[] = [];
    let cursor: string | undefined = undefined;
    do {
      const page = await deps.transactionRepo.listByCategory(
        userId,
        predefinedId,
        cursor !== undefined ? { limit: 100, cursor } : { limit: 100 },
      );
      transactionsToMigrate.push(...page.items);
      cursor = page.nextCursor;
    } while (cursor !== undefined);

    // 5. Persist atomically (chunked TransactWriteItems).
    await deps.categoryRepo.forkPredefined({
      userId,
      predefinedCategoryId: predefinedId,
      newCustom,
      transactionsToMigrate,
    });

    return ok(newCustom);
  };
