import type { Transaction } from './Transaction.js';
import type { TransactionId } from './TransactionId.js';
import type { TransactionType } from './TransactionType.js';
import type { UserId } from '../user/UserId.js';
import type { WalletId } from '../wallet/WalletId.js';
import type { Result } from '../shared/Result.js';
import type { TransactionError } from './TransactionError.js';
import type { WalletError } from '../wallet/WalletError.js';

export interface ListByWalletFilter {
  from?: Date;
  to?: Date;
  type?: TransactionType;
  categoryId?: string;
  limit: number;
  cursor?: string;
}

export interface ListByCategoryFilter {
  from?: Date;
  to?: Date;
  limit: number;
  cursor?: string;
}

export interface IdempotencyRecord {
  pk: string;
  sk: string;
  /** Unix epoch seconds — DynamoDB native TTL attribute. */
  ttlEpochSeconds: number;
}

export interface AddTransactionPersistInput {
  transaction: Transaction;
  /** Signed cents: positive for income, negative for expense. Wallet balance is updated atomically. */
  walletBalanceDelta: number;
}

export interface AddIdempotentInput {
  transaction: Transaction;
  /** Signed cents: positive for income, negative for expense. Wallet balance is updated atomically. */
  walletBalanceDelta: number;
  walletId: WalletId;
  /**
   * Pre-computed 32 hex char SHA-256 hash of (userId + ':' + walletId + ':' + idempotencyKey).
   * Computed at the handler boundary (api layer) — domain never touches Node crypto.
   */
  idempotencyHash: string;
}

export interface TransactionRepository {
  /**
   * Persist a new transaction and atomically update the wallet balance.
   * Uses a 2-op TransactWriteItems (Transaction Put + Wallet balance Update).
   * No idempotency record written — use `addIdempotent` for the idempotent path.
   */
  add(input: AddTransactionPersistInput): Promise<void>;

  /**
   * Persist a new transaction idempotently via a 3-op TransactWriteItems:
   *   [0] Transaction Put (ConditionExpression: attribute_not_exists(PK))
   *   [1] Wallet balance Update (ConditionExpression: attribute_exists(PK) AND attribute_not_exists(deletedAt))
   *   [2] IdempotencyRecord Put (ConditionExpression: attribute_not_exists(PK))
   *
   * On first call → creates transaction + idempotency record, returns { transaction, replay: false }.
   * On retry (same idempotencyHash) → CancellationReasons[2].Code === 'ConditionalCheckFailed',
   *   reads the IdempotencyRecord, fetches the original Transaction, returns { transaction, replay: true }.
   * On wallet missing/deleted (CancellationReasons[1]) → returns err(WalletNotFound).
   * On transaction id collision (CancellationReasons[0]) → returns err indicating internal error.
   */
  addIdempotent(
    input: AddIdempotentInput,
  ): Promise<Result<{ transaction: Transaction; replay: boolean }, TransactionError | WalletError>>;

  findById(userId: UserId, transactionId: TransactionId): Promise<Transaction | null>;

  listByWallet(
    userId: UserId,
    walletId: WalletId,
    filter: ListByWalletFilter,
  ): Promise<{ items: Transaction[]; nextCursor?: string }>;

  listByCategory(
    userId: UserId,
    categoryId: string,
    filter: ListByCategoryFilter,
  ): Promise<{ items: Transaction[]; nextCursor?: string }>;

  /**
   * Look up a prior transaction by its idempotency record SK.
   * Returns null when the record has expired (TTL) or was never created.
   * @deprecated Superseded by addIdempotent() which handles replay internally.
   */
  findIdempotentTransactionId(
    userId: UserId,
    idempotencyRecordSk: string,
  ): Promise<TransactionId | null>;
}
