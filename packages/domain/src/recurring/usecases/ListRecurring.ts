import { err, ok } from '../../shared/Result.js';
import type { Result } from '../../shared/Result.js';
import { UserId } from '../../user/UserId.js';
import type { UserError } from '../../user/UserError.js';
import type { RecurringTransaction } from '../RecurringTransaction.js';
import type { RecurringTransactionRepository } from '../RecurringTransactionRepository.js';

export interface ListRecurringDeps {
  recurringRepo: RecurringTransactionRepository;
}

export type ListRecurringOutput = Result<
  { items: RecurringTransaction[] },
  UserError
>;

export const makeListRecurring =
  (deps: ListRecurringDeps) =>
  async (userIdRaw: string): Promise<ListRecurringOutput> => {
    const userIdResult = UserId.create(userIdRaw);
    if (!userIdResult.ok) return err(userIdResult.error);
    const items = await deps.recurringRepo.listByUser(userIdResult.value);
    return ok({ items });
  };
