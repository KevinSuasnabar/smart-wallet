import { AggregateRoot } from '../shared/AggregateRoot.js';
import { ok, err } from '../shared/Result.js';
import type { Result } from '../shared/Result.js';
import type { Clock } from '../shared/Clock.js';
import type { UserId } from '../user/UserId.js';
import type { WalletId } from '../wallet/WalletId.js';
import type { Money } from '../transaction/Money.js';
import type { TransactionType } from '../transaction/TransactionType.js';
import type { RecurringTransactionId } from './RecurringTransactionId.js';
import {
  InvalidDayOfMonth,
  InvalidRecurringDescription,
  type RecurringError,
} from './RecurringError.js';
import { nextDayOfMonthOnOrAfter, addOneMonth } from './dateMath.js';

const MAX_DESCRIPTION_LENGTH = 256;
const MIN_DAY_OF_MONTH = 1;
const MAX_DAY_OF_MONTH = 31;

const normalizeDescription = (raw: string | null): string | null => {
  if (raw === null) return null;
  const trimmed = raw.trim();
  return trimmed === '' ? null : trimmed;
};

const validateDayOfMonth = (day: number): boolean =>
  Number.isInteger(day) && day >= MIN_DAY_OF_MONTH && day <= MAX_DAY_OF_MONTH;

export interface RecurringTransactionProps {
  walletId: WalletId;
  userId: UserId;
  type: TransactionType;
  amount: Money;
  categoryId: string;
  description: string | null;
  cadence: 'monthly';
  dayOfMonth: number;
  nextOccurrenceAt: Date;
  lastMaterializedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateRecurringTransactionProps {
  id: RecurringTransactionId;
  walletId: WalletId;
  userId: UserId;
  type: TransactionType;
  amount: Money;
  categoryId: string;
  description: string | null;
  dayOfMonth: number;
  clock: Clock;
}

export interface RecurringEdits {
  amount?: Money;
  description?: string | null;
  categoryId?: string;
  dayOfMonth?: number;
}

export interface RecurringMaterializationOutcome {
  transactionDraft: {
    walletId: WalletId;
    userId: UserId;
    type: TransactionType;
    amount: Money;
    categoryId: string;
    description: string | null;
    occurredAt: Date;
  };
  nextOccurrenceAt: Date;
  materializedAt: Date;
}

export class RecurringTransaction extends AggregateRoot<RecurringTransactionId> {
  private _props: RecurringTransactionProps;

  private constructor(
    id: RecurringTransactionId,
    props: RecurringTransactionProps,
  ) {
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

  get cadence(): 'monthly' {
    return this._props.cadence;
  }

  get dayOfMonth(): number {
    return this._props.dayOfMonth;
  }

  get nextOccurrenceAt(): Date {
    return this._props.nextOccurrenceAt;
  }

  get lastMaterializedAt(): Date | null {
    return this._props.lastMaterializedAt;
  }

  get createdAt(): Date {
    return this._props.createdAt;
  }

  get updatedAt(): Date {
    return this._props.updatedAt;
  }

  // ── Factory ───────────────────────────────────────────────────────────────

  static create(
    p: CreateRecurringTransactionProps,
  ): Result<RecurringTransaction, RecurringError> {
    if (!validateDayOfMonth(p.dayOfMonth)) {
      return err(new InvalidDayOfMonth());
    }
    const description = normalizeDescription(p.description);
    if (description !== null && description.length > MAX_DESCRIPTION_LENGTH) {
      return err(new InvalidRecurringDescription());
    }
    const now = p.clock.now();
    const nextOccurrenceAt = nextDayOfMonthOnOrAfter(now, p.dayOfMonth);

    return ok(
      new RecurringTransaction(p.id, {
        walletId: p.walletId,
        userId: p.userId,
        type: p.type,
        amount: p.amount,
        categoryId: p.categoryId,
        description,
        cadence: 'monthly',
        dayOfMonth: p.dayOfMonth,
        nextOccurrenceAt,
        lastMaterializedAt: null,
        createdAt: now,
        updatedAt: now,
      }),
    );
  }

  static rehydrate(
    id: RecurringTransactionId,
    props: RecurringTransactionProps,
  ): RecurringTransaction {
    return new RecurringTransaction(id, props);
  }

  // ── Edits ─────────────────────────────────────────────────────────────────

  /**
   * Applies partial edits. Rolls back to a snapshot on validation failure so
   * the entity is never left in a partial state. Categories' type-match is
   * enforced by the use case, not here, because the domain has no access to
   * the category repository.
   */
  applyEdits(
    edits: RecurringEdits,
    clock: Clock,
  ): Result<void, RecurringError> {
    const snapshot: RecurringTransactionProps = { ...this._props };

    if (edits.description !== undefined) {
      const normalized = normalizeDescription(edits.description);
      if (
        normalized !== null &&
        normalized.length > MAX_DESCRIPTION_LENGTH
      ) {
        this._props = snapshot;
        return err(new InvalidRecurringDescription());
      }
      this._props.description = normalized;
    }

    if (edits.amount !== undefined) {
      this._props.amount = edits.amount;
    }

    if (edits.categoryId !== undefined) {
      this._props.categoryId = edits.categoryId;
    }

    if (edits.dayOfMonth !== undefined) {
      if (!validateDayOfMonth(edits.dayOfMonth)) {
        this._props = snapshot;
        return err(new InvalidDayOfMonth());
      }
      this._props.dayOfMonth = edits.dayOfMonth;
      // Recompute nextOccurrenceAt from the LATER of (current next, now) so
      // that changing day-of-month never retroactively materializes back to
      // a prior period.
      const now = clock.now();
      const anchor =
        this._props.nextOccurrenceAt > now ? this._props.nextOccurrenceAt : now;
      this._props.nextOccurrenceAt = nextDayOfMonthOnOrAfter(
        anchor,
        edits.dayOfMonth,
      );
    }

    this._props.updatedAt = clock.now();
    return ok(undefined);
  }

  // ── Materialization ──────────────────────────────────────────────────────

  /**
   * Computes the transaction draft and the advanced `nextOccurrenceAt` for
   * one materialization step. Pure — does not mutate the entity. The repo
   * persists; after success, the caller invokes `applyMaterializationOutcome`.
   */
  materializeOne(now: Date): RecurringMaterializationOutcome {
    const occurredAt = this._props.nextOccurrenceAt;
    const advanced = addOneMonth(occurredAt);
    const nextOccurrenceAt = nextDayOfMonthOnOrAfter(
      advanced,
      this._props.dayOfMonth,
    );
    return {
      transactionDraft: {
        walletId: this._props.walletId,
        userId: this._props.userId,
        type: this._props.type,
        amount: this._props.amount,
        categoryId: this._props.categoryId,
        description: this._props.description,
        occurredAt,
      },
      nextOccurrenceAt,
      materializedAt: now,
    };
  }

  applyMaterializationOutcome(
    nextOccurrenceAt: Date,
    materializedAt: Date,
  ): void {
    this._props.nextOccurrenceAt = nextOccurrenceAt;
    this._props.lastMaterializedAt = materializedAt;
    this._props.updatedAt = materializedAt;
  }
}
