import type { Budget } from './Budget.js';
import type { BudgetId } from './BudgetId.js';
import type { UserId } from '../user/UserId.js';

export interface BudgetRepository {
  save(budget: Budget): Promise<void>;
  update(budget: Budget): Promise<void>;
  findById(userId: UserId, budgetId: BudgetId): Promise<Budget | null>;
  listByUser(userId: UserId): Promise<Budget[]>;
  delete(userId: UserId, budgetId: BudgetId): Promise<void>;
}
