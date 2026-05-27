import { Budget, BudgetId, UserId } from '@smart-wallet/domain';
import type { BudgetProps, BudgetType } from '@smart-wallet/domain';
import type { Currency } from '@smart-wallet/domain';
import { userPK, budgetSK } from '../keyBuilders.js';

export interface BudgetItem {
  PK: string;
  SK: string;
  entityType: 'Budget';
  budgetId: string;
  userId: string;
  type: BudgetType;
  categoryId?: string;
  limitCents: number;
  currency: Currency;
  rollover: boolean;
  createdAt: string;
  updatedAt: string;
}

export const budgetToItem = (b: Budget): BudgetItem => ({
  PK: userPK(b.userId.toString()),
  SK: budgetSK(b.id.toString()),
  entityType: 'Budget',
  budgetId: b.id.toString(),
  userId: b.userId.toString(),
  type: b.type,
  ...(b.categoryId !== undefined ? { categoryId: b.categoryId } : {}),
  limitCents: b.limitCents,
  currency: b.currency,
  rollover: b.rollover,
  createdAt: b.createdAt.toISOString(),
  updatedAt: b.updatedAt.toISOString(),
});

export const itemToBudget = (item: BudgetItem): Budget => {
  const budgetIdResult = BudgetId.create(item.budgetId);
  if (!budgetIdResult.ok) throw new Error(`Stored budgetId invalid: ${item.budgetId}`);

  const userIdResult = UserId.create(item.userId);
  if (!userIdResult.ok) throw new Error(`Stored userId invalid: ${item.userId}`);

  const props: BudgetProps = {
    userId: userIdResult.value,
    type: item.type,
    categoryId: item.categoryId,
    limitCents: item.limitCents,
    currency: item.currency,
    rollover: item.rollover,
    createdAt: new Date(item.createdAt),
    updatedAt: new Date(item.updatedAt),
  };

  return Budget.rehydrate(budgetIdResult.value, props);
};
