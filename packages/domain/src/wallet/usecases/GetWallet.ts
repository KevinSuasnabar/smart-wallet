import { ok, err } from '../../shared/Result.js';
import type { Result } from '../../shared/Result.js';
import { UserId } from '../../user/UserId.js';
import type { UserError } from '../../user/UserError.js';
import { WalletId } from '../WalletId.js';
import type { Wallet } from '../Wallet.js';
import type { WalletError } from '../WalletError.js';
import type { WalletRepository } from '../WalletRepository.js';

export interface GetWalletInput {
  userId: string;
  walletId: string;
}

export interface GetWalletDeps {
  walletRepo: WalletRepository;
}

export type GetWalletOutput = Result<Wallet | null, WalletError | UserError>;

export const makeGetWallet =
  (deps: GetWalletDeps) =>
  async (input: GetWalletInput): Promise<GetWalletOutput> => {
    const userIdResult = UserId.create(input.userId);
    if (!userIdResult.ok) {
      return err(userIdResult.error);
    }

    const walletIdResult = WalletId.create(input.walletId);
    if (!walletIdResult.ok) {
      return walletIdResult;
    }

    const wallet = await deps.walletRepo.findById(userIdResult.value, walletIdResult.value);

    if (wallet === null) {
      return ok(null);
    }

    // Treat soft-deleted as non-existent (REQ-DEL-03, REQ-WAL-05)
    if (wallet.deletedAt !== null) {
      return ok(null);
    }

    return ok(wallet);
  };
