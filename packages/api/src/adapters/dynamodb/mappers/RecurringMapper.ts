import {
  RecurringTransaction,
  RecurringTransactionId,
  WalletId,
  UserId,
  Money,
  ok,
  err,
  InvalidRecurringId,
  type RecurringError,
  type RecurringTransactionProps,
  type Result,
  type Currency,
  type TransactionType,
} from '@smart-wallet/domain';
import { userPK, recurringSK, recurringGsi1SK } from '../keyBuilders.js';

export interface RecurringItem {
  PK: string;
  SK: string;
  GSI1PK: string;
  GSI1SK: string;
  entityType: 'Recurring';
  recurringId: string;
  walletId: string;
  userId: string;
  type: TransactionType;
  /** Positive integer cents — sign comes from `type`. */
  amount: number;
  currency: Currency;
  categoryId: string;
  /** Omitted when null. */
  description?: string;
  cadence: 'monthly';
  dayOfMonth: number;
  nextOccurrenceAt: string;
  /** Omitted when null. */
  lastMaterializedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export const recurringToItem = (r: RecurringTransaction): RecurringItem => {
  const nextIso = r.nextOccurrenceAt.toISOString();
  const item: RecurringItem = {
    PK: userPK(r.userId.toString()),
    SK: recurringSK(r.id.toString()),
    GSI1PK: userPK(r.userId.toString()),
    GSI1SK: recurringGsi1SK(nextIso, r.id.toString()),
    entityType: 'Recurring',
    recurringId: r.id.toString(),
    walletId: r.walletId.toString(),
    userId: r.userId.toString(),
    type: r.type,
    amount: r.amount.amount,
    currency: r.amount.currency,
    categoryId: r.categoryId,
    cadence: 'monthly',
    dayOfMonth: r.dayOfMonth,
    nextOccurrenceAt: nextIso,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    ...(r.description !== null ? { description: r.description } : {}),
    ...(r.lastMaterializedAt !== null
      ? { lastMaterializedAt: r.lastMaterializedAt.toISOString() }
      : {}),
  };
  return item;
};

export const itemToRecurring = (
  item: RecurringItem,
): Result<RecurringTransaction, RecurringError> => {
  const idResult = RecurringTransactionId.create(item.recurringId);
  if (!idResult.ok) {
    return err(
      new InvalidRecurringId(
        `Stored recurringId is invalid: ${item.recurringId}`,
      ),
    );
  }
  const walletIdResult = WalletId.create(item.walletId);
  if (!walletIdResult.ok) {
    return err(
      new InvalidRecurringId(`Stored walletId is invalid: ${item.walletId}`),
    );
  }
  const userIdResult = UserId.create(item.userId);
  if (!userIdResult.ok) {
    return err(
      new InvalidRecurringId(`Stored userId is invalid: ${item.userId}`),
    );
  }
  const moneyResult = Money.create(item.amount, item.currency);
  if (!moneyResult.ok) {
    return err(
      new InvalidRecurringId(`Stored amount is invalid: ${item.amount}`),
    );
  }

  const props: RecurringTransactionProps = {
    walletId: walletIdResult.value,
    userId: userIdResult.value,
    type: item.type,
    amount: moneyResult.value,
    categoryId: item.categoryId,
    description: item.description ?? null,
    cadence: 'monthly',
    dayOfMonth: item.dayOfMonth,
    nextOccurrenceAt: new Date(item.nextOccurrenceAt),
    lastMaterializedAt:
      item.lastMaterializedAt !== undefined
        ? new Date(item.lastMaterializedAt)
        : null,
    createdAt: new Date(item.createdAt),
    updatedAt: new Date(item.updatedAt),
  };

  return ok(RecurringTransaction.rehydrate(idResult.value, props));
};
