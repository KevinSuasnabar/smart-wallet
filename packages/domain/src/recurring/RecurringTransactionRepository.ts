import type { RecurringTransaction } from './RecurringTransaction.js';
import type { RecurringTransactionId } from './RecurringTransactionId.js';
import type { TransactionId } from '../transaction/TransactionId.js';
import type { UserId } from '../user/UserId.js';

export interface CreateRecurringPersistInput {
  recurring: RecurringTransaction;
}

export interface UpdateRecurringPersistInput {
  recurring: RecurringTransaction;
}

export interface MaterializeOneInput {
  recurring: RecurringTransaction;
  transactionId: TransactionId;
  nextOccurrenceAt: Date;
  materializedAt: Date;
}

export interface RecurringTransactionRepository {
  /** Persist a new recurring; primary item PK/SK + GSI1 keys. */
  create(input: CreateRecurringPersistInput): Promise<void>;

  /** Returns null when not found (or not owned by user). */
  findById(
    userId: UserId,
    recurringId: RecurringTransactionId,
  ): Promise<RecurringTransaction | null>;

  /** Lists all recurrings for the user, sorted ASC by `nextOccurrenceAt`. */
  listByUser(userId: UserId): Promise<RecurringTransaction[]>;

  /**
   * Lists recurrings whose `nextOccurrenceAt <= now`, up to `limit`. Backed
   * by GSI1 with `KeyConditionExpression: GSI1PK = :pk AND GSI1SK BETWEEN
   * 'RECURNEXT#' AND 'RECURNEXT#{nowIso}#~'`.
   */
  listPending(
    userId: UserId,
    now: Date,
    limit: number,
  ): Promise<RecurringTransaction[]>;

  /** Persist edits (re-syncs SK + GSI1SK if `nextOccurrenceAt` changed). */
  update(input: UpdateRecurringPersistInput): Promise<void>;

  /** Hard-delete the recurring item. Does NOT touch materialized transactions. */
  hardDelete(input: {
    userId: UserId;
    recurringId: RecurringTransactionId;
  }): Promise<void>;

  /**
   * Atomically materialize one period:
   *   [0] Put new Transaction (UUID collision guard)
   *   [1] Update wallet balance (existence + not-deleted guard)
   *   [2] Update recurring with ConditionExpression nextOccurrenceAt = :expected
   *
   * On the recurring condition failing, throws an Error with
   * `name === 'RecurringRaceLost'` — the use case catches and skips.
   *
   * On the wallet condition failing, throws an Error with
   * `name === 'RecurringWalletNotFound'` — the use case propagates.
   */
  materializeOne(
    input: MaterializeOneInput,
  ): Promise<{ transactionId: TransactionId }>;
}
