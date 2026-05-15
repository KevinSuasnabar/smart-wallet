import { err, ok } from '../../shared/Result.js';
import type { Result } from '../../shared/Result.js';
import { UserId } from '../../user/UserId.js';
import type { UserError } from '../../user/UserError.js';
import { RecurringTransactionId } from '../RecurringTransactionId.js';
import type { RecurringTransaction } from '../RecurringTransaction.js';
import type { RecurringTransactionRepository } from '../RecurringTransactionRepository.js';
import { RecurringNotFound, type RecurringError } from '../RecurringError.js';

export interface GetRecurringDeps {
  recurringRepo: RecurringTransactionRepository;
}

export interface GetRecurringInput {
  userId: string;
  recurringId: string;
}

export type GetRecurringOutput = Result<
  { recurring: RecurringTransaction },
  RecurringError | UserError
>;

export const makeGetRecurring =
  (deps: GetRecurringDeps) =>
  async (input: GetRecurringInput): Promise<GetRecurringOutput> => {
    const userIdResult = UserId.create(input.userId);
    if (!userIdResult.ok) return err(userIdResult.error);
    const idResult = RecurringTransactionId.create(input.recurringId);
    if (!idResult.ok) return err(idResult.error);

    const found = await deps.recurringRepo.findById(
      userIdResult.value,
      idResult.value,
    );
    if (found === null) return err(new RecurringNotFound());
    return ok({ recurring: found });
  };
