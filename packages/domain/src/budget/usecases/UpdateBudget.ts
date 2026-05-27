import { ok, err } from '../../shared/Result.js';
import type { Result } from '../../shared/Result.js';
import type { Clock } from '../../shared/Clock.js';
import { UserId } from '../../user/UserId.js';
import type { UserError } from '../../user/UserError.js';
import { BudgetId } from '../BudgetId.js';
import { BudgetNotFoundError } from '../BudgetError.js';
import type { BudgetError } from '../BudgetError.js';
import type { BudgetRepository } from '../BudgetRepository.js';
import type { Budget } from '../Budget.js';

export interface UpdateBudgetInput {
  userId: string;
  budgetId: string;
  edits: {
    limitCents?: number;
    rollover?: boolean;
  };
}

export interface UpdateBudgetDeps {
  budgetRepo: BudgetRepository;
  clock: Clock;
}

export type UpdateBudgetOutput = Result<Budget, BudgetError | UserError>;

export const makeUpdateBudget =
  (deps: UpdateBudgetDeps) =>
  async (input: UpdateBudgetInput): Promise<UpdateBudgetOutput> => {
    const userIdResult = UserId.create(input.userId);
    if (!userIdResult.ok) return err(userIdResult.error);

    const budgetIdResult = BudgetId.create(input.budgetId);
    if (!budgetIdResult.ok) return err(budgetIdResult.error);

    const budget = await deps.budgetRepo.findById(userIdResult.value, budgetIdResult.value);
    if (!budget) return err(new BudgetNotFoundError());

    const editResult = budget.applyEdits(input.edits, deps.clock.now());
    if (!editResult.ok) return editResult;

    await deps.budgetRepo.update(budget);
    return ok(budget);
  };
