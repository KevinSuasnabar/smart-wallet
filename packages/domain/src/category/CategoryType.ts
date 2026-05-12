export type CategoryType = 'income' | 'expense';

export const isCategoryType = (v: unknown): v is CategoryType =>
  v === 'income' || v === 'expense';
