// Currencies
export { CURRENCIES, currencyDecimals, zCurrency } from './currencies.js';
export type { Currency } from './currencies.js';

// Categories
export {
  PREDEFINED_INCOME_IDS,
  PREDEFINED_EXPENSE_IDS,
  PREDEFINED_CATEGORY_IDS,
  PREDEFINED_CATEGORIES,
  isPredefinedCategoryId,
} from './categories.js';
export type { PredefinedCategoryId } from './categories.js';

// Money helpers
export { decimalStringToCents, centsToDecimalString } from './money.js';

// Pagination
export { zCursor, zLimit, zPaginatedResponse } from './pagination.js';
export type { PaginatedResponse } from './pagination.js';

// Date
export { zIso8601 } from './date.js';

// Common schemas
export { zUuid, zUserId, zWalletId, zTransactionId, zCategoryId, zIdempotencyKey } from './schemas/common.js';

// Wallet schemas + DTOs
export {
  CreateWalletRequestSchema,
  WalletResponseSchema,
  ListWalletsResponseSchema,
} from './schemas/wallet.js';
export type {
  CreateWalletDTO,
  WalletResponseDTO,
  ListWalletsResponseDTO,
} from './schemas/wallet.js';

// Transaction schemas + DTOs
export {
  zDecimalAmount,
  AddTransactionRequestSchema,
  TransactionResponseSchema,
  ListTransactionsResponseSchema,
  ListTransactionsByWalletQuerySchema,
  ListTransactionsByCategoryQuerySchema,
} from './schemas/transaction.js';
export type {
  AddTransactionDTO,
  TransactionResponseDTO,
  ListTransactionsResponseDTO,
  ListTransactionsByWalletQueryDTO,
  ListTransactionsByCategoryQueryDTO,
} from './schemas/transaction.js';

// Category schemas + DTOs
export {
  CreateCustomCategoryRequestSchema,
  CategoryResponseSchema,
  PredefinedCategoryResponseSchema,
  ListCategoriesResponseSchema,
} from './schemas/category.js';
export type {
  CreateCustomCategoryDTO,
  CategoryResponseDTO,
  PredefinedCategoryResponseDTO,
  ListCategoriesResponseDTO,
} from './schemas/category.js';
