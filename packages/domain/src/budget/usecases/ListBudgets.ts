import { ok, err } from '../../shared/Result.js';
import type { Result } from '../../shared/Result.js';
import type { Clock } from '../../shared/Clock.js';
import { UserId } from '../../user/UserId.js';
import type { UserError } from '../../user/UserError.js';
import type { Budget } from '../Budget.js';
import type { BudgetRepository } from '../BudgetRepository.js';
import type { TransactionRepository } from '../../transaction/TransactionRepository.js';

export interface BudgetWithSpent {
  budget: Budget;
  spentCents: number;
  effectiveLimitCents: number;
}

export interface ListBudgetsDeps {
  budgetRepo: BudgetRepository;
  transactionRepo: TransactionRepository;
  clock: Clock;
}

export interface ListBudgetsInput {
  userId: string;
}

export type ListBudgetsOutput = Result<BudgetWithSpent[], UserError>;

function monthBoundaries(date: Date): { start: Date; end: Date } {
  const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
  const end = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1));
  return { start, end };
}

function prevMonthBoundaries(date: Date): { start: Date; end: Date } {
  const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() - 1, 1));
  const end = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
  return { start, end };
}

export const makeListBudgets =
  (deps: ListBudgetsDeps) =>
  async (input: ListBudgetsInput): Promise<ListBudgetsOutput> => {
    const userIdResult = UserId.create(input.userId);
    if (!userIdResult.ok) return err(userIdResult.error);

    const userId = userIdResult.value;
    const now = deps.clock.now();
    const { start: currStart, end: currEnd } = monthBoundaries(now);
    const { start: prevStart, end: prevEnd } = prevMonthBoundaries(now);

    const budgets = await deps.budgetRepo.listByUser(userId);

    const results = await Promise.all(
      budgets.map(async (budget): Promise<BudgetWithSpent> => {
        const spentCents = await deps.transactionRepo.sumExpensesByPeriod(userId, {
          from: currStart,
          to: currEnd,
          currency: budget.currency,
          ...(budget.categoryId !== undefined ? { categoryId: budget.categoryId } : {}),
        });

        let effectiveLimitCents = budget.limitCents;

        if (budget.rollover) {
          const prevSpentCents = await deps.transactionRepo.sumExpensesByPeriod(userId, {
            from: prevStart,
            to: prevEnd,
            currency: budget.currency,
            ...(budget.categoryId !== undefined ? { categoryId: budget.categoryId } : {}),
          });
          const leftover = Math.max(0, budget.limitCents - prevSpentCents);
          effectiveLimitCents = budget.limitCents + leftover;
        }

        return { budget, spentCents, effectiveLimitCents };
      }),
    );

    return ok(results);
  };
