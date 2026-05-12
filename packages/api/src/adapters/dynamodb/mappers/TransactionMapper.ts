import {
  Transaction,
  TransactionId,
  WalletId,
  UserId,
  Money,
  ok,
  err,
} from '@smart-wallet/domain';
import type {
  Currency,
  TransactionType,
  TransactionError,
  Result,
  TransactionProps,
} from '@smart-wallet/domain';
import { InvalidTransactionId } from '@smart-wallet/domain';
import { userPK, transactionSK, transactionGsi1SK } from '../keyBuilders.js';

// ── DynamoDB item shape ────────────────────────────────────────────────────

export interface TransactionItem {
  PK: string;
  SK: string;
  /** GSI1PK duplicates PK — used for category-based queries via GSI1. */
  GSI1PK: string;
  /** CAT#{categoryId}#{occurredAtIso}#{transactionId} */
  GSI1SK: string;
  entityType: 'Transaction';
  transactionId: string;
  walletId: string;
  userId: string;
  type: TransactionType;
  /** Positive integer cents — sign is encoded in `type`. */
  amount: number;
  currency: Currency;
  categoryId: string;
  /** Omitted from item when description is null. */
  description?: string;
  occurredAt: string; // ISO 8601
  createdAt: string;  // ISO 8601
  updatedAt: string;  // ISO 8601
  /** Omitted from item when active (null in domain). */
  deletedAt?: string; // ISO 8601
}

// ── Transaction (domain) → TransactionItem (DDB) ──────────────────────────

export const transactionToItem = (transaction: Transaction): TransactionItem => {
  const occurredAtIso = transaction.occurredAt.toISOString();

  const item: TransactionItem = {
    PK: userPK(transaction.userId.toString()),
    SK: transactionSK(transaction.walletId.toString(), occurredAtIso, transaction.id.toString()),
    GSI1PK: userPK(transaction.userId.toString()),
    GSI1SK: transactionGsi1SK(transaction.categoryId, occurredAtIso, transaction.id.toString()),
    entityType: 'Transaction',
    transactionId: transaction.id.toString(),
    walletId: transaction.walletId.toString(),
    userId: transaction.userId.toString(),
    type: transaction.type,
    amount: transaction.amount.amount,
    currency: transaction.amount.currency,
    categoryId: transaction.categoryId,
    occurredAt: occurredAtIso,
    createdAt: transaction.createdAt.toISOString(),
    updatedAt: transaction.updatedAt.toISOString(),
    // exactOptionalPropertyTypes: only set optional attributes when non-null
    ...(transaction.description !== null ? { description: transaction.description } : {}),
    ...(transaction.deletedAt !== null ? { deletedAt: transaction.deletedAt.toISOString() } : {}),
  };
  return item;
};

// ── TransactionItem (DDB) → Transaction (domain) ──────────────────────────

export const itemToTransaction = (item: TransactionItem): Result<Transaction, TransactionError> => {
  const txIdResult = TransactionId.create(item.transactionId);
  if (!txIdResult.ok) {
    return err(new InvalidTransactionId(`Stored transactionId is invalid: ${item.transactionId}`));
  }

  const walletIdResult = WalletId.create(item.walletId);
  if (!walletIdResult.ok) {
    return err(new InvalidTransactionId(`Stored walletId is invalid: ${item.walletId}`));
  }

  const userIdResult = UserId.create(item.userId);
  if (!userIdResult.ok) {
    return err(new InvalidTransactionId(`Stored userId is invalid: ${item.userId}`));
  }

  // Rehydrate Money using zero() bypass — stored amount is trusted; it may be 0 only as edge-case.
  // For positive amounts, we can safely bypass create() validation.
  const money = item.amount > 0
    ? Money.create(item.amount, item.currency)
    : { ok: false as const, error: new InvalidTransactionId(`Stored amount is non-positive: ${item.amount}`) };

  if (!money.ok) {
    return err(money.error as TransactionError);
  }

  const props: TransactionProps = {
    walletId: walletIdResult.value,
    userId: userIdResult.value,
    type: item.type,
    amount: money.value,
    categoryId: item.categoryId,
    description: item.description ?? null,
    occurredAt: new Date(item.occurredAt),
    createdAt: new Date(item.createdAt),
    updatedAt: new Date(item.updatedAt),
    deletedAt: item.deletedAt !== undefined ? new Date(item.deletedAt) : null,
  };

  return ok(Transaction.rehydrate(txIdResult.value, props));
};
