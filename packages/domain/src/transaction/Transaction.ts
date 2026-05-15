import { AggregateRoot } from '../shared/AggregateRoot.js';
import { ok, err } from '../shared/Result.js';
import type { Result } from '../shared/Result.js';
import type { Clock } from '../shared/Clock.js';
import type { TransactionId } from './TransactionId.js';
import type { WalletId } from '../wallet/WalletId.js';
import type { UserId } from '../user/UserId.js';
import type { Money } from './Money.js';
import type { TransactionType } from './TransactionType.js';
import type { TransactionAdded } from './events/TransactionAdded.js';
import {
  InvalidDescription,
  InvalidOccurredAt,
  InvalidCategoryReference,
} from './TransactionError.js';
import type { TransactionError } from './TransactionError.js';
import { detectCategoryIdShape } from './categoryReference.js';

/** Five years in milliseconds — lower boundary for occurredAt validation. */
const FIVE_YEARS_MS = 5 * 365.25 * 24 * 60 * 60 * 1000;
/** One day in milliseconds — upper boundary for occurredAt validation. */
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

const MAX_DESCRIPTION_LENGTH = 256;

export interface TransactionProps {
  walletId: WalletId;
  userId: UserId;
  type: TransactionType;
  amount: Money;
  categoryId: string;
  /** Trimmed description (1–256 chars), or null when absent. */
  description: string | null;
  occurredAt: Date;
  createdAt: Date;
  updatedAt: Date;
  /** null when active; set to a Date on soft-delete. */
  deletedAt: Date | null;
}

export interface CreateTransactionProps {
  id: TransactionId;
  walletId: WalletId;
  userId: UserId;
  type: TransactionType;
  /** Money VO — amount must already be validated as strictly positive integer cents. */
  amount: Money;
  /** categoryId string — structurally validated here; semantic check deferred to use case. */
  categoryId: string;
  /** Optional raw description string; null or empty string normalises to null. */
  description: string | null;
  /** User-provided timestamp for when the transaction occurred. */
  occurredAt: Date;
  clock: Clock;
}

export class Transaction extends AggregateRoot<TransactionId> {
  private _props: TransactionProps;

  private constructor(id: TransactionId, props: TransactionProps) {
    super(id);
    this._props = props;
  }

  // ── Accessors ────────────────────────────────────────────────────────────

  get walletId(): WalletId {
    return this._props.walletId;
  }

  get userId(): UserId {
    return this._props.userId;
  }

  get type(): TransactionType {
    return this._props.type;
  }

  get amount(): Money {
    return this._props.amount;
  }

  get categoryId(): string {
    return this._props.categoryId;
  }

  get description(): string | null {
    return this._props.description;
  }

  get occurredAt(): Date {
    return this._props.occurredAt;
  }

  get createdAt(): Date {
    return this._props.createdAt;
  }

  get updatedAt(): Date {
    return this._props.updatedAt;
  }

  get deletedAt(): Date | null {
    return this._props.deletedAt;
  }

  // ── Factory ───────────────────────────────────────────────────────────────

  static create(props: CreateTransactionProps): Result<Transaction, TransactionError> {
    // Validate description (if present, must be 1–256 chars after trim; empty normalises to null)
    const rawDescription = props.description?.trim() ?? null;
    const description = rawDescription === '' ? null : rawDescription;
    if (description !== null && description.length > MAX_DESCRIPTION_LENGTH) {
      return err(new InvalidDescription());
    }

    // Validate occurredAt is within [now − 5 years, now + 1 day]
    const now = props.clock.now();
    const lowerBound = new Date(now.getTime() - FIVE_YEARS_MS);
    const upperBound = new Date(now.getTime() + ONE_DAY_MS);
    if (props.occurredAt < lowerBound || props.occurredAt > upperBound) {
      return err(new InvalidOccurredAt());
    }

    // Structural category ID check — semantic check (exists + type-match) is wired in T-05-05
    const categoryShape = detectCategoryIdShape(props.categoryId);
    if (categoryShape === null) {
      return err(new InvalidCategoryReference());
    }

    const transaction = new Transaction(props.id, {
      walletId: props.walletId,
      userId: props.userId,
      type: props.type,
      amount: props.amount,
      categoryId: props.categoryId,
      description,
      occurredAt: props.occurredAt,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });

    // Signed delta: positive for income, negative for expense
    const signedDelta =
      props.type === 'income' ? props.amount.amount : props.amount.negate().amount;

    const event: TransactionAdded = {
      eventName: 'TransactionAdded',
      aggregateId: props.id.value,
      occurredAt: now,
      transactionId: props.id.value,
      walletId: props.walletId.value,
      userId: props.userId.value,
      type: props.type,
      amountCents: props.amount.amount,
      signedDelta,
      currency: props.amount.currency,
      categoryId: props.categoryId,
    };

    transaction.addDomainEvent(event);

    return ok(transaction);
  }

