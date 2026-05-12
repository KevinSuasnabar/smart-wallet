import { ok, err } from '../../shared/Result.js';
import type { Result } from '../../shared/Result.js';
import { UserId } from '../../user/UserId.js';
import type { UserError } from '../../user/UserError.js';
import type { Wallet } from '../Wallet.js';
import type { WalletRepository } from '../WalletRepository.js';

export interface ListWalletsInput {
  userId: string;
  limit?: number;
  cursor?: string;
}

export interface ListWalletsOutput {
  items: Wallet[];
  nextCursor?: string;
}

export interface ListWalletsDeps {
  walletRepo: WalletRepository;
}

export const makeListWallets =
  (deps: ListWalletsDeps) =>
  async (input: ListWalletsInput): Promise<Result<ListWalletsOutput, UserError>> => {
    const userIdResult = UserId.create(input.userId);
    if (!userIdResult.ok) {
      return err(userIdResult.error);
    }

    const limit = input.limit ?? 50;
    const page: { limit: number; cursor?: string } =
      input.cursor !== undefined ? { limit, cursor: input.cursor } : { limit };

    const result = await deps.walletRepo.listByUser(userIdResult.value, page);

    return ok(result);
  };
