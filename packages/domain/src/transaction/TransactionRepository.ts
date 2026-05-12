import type { Transaction } from './Transaction.js';
import type { TransactionId } from './TransactionId.js';
import type { TransactionType } from './TransactionType.js';
import type { UserId } from '../user/UserId.js';
import type { WalletId } from '../wallet/WalletId.js';

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
  /** Present when the request carries an Idempotency-Key header (Slice 10 — deferred to PR3). */
  idempotencyRecord?: IdempotencyRecord;
}

export interface TransactionRepository {
  /**
   * Persist a new transaction and atomically update the wallet balance.
   * Uses TransactWriteItems (2 ops normally; 3 ops with idempotency record).
   */
  add(input: AddTransactionPersistInput): Promise<void>;

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
   * Used by the idempotency replay path (Slice 10 — deferred to PR3).
   */
  findIdempotentTransactionId(
    userId: UserId,
    idempotencyRecordSk: string,
  ): Promise<TransactionId | null>;
}
