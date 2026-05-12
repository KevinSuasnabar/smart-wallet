import { ok, err } from '../../shared/Result.js';
import type { Result } from '../../shared/Result.js';
import { UserId } from '../../user/UserId.js';
import type { UserError } from '../../user/UserError.js';
import type { Transaction } from '../Transaction.js';
import type { TransactionRepository, ListByCategoryFilter } from '../TransactionRepository.js';

export interface ListTransactionsByCategoryInput {
  userId: string;
  categoryId: string;
  from?: Date;
  to?: Date;
  limit?: number;
  cursor?: string;
}

export interface ListTransactionsByCategoryDeps {
  transactionRepo: TransactionRepository;
}

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

export type ListTransactionsByCategoryOutput = Result<
  { items: Transaction[]; nextCursor?: string },
  UserError
>;

export const makeListTransactionsByCategory =
  (deps: ListTransactionsByCategoryDeps) =>
  async (input: ListTransactionsByCategoryInput): Promise<ListTransactionsByCategoryOutput> => {
    const userIdResult = UserId.create(input.userId);
    if (!userIdResult.ok) return err(userIdResult.error);

    const userId = userIdResult.value;
    const limit = Math.min(input.limit ?? DEFAULT_LIMIT, MAX_LIMIT);

    const filter: ListByCategoryFilter = {
      ...(input.from !== undefined ? { from: input.from } : {}),
      ...(input.to !== undefined ? { to: input.to } : {}),
      limit,
      ...(input.cursor !== undefined ? { cursor: input.cursor } : {}),
    };

    const result = await deps.transactionRepo.listByCategory(userId, input.categoryId, filter);

    return ok(result);
  };
