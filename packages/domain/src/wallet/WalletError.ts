import { DomainError } from '../shared/DomainError.js';

export class InvalidWalletId extends DomainError {
  readonly tag = 'domain.wallet.invalid_id' as const;
  readonly httpStatus = 400 as const;

  constructor(message = 'Invalid wallet identifier') {
    super(message);
  }
}

export class InvalidWalletName extends DomainError {
  readonly tag = 'domain.wallet.invalid_name' as const;
  readonly httpStatus = 400 as const;

  constructor(message = 'Wallet name must be 1–64 non-empty characters') {
    super(message);
  }
}

export class InvalidWalletCurrency extends DomainError {
  readonly tag = 'domain.wallet.invalid_currency' as const;
  readonly httpStatus = 400 as const;

  constructor(message = 'Currency must be USD or PEN') {
    super(message);
  }
}

export class WalletAlreadyDeleted extends DomainError {
  readonly tag = 'domain.wallet.already_deleted' as const;
  readonly httpStatus = 404 as const;

  constructor(message = 'Wallet has already been deleted') {
    super(message);
  }
}

export class WalletNotFound extends DomainError {
  readonly tag = 'domain.wallet.not_found' as const;
  readonly httpStatus = 404 as const;

  constructor(message = 'Wallet not found') {
    super(message);
  }
}

export type WalletError =
  | InvalidWalletId
  | InvalidWalletName
  | InvalidWalletCurrency
  | WalletAlreadyDeleted
  | WalletNotFound;
