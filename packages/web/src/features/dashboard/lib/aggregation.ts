import type {
  Currency,
  TransactionResponseDTO,
  WalletResponseDTO,
} from '@smart-wallet/shared-types';
import { add, cmp, ratio } from '../../../lib/decimal.js';

export interface MonthRange {
  from: string;
  to: string;
}

export const monthBoundaries = (now: Date): MonthRange => {
  const first = new Date(
    now.getFullYear(),
    now.getMonth(),
    1,
    0,
    0,
    0,
    0,
  );
  return { from: first.toISOString(), to: now.toISOString() };
};

export interface CurrencyBalance {
  currency: Currency;
  balance: string;
}

export const sumBalancesByCurrency = (
  wallets: WalletResponseDTO[],
): CurrencyBalance[] => {
  const map = new Map<Currency, string>();
  for (const w of wallets) {
    const prev = map.get(w.currency) ?? '0.00';
    map.set(w.currency, add(prev, w.balance));
  }
  return Array.from(map.entries())
    .map(([currency, balance]) => ({ currency, balance }))
    .sort((a, b) => a.currency.localeCompare(b.currency));
};

export interface MonthlyStats {
  income: string;
  expenses: string;
}

export const splitIncomeExpense = (
  txs: TransactionResponseDTO[],
): MonthlyStats => {
  let income = '0.00';
  let expenses = '0.00';
  for (const tx of txs) {
    if (tx.type === 'income') income = add(income, tx.amount);
    else expenses = add(expenses, tx.amount);
  }
  return { income, expenses };
};

export interface CategoryAggregate {
  categoryId: string;
  amount: string;
  share: number;
}

export const topCategoriesByAmount = (
  expenseTxs: TransactionResponseDTO[],
  topN = 3,
): CategoryAggregate[] => {
  const sums = new Map<string, string>();
  for (const tx of expenseTxs) {
    const prev = sums.get(tx.categoryId) ?? '0.00';
    sums.set(tx.categoryId, add(prev, tx.amount));
  }
  const total = Array.from(sums.values()).reduce(
    (acc, v) => add(acc, v),
    '0.00',
  );
  const arr: CategoryAggregate[] = Array.from(sums.entries()).map(
    ([categoryId, amount]) => ({
      categoryId,
      amount,
      share: ratio(amount, total),
    }),
  );
  arr.sort((a, b) => {
    const byAmount = cmp(b.amount, a.amount);
    return byAmount !== 0 ? byAmount : a.categoryId.localeCompare(b.categoryId);
  });
  return arr.slice(0, topN);
};
