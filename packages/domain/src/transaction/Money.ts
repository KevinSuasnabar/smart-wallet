import { ValueObject } from '../shared/ValueObject.js';
import { ok, err } from '../shared/Result.js';
import type { Result } from '../shared/Result.js';
import type { Currency } from '../shared/Currency.js';
import { InvalidMoneyAmount, CurrencyMismatch } from './TransactionError.js';

interface MoneyProps {
  amount: number;
  currency: Currency;
}

export class Money extends ValueObject<MoneyProps> {
  private constructor(props: MoneyProps) {
    super(props);
  }

  get amount(): number {
    return this.props.amount;
  }

  get currency(): Currency {
    return this.props.currency;
  }

  /**
   * Create a Money value object.
   * `amount` must be a strictly positive safe integer (cents).
   * Sign is always positive here — negative deltas emerge from TransactionType ('expense').
   */
  static create(amount: number, currency: Currency): Result<Money, InvalidMoneyAmount> {
    if (!Number.isInteger(amount) || amount <= 0 || amount >= Number.MAX_SAFE_INTEGER) {
      return err(new InvalidMoneyAmount());
    }
    return ok(new Money({ amount, currency }));
  }

  /** Return a zero-amount sentinel in the given currency (useful for balance initialisation). */
  static zero(currency: Currency): Money {
    // Bypass the positive-only constructor — zero is only valid as an initial balance, not as a transaction amount.
    return new Money({ amount: 0, currency });
  }

  /** Add another Money of the same currency. Returns CurrencyMismatch on currency disagreement. */
  add(other: Money): Result<Money, CurrencyMismatch> {
    if (this.props.currency !== other.props.currency) {
      return err(new CurrencyMismatch());
    }
    return ok(new Money({ amount: this.props.amount + other.props.amount, currency: this.props.currency }));
  }

  /** Subtract another Money of the same currency. Returns CurrencyMismatch on currency disagreement. */
  subtract(other: Money): Result<Money, CurrencyMismatch> {
    if (this.props.currency !== other.props.currency) {
      return err(new CurrencyMismatch());
    }
    return ok(new Money({ amount: this.props.amount - other.props.amount, currency: this.props.currency }));
  }

  /**
   * Return a new Money with the amount sign flipped.
   * INTERNAL USE ONLY — used by balance delta math (e.g., expense produces a negative delta).
   * Do NOT expose negated Money to use cases or transport; the sign lives in TransactionType.
   */
  negate(): Money {
    return new Money({ amount: -this.props.amount, currency: this.props.currency });
  }
}
