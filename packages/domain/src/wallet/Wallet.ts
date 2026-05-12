import { AggregateRoot } from '../shared/AggregateRoot.js';
import { ok, err } from '../shared/Result.js';
import type { Result } from '../shared/Result.js';
import type { Clock } from '../shared/Clock.js';
import type { Currency } from '../shared/Currency.js';
import type { WalletId } from './WalletId.js';
import type { UserId } from '../user/UserId.js';
import { InvalidWalletName, InvalidWalletCurrency } from './WalletError.js';
import type { WalletError } from './WalletError.js';
import type { WalletCreated } from './events/WalletCreated.js';

const VALID_CURRENCIES: readonly Currency[] = ['USD', 'PEN'];

export interface WalletProps {
  userId: UserId;
  name: string;
  currency: Currency;
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

    const currency = props.currency as Currency;
    const now = props.clock.now();

    const wallet = new Wallet(props.walletId, {
      userId: props.userId,
      name: trimmedName,
      currency,
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
}
