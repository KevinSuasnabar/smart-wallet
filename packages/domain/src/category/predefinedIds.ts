/**
 * Domain-owned predefined category ID list.
 * Source of truth for the domain layer.
 *
 * NOTE: packages/shared-types/src/categories.ts contains the same set for the
 * transport/API layer. If the two ever diverge, DOMAIN WINS.
 *
 * Income: 5 entries  |  Expense: 9 entries  |  Total: 14
 */

export const PREDEFINED_INCOME_SLUGS = [
  'salary',
  'freelance',
  'investment',
  'gift',
  'other',
] as const;

export const PREDEFINED_EXPENSE_SLUGS = [
  'food',
  'transport',
  'rent',
  'utilities',
  'entertainment',
  'health',
  'education',
  'shopping',
  'other',
] as const;

/** All valid predefined income category IDs, e.g. `"income:salary"`. */
export const PREDEFINED_INCOME_IDS = PREDEFINED_INCOME_SLUGS.map(
  (slug) => `income:${slug}` as const,
);

/** All valid predefined expense category IDs, e.g. `"expense:food"`. */
export const PREDEFINED_EXPENSE_IDS = PREDEFINED_EXPENSE_SLUGS.map(
  (slug) => `expense:${slug}` as const,
);

/** Union of all 14 valid predefined category ID strings. */
export const ALL_PREDEFINED_IDS: readonly string[] = [
  ...PREDEFINED_INCOME_IDS,
  ...PREDEFINED_EXPENSE_IDS,
];

/**
 * Returns true if the given string is one of the 14 known predefined category IDs.
 * This is a domain-level check — independent of shared-types.
 */
export const isPredefinedCategoryId = (id: string): boolean =>
  ALL_PREDEFINED_IDS.includes(id);
