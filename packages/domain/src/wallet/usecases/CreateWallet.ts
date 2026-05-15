import { err } from '../../shared/Result.js';
import type { Result } from '../../shared/Result.js';
import type { Clock } from '../../shared/Clock.js';
import type { IdGenerator } from '../../shared/IdGenerator.js';
import type { Currency } from '../../shared/Currency.js';
import { UserId } from '../../user/UserId.js';
import type { UserError } from '../../user/UserError.js';
import { WalletId } from '../WalletId.js';
import { Wallet } from '../Wallet.js';
import type { WalletError } from '../WalletError.js';
import type { WalletRepository } from '../WalletRepository.js';

export interface CreateWalletInput {
  /** Raw userId string from JWT — validated here before use. */
  userId: string;
  name: string;
  currency: Currency;
  /** Raw color string — validated by Wallet.create against the palette. */
  color: string;
}

export interface CreateWalletDeps {
  walletRepo: WalletRepository;
  idGen: IdGenerator;
  clock: Clock;
}

export type CreateWalletOutput = Result<Wallet, WalletError | UserError>;

export const makeCreateWallet =
  (deps: CreateWalletDeps) =>
  async (input: CreateWalletInput): Promise<CreateWalletOutput> => {
    const userIdResult = UserId.create(input.userId);
    if (!userIdResult.ok) {
      return err(userIdResult.error);
    }

    const walletId = WalletId.generate(deps.idGen);

    const walletResult = Wallet.create({
      walletId,
      userId: userIdResult.value,
      name: input.name,
      currency: input.currency,
      color: input.color,
      clock: deps.clock,
    });

    if (!walletResult.ok) {
      return walletResult;
    }

    await deps.walletRepo.save(walletResult.value);

    return walletResult;
  };
