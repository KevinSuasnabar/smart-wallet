import { Category, CategoryId, UserId, ok, err } from '@smart-wallet/domain';
import type { CategoryType, CategoryError, Result, CategoryProps } from '@smart-wallet/domain';
import { InvalidCategoryId } from '@smart-wallet/domain';
import { userPK, categorySK } from '../keyBuilders.js';

// ── DynamoDB item shape ────────────────────────────────────────────────────
// Only CUSTOM categories are stored in DynamoDB.
// Predefined categories (income:salary, expense:food, etc.) are static and live in code only.

export interface CategoryItem {
  PK: string;
  SK: string;
  entityType: 'Category';
  categoryId: string;
  userId: string;
  name: string;
  type: CategoryType;
  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
  /** Omitted from item when active (null in domain). */
  deletedAt?: string; // ISO 8601
}

// ── Category (domain) → CategoryItem (DDB) ────────────────────────────────

export const categoryToItem = (category: Category): CategoryItem => {
  const item: CategoryItem = {
    PK: userPK(category.userId.toString()),
    SK: categorySK(category.id.toString()),
    entityType: 'Category',
    categoryId: category.id.toString(),
    userId: category.userId.toString(),
    name: category.name,
    type: category.type,
    createdAt: category.createdAt.toISOString(),
    updatedAt: category.updatedAt.toISOString(),
    // exactOptionalPropertyTypes: only set deletedAt when non-null
    ...(category.deletedAt !== null ? { deletedAt: category.deletedAt.toISOString() } : {}),
  };
  return item;
};

// ── CategoryItem (DDB) → Category (domain) ────────────────────────────────

export const itemToCategory = (item: CategoryItem): Result<Category, CategoryError> => {
  const categoryIdResult = CategoryId.create(item.categoryId);
  if (!categoryIdResult.ok) {
    return err(new InvalidCategoryId(`Stored categoryId is invalid: ${item.categoryId}`));
  }

  const userIdResult = UserId.create(item.userId);
  if (!userIdResult.ok) {
    return err(new InvalidCategoryId(`Stored userId is invalid: ${item.userId}`));
  }

  const props: CategoryProps = {
    userId: userIdResult.value,
    name: item.name,
    type: item.type,
    createdAt: new Date(item.createdAt),
    updatedAt: new Date(item.updatedAt),
    deletedAt: item.deletedAt !== undefined ? new Date(item.deletedAt) : null,
  };

  return ok(Category.rehydrate(categoryIdResult.value, props));
};
