export type TransactionType = 'income' | 'expense';

export const isTransactionType = (v: unknown): v is TransactionType =>
  v === 'income' || v === 'expense';
