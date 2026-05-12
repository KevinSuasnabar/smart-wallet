/**
 * Structural (shape-only) categoryId helpers.
 * Semantic validation (does the category exist? does its type match?) is done in
 * the use case layer once CategoryRepository is wired (Slice 5 / T-05-05).
 */

export type CategoryIdShape = 'predefined' | 'custom';

const UUID_V4_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Detect the structural shape of a categoryId.
 * Returns 'predefined' for `"type:slug"` IDs (e.g. `"income:salary"`, `"expense:food"`),
 * 'custom' for UUID v4 strings, and null for anything that matches neither.
 */
export const detectCategoryIdShape = (id: string): CategoryIdShape | null => {
  if (id.startsWith('income:') || id.startsWith('expense:')) return 'predefined';
  if (UUID_V4_REGEX.test(id)) return 'custom';
  return null;
};
