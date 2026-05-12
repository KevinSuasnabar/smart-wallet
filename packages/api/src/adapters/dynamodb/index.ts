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
