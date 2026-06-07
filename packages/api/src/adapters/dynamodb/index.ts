// ── DynamoDB client + config ──────────────────────────────────────────────
export { ddb, TABLE_NAME, GSI1_NAME } from './DynamoDBClient.js';

// ── Key builders ──────────────────────────────────────────────────────────
export {
  userPK,
  walletSK,
  transactionSK,
  categorySK,
  idempotencySK,
  transactionGsi1SK,
  walletSKPrefix,
  transactionSKPrefix,
  categorySKPrefix,
  recurringSK,
  recurringSKPrefix,
  recurringGsi1SK,
  recurringGsi1SKPrefix,
  budgetSK,
  budgetSKPrefix,
  telegramLinkPK,
  telegramLinkSK,
  telegramTokenSK,
} from './keyBuilders.js';

// ── Cursor codec ──────────────────────────────────────────────────────────
export { encodeCursor, decodeCursor } from './cursor.js';

// ── Mappers ───────────────────────────────────────────────────────────────
export { walletToItem, itemToWallet } from './mappers/WalletMapper.js';
export type { WalletItem } from './mappers/WalletMapper.js';

export { transactionToItem, itemToTransaction } from './mappers/TransactionMapper.js';
export type { TransactionItem } from './mappers/TransactionMapper.js';

export { categoryToItem, itemToCategory } from './mappers/CategoryMapper.js';
export type { CategoryItem } from './mappers/CategoryMapper.js';

export { recurringToItem, itemToRecurring } from './mappers/RecurringMapper.js';
export type { RecurringItem } from './mappers/RecurringMapper.js';

export { budgetToItem, itemToBudget } from './mappers/BudgetMapper.js';
export type { BudgetItem } from './mappers/BudgetMapper.js';

// ── Repositories ──────────────────────────────────────────────────────────
export { DynamoDBWalletRepository } from './repositories/DynamoDBWalletRepository.js';
export {
  DynamoDBTransactionRepository,
  isTransactionCanceledException,
} from './repositories/DynamoDBTransactionRepository.js';
export type {
  TransactionCanceledError,
  CancellationReason,
} from './repositories/DynamoDBTransactionRepository.js';
export { DynamoDBCategoryRepository } from './repositories/DynamoDBCategoryRepository.js';
export { DynamoDBRecurringTransactionRepository } from './repositories/DynamoDBRecurringTransactionRepository.js';
export { DynamoDBBudgetRepository } from './repositories/DynamoDBBudgetRepository.js';
export { DynamoDBTelegramSessionRepository } from './repositories/DynamoDBTelegramSessionRepository.js';
export { DynamoDBTelegramLinkRepository } from './repositories/DynamoDBTelegramLinkRepository.js';
export { DynamoDBTelegramLinkTokenRepository } from './repositories/DynamoDBTelegramLinkTokenRepository.js';
export { DynamoDBMonthlyAggregateRepository } from './repositories/DynamoDBMonthlyAggregateRepository.js';
