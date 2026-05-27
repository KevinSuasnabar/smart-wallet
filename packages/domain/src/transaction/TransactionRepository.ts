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

export interface UpdateTransactionPersistInput {
  /** Edited transaction in its post-edit state. The repo reads its new fields. */
  transaction: Transaction;
  /**
   * Signed cents adjustment to apply to the parent wallet's balance:
   * `newDelta - oldDelta`. Zero when only non-amount fields changed.
   */
  walletBalanceDelta: number;
  /**
   * Pre-edit `occurredAt` of the transaction. Used by the repo to detect
   * whether the SK changed (Transaction SK includes occurredAt) and choose
   * between Update (SK unchanged) and Delete-old + Put-new (SK moved).
   */
  oldOccurredAt: Date;
  /**
   * Pre-edit `categoryId` of the transaction. Used by the repo to detect
   * whether the GSI1SK changed (it includes categoryId).
   */
  oldCategoryId: string;
}

export interface UpdateIdempotentInput {
  transaction: Transaction;
  walletId: WalletId;
  walletBalanceDelta: number;
  /**
   * Pre-computed SHA-256 hash scoped to (userId, walletId, transactionId, key).
   * The scope difference vs AddIdempotentInput's hash means PATCH and POST
   * idempotency records cannot collide.
   */
  idempotencyHash: string;
  oldOccurredAt: Date;
  oldCategoryId: string;
}

export interface HardDeleteInput {
  userId: UserId;
  transactionId: TransactionId;
  walletId: WalletId;
  /** Reverse of the original signed delta: `-tx.signedDelta()`. */
  walletBalanceDelta: number;
  /**
   * The transaction's occurredAt at the moment of delete. Needed to construct
   * the SK for the Delete TransactItem (Transaction SK includes occurredAt).
   */
  occurredAt: Date;
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

  /**
   * Persist edits to an existing transaction and adjust the wallet balance in
   * a single 2-op TransactWriteItems:
   *   [0] Transaction Update (ConditionExpression: attribute_exists(PK) AND attribute_not_exists(deletedAt))
   *   [1] Wallet balance Update (ConditionExpression: attribute_exists(PK) AND attribute_not_exists(deletedAt))
   *
   * Errors:
   *   CancellationReasons[0] === ConditionalCheckFailed → transaction missing/deleted.
   *   CancellationReasons[1] === ConditionalCheckFailed → wallet missing/soft-deleted.
   * The use case maps these to TransactionNotFound / WalletNotFound respectively.
   */
  update(input: UpdateTransactionPersistInput): Promise<void>;

  /**
   * Idempotent counterpart of `update`. 3-op TransactWriteItems with an
   * IdempotencyRecord Put. Hash scope includes transactionId (see
   * UpdateIdempotentInput.idempotencyHash). Same replay semantics as
   * addIdempotent.
   */
  updateIdempotent(
    input: UpdateIdempotentInput,
  ): Promise<Result<{ transaction: Transaction; replay: boolean }, TransactionError | WalletError>>;

  /**
   * Hard-delete a transaction and reverse its impact on the wallet balance,
   * atomically via a 2-op TransactWriteItems:
   *   [0] Transaction Delete (ConditionExpression: attribute_exists(PK) AND attribute_exists(SK))
   *   [1] Wallet balance Update (ConditionExpression: attribute_exists(PK) AND attribute_not_exists(deletedAt))
   *
   * Errors:
   *   CancellationReasons[0] → transaction already gone (race) → TransactionNotFound.
   *   CancellationReasons[1] → wallet missing/soft-deleted → WalletNotFound.
   */
  hardDelete(input: HardDeleteInput): Promise<void>;

  /**
   * Sum the amount (in integer cents) of all expense transactions for a user
   * within the UTC interval [from, to), filtered by currency and optionally
   * by categoryId. All DynamoDB pages MUST be drained — Limit applies before
   * FilterExpression and can yield partial pages with zero matching items.
   */
  sumExpensesByPeriod(
    userId: UserId,
    filter: { from: Date; to: Date; currency: string; categoryId?: string },
  ): Promise<number>;
}
