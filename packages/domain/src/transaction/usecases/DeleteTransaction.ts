import { err, ok } from '../../shared/Result.js';
import type { Result } from '../../shared/Result.js';
import type { Clock } from '../../shared/Clock.js';
import { UserId } from '../../user/UserId.js';
import type { UserError } from '../../user/UserError.js';
import { WalletId } from '../../wallet/WalletId.js';
import type { WalletRepository } from '../../wallet/WalletRepository.js';
import type { WalletError } from '../../wallet/WalletError.js';
import { WalletNotFound } from '../../wallet/WalletError.js';
import { TransactionId } from '../TransactionId.js';
import type { TransactionRepository } from '../TransactionRepository.js';
import { TransactionNotFound } from '../TransactionError.js';
import type { TransactionError } from '../TransactionError.js';

export interface DeleteTransactionInput {
  userId: string;
  walletId: string;
  transactionId: string;
}

export interface DeleteTransactionDeps {
  walletRepo: WalletRepository;
  transactionRepo: TransactionRepository;
  /** Clock injection kept for parity with other use cases (currently unused). */
  clock: Clock;
}

export type DeleteTransactionOutput = Result<
  void,
  TransactionError | WalletError | UserError
>;

/**
 * Hard-deletes a transaction and reverses its impact on the wallet balance
 * atomically. The transaction's row is removed from DynamoDB; the wallet's
 * balance is adjusted by `-tx.signedDelta()` in the same TransactWriteItems.
 *
 * Per proposal §4.1, soft-delete is intentionally NOT used here — the domain's
 * `softDelete()` method is left in place for future audit/undo, but is not
 * called.
 */
export const makeDeleteTransaction =
  (deps: DeleteTransactionDeps) =>
  async (input: DeleteTransactionInput): Promise<DeleteTransactionOutput> => {
    const userIdResult = UserId.create(input.userId);
    if (!userIdResult.ok) return err(userIdResult.error);

    const txIdResult = TransactionId.create(input.transactionId);
    if (!txIdResult.ok) return err(txIdResult.error);

    const walletIdResult = WalletId.create(input.walletId);
    if (!walletIdResult.ok) return err(walletIdResult.error);

    const userId = userIdResult.value;
    const txId = txIdResult.value;
    const walletId = walletIdResult.value;

    const existing = await deps.transactionRepo.findById(userId, txId);
    if (!existing) {
      return err(new TransactionNotFound(`Transaction ${input.transactionId} not found`));
    }

    // Wallet scope guard
    if (existing.walletId.toString() !== input.walletId) {
      return err(new TransactionNotFound(`Transaction ${input.transactionId} not found`));
    }

    // Verify the wallet is still active before mutating it
    const wallet = await deps.walletRepo.findById(userId, walletId);
    if (wallet?.deletedAt !== null) {
      return err(new WalletNotFound());
    }

    const walletBalanceDelta = -existing.signedDelta();

    try {
      await deps.transactionRepo.hardDelete({
        userId,
        transactionId: txId,
        walletId,
        walletBalanceDelta,
        occurredAt: existing.occurredAt,
      });
    } catch (e) {
      if (e instanceof TransactionNotFound) return err(e);
      if (e instanceof WalletNotFound) return err(e);
      throw e;
    }

    return ok(undefined);
  };
