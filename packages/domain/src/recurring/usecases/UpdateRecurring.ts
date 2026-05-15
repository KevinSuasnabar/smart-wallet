import { err, ok } from '../../shared/Result.js';
import type { Result } from '../../shared/Result.js';
import type { Clock } from '../../shared/Clock.js';
import { UserId } from '../../user/UserId.js';
import type { UserError } from '../../user/UserError.js';
import { Money } from '../../transaction/Money.js';
import { CategoryId } from '../../category/CategoryId.js';
import type { CategoryRepository } from '../../category/CategoryRepository.js';
import type { CategoryError } from '../../category/CategoryError.js';
import { RecurringTransactionId } from '../RecurringTransactionId.js';
import type { RecurringTransaction } from '../RecurringTransaction.js';
import type { RecurringTransactionRepository } from '../RecurringTransactionRepository.js';
import {
  RecurringNotFound,
  RecurringNoEdits,
  RecurringAmountInvalid,
  type RecurringError,
} from '../RecurringError.js';

export interface UpdateRecurringInput {
  userId: string;
  recurringId: string;
  /** Cents (handler-converted). Undefined when amount is not being edited. */
  amountCents?: number;
  categoryId?: string;
  description?: string | null;
  dayOfMonth?: number;
}

export interface UpdateRecurringDeps {
  categoryRepo: CategoryRepository;
  recurringRepo: RecurringTransactionRepository;
  clock: Clock;
}

export type UpdateRecurringOutput = Result<
  { recurring: RecurringTransaction },
  RecurringError | UserError | CategoryError
>;

export const makeUpdateRecurring =
  (deps: UpdateRecurringDeps) =>
  async (input: UpdateRecurringInput): Promise<UpdateRecurringOutput> => {
    const noEdits =
      input.amountCents === undefined &&
      input.categoryId === undefined &&
      input.description === undefined &&
      input.dayOfMonth === undefined;
    if (noEdits) return err(new RecurringNoEdits());

    const userIdResult = UserId.create(input.userId);
    if (!userIdResult.ok) return err(userIdResult.error);
    const idResult = RecurringTransactionId.create(input.recurringId);
    if (!idResult.ok) return err(idResult.error);

    const recurring = await deps.recurringRepo.findById(
      userIdResult.value,
      idResult.value,
    );
    if (recurring === null) return err(new RecurringNotFound());

    // Re-validate category against the recurring's type when changed.
    if (input.categoryId !== undefined) {
      const catId = CategoryId.create(input.categoryId);
      if (!catId.ok) return err(catId.error);
      const validation = await deps.categoryRepo.validateCategoryForTransaction({
        userId: userIdResult.value,
        categoryId: catId.value,
        transactionType: recurring.type,
      });
      if (!validation.ok) return err(validation.error);
    }

    // Build edits object — Money keeps the recurring's existing currency.
    const edits: Parameters<typeof recurring.applyEdits>[0] = {};
    if (input.amountCents !== undefined) {
      const moneyResult = Money.create(
        input.amountCents,
        recurring.amount.currency,
      );
      if (!moneyResult.ok) return err(new RecurringAmountInvalid());
      edits.amount = moneyResult.value;
    }
    if (input.categoryId !== undefined) edits.categoryId = input.categoryId;
    if (input.description !== undefined) edits.description = input.description;
    if (input.dayOfMonth !== undefined) edits.dayOfMonth = input.dayOfMonth;

    const applied = recurring.applyEdits(edits, deps.clock);
    if (!applied.ok) return err(applied.error);

    await deps.recurringRepo.update({ recurring });
    return ok({ recurring });
  };
