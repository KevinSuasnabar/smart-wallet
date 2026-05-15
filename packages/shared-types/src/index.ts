// Currencies
export { CURRENCIES, currencyDecimals, zCurrency } from './currencies.js';
export type { Currency } from './currencies.js';

// Wallet colors
export { WALLET_COLORS, zWalletColor, isWalletColor } from './wallet-colors.js';
export type { WalletColor } from './wallet-colors.js';

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
export { decimalStringToCents, centsToDecimalString, zDecimalString } from './money.js';

// Pagination
export { zCursor, zLimit, zPaginatedResponse } from './pagination.js';
export type { PaginatedResponse } from './pagination.js';

// Date
export { zIso8601 } from './date.js';

// Common schemas
export { zUuid, zUserId, zWalletId, zTransactionId, zCategoryId, zCategoryIdLike, zIdempotencyKey } from './schemas/common.js';

// Wallet schemas + DTOs
export {
  CreateWalletRequestSchema,
  WalletResponseSchema,
  ListWalletsResponseSchema,
  ListWalletsQuerySchema,
  WalletIdPathSchema,
  UpdateWalletRequestSchema,
} from './schemas/wallet.js';
export type {
  CreateWalletDTO,
  WalletResponseDTO,
  ListWalletsResponseDTO,
  ListWalletsQueryDTO,
  WalletIdPathDTO,
  UpdateWalletDTO,
} from './schemas/wallet.js';

// Transaction schemas + DTOs
export {
  zOccurredAt,
  AddTransactionRequestSchema,
  TransactionResponseSchema,
  ListTransactionsResponseSchema,
  ListTransactionsByWalletQuerySchema,
  ListTransactionsByCategoryQuerySchema,
  TransactionIdPathSchema,
  UpdateTransactionRequestSchema,
} from './schemas/transaction.js';
export type {
  AddTransactionDTO,
  TransactionResponseDTO,
  ListTransactionsResponseDTO,
  ListTransactionsByWalletQueryDTO,
  ListTransactionsByCategoryQueryDTO,
  TransactionIdPathDTO,
  UpdateTransactionDTO,
} from './schemas/transaction.js';

// Category schemas + DTOs
export {
  CreateCustomCategoryRequestSchema,
  UpdateCategoryRequestSchema,
  CategoryResponseSchema,
  PredefinedCategoryResponseSchema,
  ListCategoriesResponseSchema,
  CategoryIdPathSchema,
} from './schemas/category.js';
export type {
  CreateCustomCategoryDTO,
  UpdateCategoryDTO,
  CategoryResponseDTO,
  PredefinedCategoryResponseDTO,
  ListCategoriesResponseDTO,
  CategoryIdPathDTO,
} from './schemas/category.js';

// Recurring transaction schemas + DTOs
export {
  RecurringIdPathSchema,
  CreateRecurringRequestSchema,
  UpdateRecurringRequestSchema,
  RecurringResponseSchema,
  ListRecurringResponseSchema,
  MaterializeRecurringResponseSchema,
} from './schemas/recurring.js';
export type {
  RecurringIdPathDTO,
  CreateRecurringDTO,
  UpdateRecurringDTO,
  RecurringResponseDTO,
  ListRecurringResponseDTO,
  MaterializeRecurringResponseDTO,
} from './schemas/recurring.js';
