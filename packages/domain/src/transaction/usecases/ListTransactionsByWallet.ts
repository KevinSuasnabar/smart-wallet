import { ok, err } from '../../shared/Result.js';
import type { Result } from '../../shared/Result.js';
import { UserId } from '../../user/UserId.js';
import type { UserError } from '../../user/UserError.js';
import { WalletId } from '../../wallet/WalletId.js';
import type { WalletRepository } from '../../wallet/WalletRepository.js';
import type { WalletError } from '../../wallet/WalletError.js';
import { WalletNotFound } from '../../wallet/WalletError.js';
import type { Transaction } from '../Transaction.js';
import type { TransactionRepository, ListByWalletFilter } from '../TransactionRepository.js';

export interface ListTransactionsByWalletInput {
  userId: string;
  walletId: string;
  from?: Date;
  to?: Date;
  type?: ListByWalletFilter['type'];
  categoryId?: string;
  limit?: number;
  cursor?: string;
}

export interface ListTransactionsByWalletDeps {
  walletRepo: WalletRepository;
  transactionRepo: TransactionRepository;
}

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

export type ListTransactionsByWalletOutput = Result<
  { items: Transaction[]; nextCursor?: string },
  WalletError | UserError
>;

export const makeListTransactionsByWallet =
  (deps: ListTransactionsByWalletDeps) =>
  async (input: ListTransactionsByWalletInput): Promise<ListTransactionsByWalletOutput> => {
    const userIdResult = UserId.create(input.userId);
    if (!userIdResult.ok) return err(userIdResult.error);

    const walletIdResult = WalletId.create(input.walletId);
    if (!walletIdResult.ok) return err(walletIdResult.error);

    const userId = userIdResult.value;
    const walletId = walletIdResult.value;

    // Verify wallet exists and belongs to this user; soft-deleted wallet → 404
    // Optional chain: wallet?.deletedAt is null when wallet is null (short-circuits), so this guards both cases.
    const wallet = await deps.walletRepo.findById(userId, walletId);
    if (wallet?.deletedAt !== null) {
      return err(new WalletNotFound());
    }

    const limit = Math.min(input.limit ?? DEFAULT_LIMIT, MAX_LIMIT);

    const result = await deps.transactionRepo.listByWallet(userId, walletId, {
      ...(input.from !== undefined ? { from: input.from } : {}),
      ...(input.to !== undefined ? { to: input.to } : {}),
      ...(input.type !== undefined ? { type: input.type } : {}),
      ...(input.categoryId !== undefined ? { categoryId: input.categoryId } : {}),
      limit,
      ...(input.cursor !== undefined ? { cursor: input.cursor } : {}),
    });

    return ok(result);
  };
