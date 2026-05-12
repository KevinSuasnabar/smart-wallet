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

export const PREDEFINED_CATEGORIES: readonly {
  readonly categoryId: PredefinedCategoryId;
  readonly name: string;
  readonly type: 'income' | 'expense';
}[] = [
  { categoryId: 'income:salary', name: 'Salary', type: 'income' },
  { categoryId: 'income:freelance', name: 'Freelance', type: 'income' },
  { categoryId: 'income:investment', name: 'Investment', type: 'income' },
  { categoryId: 'income:gift', name: 'Gift', type: 'income' },
  { categoryId: 'income:other', name: 'Other Income', type: 'income' },
  { categoryId: 'expense:food', name: 'Food', type: 'expense' },
  { categoryId: 'expense:transport', name: 'Transport', type: 'expense' },
  { categoryId: 'expense:rent', name: 'Rent', type: 'expense' },
  { categoryId: 'expense:utilities', name: 'Utilities', type: 'expense' },
  { categoryId: 'expense:entertainment', name: 'Entertainment', type: 'expense' },
  { categoryId: 'expense:health', name: 'Health', type: 'expense' },
  { categoryId: 'expense:education', name: 'Education', type: 'expense' },
  { categoryId: 'expense:shopping', name: 'Shopping', type: 'expense' },
  { categoryId: 'expense:other', name: 'Other Expense', type: 'expense' },
];

export const isPredefinedCategoryId = (id: string): id is PredefinedCategoryId =>
  (PREDEFINED_CATEGORY_IDS as readonly string[]).includes(id);
