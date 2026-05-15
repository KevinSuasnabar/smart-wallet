import { err, ok } from '../../shared/Result.js';
import type { Result } from '../../shared/Result.js';
import { UserId } from '../../user/UserId.js';
import type { UserError } from '../../user/UserError.js';
import { RecurringTransactionId } from '../RecurringTransactionId.js';
import type { RecurringTransactionRepository } from '../RecurringTransactionRepository.js';
import { RecurringNotFound, type RecurringError } from '../RecurringError.js';

export interface DeleteRecurringInput {
  userId: string;
  recurringId: string;
}

export interface DeleteRecurringDeps {
  recurringRepo: RecurringTransactionRepository;
}

export type DeleteRecurringOutput = Result<
  { deleted: true },
  RecurringError | UserError
>;

export const makeDeleteRecurring =
  (deps: DeleteRecurringDeps) =>
  async (input: DeleteRecurringInput): Promise<DeleteRecurringOutput> => {
    const userIdResult = UserId.create(input.userId);
    if (!userIdResult.ok) return err(userIdResult.error);
    const idResult = RecurringTransactionId.create(input.recurringId);
    if (!idResult.ok) return err(idResult.error);

    const found = await deps.recurringRepo.findById(
      userIdResult.value,
      idResult.value,
    );
    if (found === null) return err(new RecurringNotFound());

    await deps.recurringRepo.hardDelete({
      userId: userIdResult.value,
      recurringId: idResult.value,
    });
    return ok({ deleted: true });
  };
