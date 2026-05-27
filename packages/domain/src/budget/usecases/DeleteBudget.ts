import { ok, err } from '../../shared/Result.js';
import type { Result } from '../../shared/Result.js';
import { UserId } from '../../user/UserId.js';
import type { UserError } from '../../user/UserError.js';
import { BudgetId } from '../BudgetId.js';
import { BudgetNotFoundError } from '../BudgetError.js';
import type { BudgetError } from '../BudgetError.js';
import type { BudgetRepository } from '../BudgetRepository.js';

export interface DeleteBudgetInput {
  userId: string;
  budgetId: string;
}

export interface DeleteBudgetDeps {
  budgetRepo: BudgetRepository;
}

export type DeleteBudgetOutput = Result<void, BudgetError | UserError>;

export const makeDeleteBudget =
  (deps: DeleteBudgetDeps) =>
  async (input: DeleteBudgetInput): Promise<DeleteBudgetOutput> => {
    const userIdResult = UserId.create(input.userId);
    if (!userIdResult.ok) return err(userIdResult.error);

    const budgetIdResult = BudgetId.create(input.budgetId);
    if (!budgetIdResult.ok) return err(budgetIdResult.error);

    const userId = userIdResult.value;
    const budgetId = budgetIdResult.value;

    const budget = await deps.budgetRepo.findById(userId, budgetId);
    if (!budget) return err(new BudgetNotFoundError());

    await deps.budgetRepo.delete(userId, budgetId);
    return ok(undefined);
  };
