import type { Wallet } from './Wallet.js';
import type { WalletId } from './WalletId.js';
import type { UserId } from '../user/UserId.js';

export interface WalletRepository {
  save(wallet: Wallet): Promise<void>;
  findById(userId: UserId, walletId: WalletId): Promise<Wallet | null>;
  listByUser(
    userId: UserId,
    options: { limit: number; cursor?: string },
  ): Promise<{ items: Wallet[]; nextCursor?: string }>;
}
