import { err, ok } from '../../shared/Result.js';
import type { Result } from '../../shared/Result.js';
import { UserId } from '../../user/UserId.js';
import type { UserError } from '../../user/UserError.js';
import { WalletId } from '../../wallet/WalletId.js';
import type { WalletError } from '../../wallet/WalletError.js';
import { TransactionId } from '../TransactionId.js';
import type { Transaction } from '../Transaction.js';
import type { TransactionRepository } from '../TransactionRepository.js';
import { TransactionNotFound } from '../TransactionError.js';
import type { TransactionError } from '../TransactionError.js';

export interface GetTransactionInput {
  /** Raw userId string from JWT. */
  userId: string;
  /** Raw walletId string from the path. */
  walletId: string;
  /** Raw transactionId string from the path. */
  transactionId: string;
}

export interface GetTransactionDeps {
  transactionRepo: TransactionRepository;
}

export type GetTransactionOutput = Result<
  Transaction,
  TransactionError | UserError | WalletError
>;

/**
 * Loads a single transaction by id, scoped to the caller. Returns
 * `TransactionNotFound` (404) if the transaction does not exist, is soft-
 * deleted, belongs to a different user (DDB partition-scoped), or belongs to
 * a different wallet than the one in the URL (no info leak across wallets).
 */
export const makeGetTransaction =
  (deps: GetTransactionDeps) =>
  async (input: GetTransactionInput): Promise<GetTransactionOutput> => {
    const userIdResult = UserId.create(input.userId);
    if (!userIdResult.ok) return err(userIdResult.error);

    const txIdResult = TransactionId.create(input.transactionId);
    if (!txIdResult.ok) return err(txIdResult.error);

    // Validate walletId path param — we don't need the VO past this point,
    // but reject malformed IDs at the same layer as the other use cases.
    const walletIdResult = WalletId.create(input.walletId);
    if (!walletIdResult.ok) return err(walletIdResult.error);

    const tx = await deps.transactionRepo.findById(
      userIdResult.value,
      txIdResult.value,
    );
    if (!tx) {
      return err(new TransactionNotFound(`Transaction ${input.transactionId} not found`));
    }

    // Wallet scope guard: the URL-asserted walletId must match the transaction's
    // actual walletId. If they differ, return the same 404 (no info leak).
    if (tx.walletId.toString() !== input.walletId) {
      return err(new TransactionNotFound(`Transaction ${input.transactionId} not found`));
    }

    return ok(tx);
  };
