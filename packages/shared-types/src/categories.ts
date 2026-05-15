export const PREDEFINED_INCOME_IDS = [
  'income:salary',
  'income:freelance',
  'income:investment',
  'income:gift',
  'income:other',
] as const;

export const PREDEFINED_EXPENSE_IDS = [
  'expense:food',
  'expense:transport',
  'expense:rent',
  'expense:utilities',
  'expense:entertainment',
  'expense:health',
  'expense:education',
  'expense:shopping',
  'expense:other',
] as const;

export const PREDEFINED_CATEGORY_IDS = [
  ...PREDEFINED_INCOME_IDS,
  ...PREDEFINED_EXPENSE_IDS,
] as const;

export type PredefinedCategoryId = (typeof PREDEFINED_CATEGORY_IDS)[number];

import type { WalletColor } from './wallet-colors.js';

export const PREDEFINED_CATEGORIES: readonly {
  readonly categoryId: PredefinedCategoryId;
  readonly name: string;
  readonly type: 'income' | 'expense';
  readonly color: WalletColor;
}[] = [
  { categoryId: 'income:salary', name: 'Sueldo', type: 'income', color: 'mint' },
  { categoryId: 'income:freelance', name: 'Freelance', type: 'income', color: 'mint' },
  { categoryId: 'income:investment', name: 'Inversión', type: 'income', color: 'lime' },
  { categoryId: 'income:gift', name: 'Regalo', type: 'income', color: 'pink' },
  { categoryId: 'income:other', name: 'Otros', type: 'income', color: 'cream' },
  { categoryId: 'expense:food', name: 'Comida', type: 'expense', color: 'coral' },
  { categoryId: 'expense:transport', name: 'Transporte', type: 'expense', color: 'lilac' },
  { categoryId: 'expense:rent', name: 'Alquiler', type: 'expense', color: 'navy' },
  { categoryId: 'expense:utilities', name: 'Servicios', type: 'expense', color: 'cream' },
  { categoryId: 'expense:entertainment', name: 'Entretenimiento', type: 'expense', color: 'pink' },
  { categoryId: 'expense:health', name: 'Salud', type: 'expense', color: 'mint' },
  { categoryId: 'expense:education', name: 'Educación', type: 'expense', color: 'lilac' },
  { categoryId: 'expense:shopping', name: 'Compras', type: 'expense', color: 'coral' },
  { categoryId: 'expense:other', name: 'Otros', type: 'expense', color: 'cream' },
];

export const isPredefinedCategoryId = (id: string): id is PredefinedCategoryId =>
  (PREDEFINED_CATEGORY_IDS as readonly string[]).includes(id);
