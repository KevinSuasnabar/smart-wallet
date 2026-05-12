import { isPredefinedCategoryId } from '@smart-wallet/shared-types';

const UUID_V4_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Returns true if the string is a valid UUID v4.
 */
export function isUuidV4(v: string): boolean {
  return UUID_V4_REGEX.test(v);
}

/**
 * Structural-only categoryId validity check at the API boundary.
 *
 * Returns true if the value is either:
 * - A predefined category ID (e.g. "income:salary", "expense:food")
 * - A UUID v4 (custom category)
 *
 * Semantic validation (does the category exist? does it match the transaction type?)
 * is performed by CategoryRepository.validateCategoryForTransaction in the AddTransaction
 * use case — that is the domain's responsibility, not the boundary's.
 *
 * REQ-VAL-05
 */
export function isCategoryIdShape(id: string): boolean {
  return isPredefinedCategoryId(id) || isUuidV4(id);
}
