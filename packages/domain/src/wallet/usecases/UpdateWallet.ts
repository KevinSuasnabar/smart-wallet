import { ok, err } from '../../shared/Result.js';
import type { Result } from '../../shared/Result.js';
import type { Clock } from '../../shared/Clock.js';
import { UserId } from '../../user/UserId.js';
import type { UserError } from '../../user/UserError.js';
import { WalletId } from '../WalletId.js';
import type { Wallet } from '../Wallet.js';
import {
  WalletNotFound,
  WalletCurrencyLocked,
} from '../WalletError.js';
import type { WalletError } from '../WalletError.js';
import type { WalletRepository } from '../WalletRepository.js';
import type { TransactionRepository } from '../../transaction/TransactionRepository.js';

export interface UpdateWalletInput {
  userId: string;
  walletId: string;
  edits: {
    name?: string;
    currency?: string;
    color?: string;
  };
}

export interface UpdateWalletDeps {
  walletRepo: WalletRepository;
  transactionRepo: TransactionRepository;
  clock: Clock;
}

export type UpdateWalletOutput = Result<Wallet, WalletError | UserError>;

/**
 * Apply partial edits to a wallet. Validates the edits at the entity level
 * and enforces a higher-level rule: a wallet with at least one active
 * transaction cannot change its currency.
 */
export const makeUpdateWallet =
  (deps: UpdateWalletDeps) =>
  async (input: UpdateWalletInput): Promise<UpdateWalletOutput> => {
    const userIdResult = UserId.create(input.userId);
    if (!userIdResult.ok) return err(userIdResult.error);
    const walletIdResult = WalletId.create(input.walletId);
    if (!walletIdResult.ok) return err(walletIdResult.error);

    const userId = userIdResult.value;
    const walletId = walletIdResult.value;

    const wallet = await deps.walletRepo.findById(userId, walletId);
    if (wallet?.deletedAt !== null) {
      return err(new WalletNotFound());
    }

    // Currency-lock check: only if the body explicitly changes currency
    if (
      input.edits.currency !== undefined &&
      input.edits.currency !== wallet.currency
    ) {
      const probe = await deps.transactionRepo.listByWallet(
        userId,
        walletId,
        { limit: 1 },
      );
      if (probe.items.length > 0) {
        return err(new WalletCurrencyLocked());
      }
    }

    const editResult = wallet.applyEdits(input.edits, deps.clock);
    if (!editResult.ok) return err(editResult.error);

    await deps.walletRepo.update(wallet);
    return ok(wallet);
  };
