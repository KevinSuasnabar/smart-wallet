import { err } from '../../shared/Result.js';
import type { Result } from '../../shared/Result.js';
import type { Clock } from '../../shared/Clock.js';
import type { IdGenerator } from '../../shared/IdGenerator.js';
import { UserId } from '../../user/UserId.js';
import type { UserError } from '../../user/UserError.js';
import { BudgetId } from '../BudgetId.js';
import { Budget } from '../Budget.js';
import type { BudgetError } from '../BudgetError.js';
import type { BudgetRepository } from '../BudgetRepository.js';

export interface CreateBudgetInput {
  userId: string;
  type: string;
  categoryId?: string;
  limitCents: number;
  currency: string;
  rollover?: boolean;
}

export interface CreateBudgetDeps {
  budgetRepo: BudgetRepository;
  idGen: IdGenerator;
  clock: Clock;
}

export type CreateBudgetOutput = Result<Budget, BudgetError | UserError>;

export const makeCreateBudget =
  (deps: CreateBudgetDeps) =>
  async (input: CreateBudgetInput): Promise<CreateBudgetOutput> => {
    const userIdResult = UserId.create(input.userId);
    if (!userIdResult.ok) return err(userIdResult.error);

    const budgetId = BudgetId.generate(deps.idGen);
    const now = deps.clock.now();

    const budgetResult = Budget.create({
      budgetId,
      userId: userIdResult.value,
      type: input.type,
      ...(input.categoryId !== undefined ? { categoryId: input.categoryId } : {}),
      limitCents: input.limitCents,
      currency: input.currency,
      ...(input.rollover !== undefined ? { rollover: input.rollover } : {}),
      createdAt: now,
      updatedAt: now,
    });

    if (!budgetResult.ok) return budgetResult;

    await deps.budgetRepo.save(budgetResult.value);
    return budgetResult;
  };
