import { ok, err } from '../../shared/Result.js';
import type { Result } from '../../shared/Result.js';
import type { Clock } from '../../shared/Clock.js';
import { UserId } from '../../user/UserId.js';
import type { UserError } from '../../user/UserError.js';
import { WalletId } from '../WalletId.js';
import { WalletNotFound } from '../WalletError.js';
import type { WalletError } from '../WalletError.js';
import type { WalletRepository } from '../WalletRepository.js';

export interface DeleteWalletInput {
  userId: string;
  walletId: string;
}

export interface DeleteWalletDeps {
  walletRepo: WalletRepository;
  /** Kept for parity with sibling use cases; not used today. */
  clock: Clock;
}

export type DeleteWalletOutput = Result<void, WalletError | UserError>;

/**
 * Hard-deletes a wallet AND every transaction belonging to it. Per
 * proposal §4.1, the domain's existing softDelete is intentionally NOT used
 * here.
 *
 * The cascade is implemented in the repository via chunked TransactWriteItems
 * (see DynamoDBWalletRepository.hardDeleteWithTransactions). A concurrent
 * removal of the wallet between findById and the cascade surfaces as a
 * ConditionalCheckFailed inside the TransactionCanceledException — we map
 * it to WalletNotFound here.
 */
export const makeDeleteWallet =
  (deps: DeleteWalletDeps) =>
  async (input: DeleteWalletInput): Promise<DeleteWalletOutput> => {
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

    try {
      await deps.walletRepo.hardDeleteWithTransactions(userId, walletId);
    } catch (e) {
      if (isWalletConcurrentlyRemoved(e)) {
        return err(new WalletNotFound());
      }
      throw e;
    }

    return ok(undefined);
  };

/**
 * Detect a TransactionCanceledException whose cancellation reasons include
 * a ConditionalCheckFailed — this happens when the wallet's Delete in the
 * final chunk fails its `attribute_exists(PK)` predicate (concurrent
 * removal).
 */
function isWalletConcurrentlyRemoved(e: unknown): boolean {
  if (e === null || typeof e !== 'object' || !('name' in e)) return false;
  if ((e).name !== 'TransactionCanceledException') {
    return false;
  }
  const reasons =
    ((e as { CancellationReasons?: ({ Code?: string } | null)[] }).CancellationReasons) ?? [];
  return reasons.some((r) => r?.Code === 'ConditionalCheckFailed');
}
