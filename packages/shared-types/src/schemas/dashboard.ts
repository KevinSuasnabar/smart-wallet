import { z } from 'zod';
import { zCurrency } from '../currencies.js';

export const DashboardCurrencyBalanceSchema = z.object({
  currency: zCurrency,
  balance: z.string(),
});

export type DashboardCurrencyBalanceDTO = z.infer<typeof DashboardCurrencyBalanceSchema>;

export const DashboardTopCategorySchema = z.object({
  categoryId: z.string(),
  amount: z.string(),
  share: z.number(),
});

export type DashboardTopCategoryDTO = z.infer<typeof DashboardTopCategorySchema>;

export const DashboardMonthlySummarySchema = z.object({
  currency: zCurrency,
  monthlyIncome: z.string(),
  monthlyExpenses: z.string(),
  monthlyNet: z.string(),
  topCategories: z.array(DashboardTopCategorySchema),
});

export type DashboardMonthlySummaryDTO = z.infer<typeof DashboardMonthlySummarySchema>;

export const MonthlyDashboardResponseSchema = z.object({
  range: z.object({
    from: z.string(),
    to: z.string(),
  }),
  totalsByCurrency: z.array(DashboardCurrencyBalanceSchema),
  summariesByCurrency: z.array(DashboardMonthlySummarySchema),
});

export type MonthlyDashboardResponseDTO = z.infer<typeof MonthlyDashboardResponseSchema>;
