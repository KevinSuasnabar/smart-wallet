import { Wallet, WalletId, UserId, ok, err, isWalletColor } from '@smart-wallet/domain';
import type {
  Currency,
  WalletColor,
  WalletError,
  Result,
  WalletProps,
} from '@smart-wallet/domain';
import { InvalidWalletId } from '@smart-wallet/domain';
import { userPK, walletSK } from '../keyBuilders.js';

// ── DynamoDB item shape ────────────────────────────────────────────────────

export interface WalletItem {
  PK: string;
  SK: string;
  entityType: 'Wallet';
  walletId: string;
  userId: string;
  name: string;
  currency: Currency;
  /** Wallet color from the design-system palette. Stored as a string; legacy
   *  items written before this attribute existed fall back to 'lime' on read. */
  color?: string;
  /** Integer cents — may be negative. */
  balance: number;
  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
  /** Omitted from the item when the wallet is active (null in domain). */
  deletedAt?: string; // ISO 8601
}

// ── Wallet (domain) → WalletItem (DDB) ────────────────────────────────────

export const walletToItem = (wallet: Wallet): WalletItem => {
  const item: WalletItem = {
    PK: userPK(wallet.userId.toString()),
    SK: walletSK(wallet.id.toString()),
    entityType: 'Wallet',
    walletId: wallet.id.toString(),
    userId: wallet.userId.toString(),
    name: wallet.name,
    currency: wallet.currency,
    color: wallet.color,
    balance: wallet.balance,
    createdAt: wallet.createdAt.toISOString(),
    updatedAt: wallet.updatedAt.toISOString(),
    // exactOptionalPropertyTypes: only set deletedAt when non-null
    ...(wallet.deletedAt !== null ? { deletedAt: wallet.deletedAt.toISOString() } : {}),
  };
  return item;
};

// ── WalletItem (DDB) → Wallet (domain) ────────────────────────────────────

export const itemToWallet = (item: WalletItem): Result<Wallet, WalletError> => {
  const walletIdResult = WalletId.create(item.walletId);
  if (!walletIdResult.ok) return err(new InvalidWalletId(`Stored walletId is invalid: ${item.walletId}`));

  const userIdResult = UserId.create(item.userId);
  if (!userIdResult.ok) return err(new InvalidWalletId(`Stored userId is invalid: ${item.userId}`));

  // Legacy items written before wallet-colors landed have no `color`
  // attribute. Fall back to 'lime' so they keep rendering; the next write
  // (any edit) will persist the field.
  const color: WalletColor = isWalletColor(item.color) ? item.color : 'lime';

  const props: WalletProps = {
    userId: userIdResult.value,
    name: item.name,
    currency: item.currency,
    color,
    balance: item.balance,
    createdAt: new Date(item.createdAt),
    updatedAt: new Date(item.updatedAt),
    deletedAt: item.deletedAt !== undefined ? new Date(item.deletedAt) : null,
  };

  return ok(Wallet.rehydrate(walletIdResult.value, props));
};