  // ── Rehydration ──────────────────────────────────────────────────────────

  /**
   * Reconstruct a Transaction from persisted storage without running create() validations.
   * ONLY for use in adapters (DynamoDB repositories). Trusts the stored data is valid.
   */
  static rehydrate(
    id: TransactionId,
    props: TransactionProps,
  ): Transaction {
    return new Transaction(id, props);
  }

  // ── Methods ───────────────────────────────────────────────────────────────

  /**
   * Soft-delete this transaction.
   * NOTE: not used by the current hard-delete flow (see DeleteTransaction use
   * case). Kept for schema completeness and possible future audit/undo.
   */
  softDelete(clock: Clock): void {
    if (this._props.deletedAt !== null) return;
    const now = clock.now();
    this._props.deletedAt = now;
    this._props.updatedAt = now;
  }

  /**
   * Returns the signed integer-cents delta this transaction contributes to its
   * wallet balance: positive for income, negative for expense. Single source
   * of truth for balance math in UpdateTransaction and DeleteTransaction.
   */
  signedDelta(): number {
    return this._props.type === 'income'
      ? this._props.amount.amount
      : this._props.amount.negate().amount;
  }

  /**
   * Apply a partial edit in place. Only call from the UpdateTransaction use
   * case — callers are responsible for resolving the new Money VO and for
   * validating category membership against the (immutable) transaction type
   * before invoking this method.
   *
   * Field validators that DO live here:
   *  - description length (≤ 256 chars; trimmed; empty → null)
   *  - occurredAt range ([now − 5y, now + 1d])
   *
   * On success, bumps `updatedAt`. On failure, leaves the entity untouched.
   */
  applyEdits(
    edits: {
      amount?: Money;
      description?: string | null;
      categoryId?: string;
      occurredAt?: Date;
    },
    clock: Clock,
  ): Result<void, TransactionError> {
    // Snapshot to roll back on failure (avoid partial in-place mutation).
    const snapshot: TransactionProps = { ...this._props };

    if (edits.description !== undefined) {
      const trimmed =
        edits.description === null ? null : edits.description.trim();
      const normalized = trimmed === '' ? null : trimmed;
      if (normalized !== null && normalized.length > MAX_DESCRIPTION_LENGTH) {
        return err(new InvalidDescription());
      }
      this._props.description = normalized;
    }

    if (edits.occurredAt !== undefined) {
      const now = clock.now();
      const lowerBound = new Date(now.getTime() - FIVE_YEARS_MS);
      const upperBound = new Date(now.getTime() + ONE_DAY_MS);
      if (edits.occurredAt < lowerBound || edits.occurredAt > upperBound) {
        this._props = snapshot;
        return err(new InvalidOccurredAt());
      }
      this._props.occurredAt = edits.occurredAt;
    }

    if (edits.amount !== undefined) {
      this._props.amount = edits.amount;
    }

    if (edits.categoryId !== undefined) {
      this._props.categoryId = edits.categoryId;
    }

    this._props.updatedAt = clock.now();
    return ok(undefined);
  }
}
