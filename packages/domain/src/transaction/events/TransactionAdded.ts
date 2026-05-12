import type { DomainEvent } from '../../shared/DomainEvent.js';
import type { Currency } from '../../shared/Currency.js';
import type { TransactionType } from '../TransactionType.js';

export interface TransactionAdded extends DomainEvent {
  readonly eventName: 'TransactionAdded';
  readonly transactionId: string;
  readonly walletId: string;
  readonly userId: string;
  readonly type: TransactionType;
  /** Strictly positive cents value — the raw amount of the transaction. */
  readonly amountCents: number;
  /** Positive for income, negative for expense — the signed wallet balance delta. */
  readonly signedDelta: number;
  readonly currency: Currency;
  readonly categoryId: string;
}
