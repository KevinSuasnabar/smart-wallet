import type { DomainEvent } from '../../shared/DomainEvent.js';
import type { Currency } from '../../shared/Currency.js';

export interface WalletCreated extends DomainEvent {
  readonly eventName: 'WalletCreated';
  readonly walletId: string;
  readonly userId: string;
  readonly currency: Currency;
}
