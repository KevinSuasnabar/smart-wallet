import type { Wallet } from './Wallet.js';
import type { WalletId } from './WalletId.js';
import type { UserId } from '../user/UserId.js';

export interface WalletRepository {
  save(wallet: Wallet): Promise<void>;

  /**
   * Persist edits to an existing wallet. Implementation MUST use a
   * ConditionExpression that requires the item to exist; a vanished wallet
   * surfaces as an error the use case can map to WalletNotFound.
   */
  update(wallet: Wallet): Promise<void>;

  /**
   * Hard-delete a wallet AND every transaction it contains, in chunked
   * TransactWriteItems calls. The cascade is per-chunk-atomic; a partial
   * failure leaves a recoverable state and the operation is retry-safe
   * (the next attempt's Query returns only surviving rows).
   *
   * If the wallet is concurrently removed between findById and the cascade,
   * the implementation throws a TransactionCanceledException whose final
   * reason is ConditionalCheckFailed — the use case maps that to
   * WalletNotFound.
   */
  hardDeleteWithTransactions(userId: UserId, walletId: WalletId): Promise<void>;

  findById(userId: UserId, walletId: WalletId): Promise<Wallet | null>;
  listByUser(
    userId: UserId,
    options: { limit: number; cursor?: string },
  ): Promise<{ items: Wallet[]; nextCursor?: string }>;
}
