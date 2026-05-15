import { AggregateRoot } from '../shared/AggregateRoot.js';
import { ok, err } from '../shared/Result.js';
import type { Result } from '../shared/Result.js';
import type { Clock } from '../shared/Clock.js';
import type { Currency } from '../shared/Currency.js';
import { isWalletColor } from '../shared/WalletColor.js';
import type { WalletColor } from '../shared/WalletColor.js';
import type { WalletId } from './WalletId.js';
import type { UserId } from '../user/UserId.js';
import {
  InvalidWalletName,
  InvalidWalletCurrency,
  InvalidWalletColor,
} from './WalletError.js';
import type { WalletError } from './WalletError.js';
import type { WalletCreated } from './events/WalletCreated.js';

const VALID_CURRENCIES: readonly Currency[] = ['USD', 'PEN'];

export interface WalletProps {
  userId: UserId;
  name: string;
  currency: Currency;
  color: WalletColor;
  /** Integer cents — always 0 at creation; may go negative if expenses exceed income. */
  balance: number;
  createdAt: Date;
  updatedAt: Date;
  /** null when the wallet is active; set to a Date on soft-delete. */
  deletedAt: Date | null;
}

export interface CreateWalletProps {
  walletId: WalletId;
  userId: UserId;
  name: string;
  currency: string;
  color: string;
  clock: Clock;
}

export class Wallet extends AggregateRoot<WalletId> {
  private _props: WalletProps;

  private constructor(id: WalletId, props: WalletProps) {
    super(id);
    this._props = props;
  }

  // ── Accessors ────────────────────────────────────────────────────────────

  get userId(): UserId {
    return this._props.userId;
  }

  get name(): string {
    return this._props.name;
  }

  get currency(): Currency {
    return this._props.currency;
  }

  get color(): WalletColor {
    return this._props.color;
  }

  get balance(): number {
    return this._props.balance;
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

  static create(props: CreateWalletProps): Result<Wallet, WalletError> {
    const trimmedName = props.name.trim();

    if (trimmedName.length === 0 || trimmedName.length > 64) {
      return err(new InvalidWalletName());
    }

    if (!(VALID_CURRENCIES as readonly string[]).includes(props.currency)) {
      return err(new InvalidWalletCurrency());
    }

    if (!isWalletColor(props.color)) {
      return err(new InvalidWalletColor());
    }

    const currency = props.currency as Currency;
    const now = props.clock.now();

    const wallet = new Wallet(props.walletId, {
      userId: props.userId,
      name: trimmedName,
      currency,
      color: props.color,
      balance: 0,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });

    const event: WalletCreated = {
      eventName: 'WalletCreated',
      aggregateId: props.walletId.value,
      occurredAt: now,
      walletId: props.walletId.value,
      userId: props.userId.value,
      currency,
    };

    wallet.addDomainEvent(event);

    return ok(wallet);
  }

  // ── Rehydration ──────────────────────────────────────────────────────────

  /**
   * Reconstruct a Wallet from persisted storage without running create() validations.
   * ONLY for use in adapters (DynamoDB repositories). Trusts the stored data is valid.
   */
  static rehydrate(
    id: WalletId,
    props: WalletProps,
  ): Wallet {
    return new Wallet(id, props);
  }

  // ── Methods ───────────────────────────────────────────────────────────────

  /**
   * Soft-delete this wallet. Idempotent: if already deleted, returns ok(void)
   * without updating updatedAt (the original deletion timestamp is preserved).
   *
   * NOTE: no DELETE endpoint exists in MVP — this method exists for schema
   * completeness and future use.
   */
  softDelete(clock: Clock): Result<void, WalletError> {
    if (this._props.deletedAt !== null) {
      return ok(undefined);
    }
    const now = clock.now();
    this._props.deletedAt = now;
    this._props.updatedAt = now;
    return ok(undefined);
  }

  /**
   * Apply a signed balance delta (positive = income, negative = expense) and
   * advance updatedAt. Called by the repository after a successful
   * TransactWriteItems — the wallet item was already updated in DynamoDB,
   * this method keeps the in-memory state consistent.
   */
  applyTransactionDelta(delta: number, clock: Clock): Result<void, WalletError> {
    this._props.balance += delta;
    this._props.updatedAt = clock.now();
    return ok(undefined);
  }

  /**
   * Apply a partial edit in place. Validates each provided field with the
   * factory's validators. Rolls back to the pre-call state on any failure.
   *
   * The use case is responsible for higher-level checks like "is this wallet
   * allowed to change currency given its transactions?".
   */
  applyEdits(
    edits: { name?: string; currency?: string; color?: string },
    clock: Clock,
  ): Result<void, WalletError> {
    const snapshot: WalletProps = { ...this._props };

    if (edits.name !== undefined) {
      const trimmed = edits.name.trim();
      if (trimmed.length === 0 || trimmed.length > 64) {
        return err(new InvalidWalletName());
      }
      this._props.name = trimmed;
    }

    if (edits.currency !== undefined) {
      if (!VALID_CURRENCIES.includes(edits.currency as Currency)) {
        this._props = snapshot;
        return err(new InvalidWalletCurrency());
      }
      this._props.currency = edits.currency as Currency;
    }

    if (edits.color !== undefined) {
      if (!isWalletColor(edits.color)) {
        this._props = snapshot;
        return err(new InvalidWalletColor());
      }
      this._props.color = edits.color;
    }

    this._props.updatedAt = clock.now();
    return ok(undefined);
  }
}
