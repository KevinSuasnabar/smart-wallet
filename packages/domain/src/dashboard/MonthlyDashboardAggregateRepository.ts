import type { Currency } from '../shared/Currency.js';
import type { UserId } from '../user/UserId.js';

export interface MonthlyDashboardAggregateSummary {
  currency: Currency;
  incomeCents: number;
  expenseCents: number;
  topExpenseCategories: {
    categoryId: string;
    amountCents: number;
  }[];
}

export interface MonthlyDashboardAggregateRepository {
  listMonthlySummaries(userId: UserId, month: string): Promise<MonthlyDashboardAggregateSummary[]>;
}
