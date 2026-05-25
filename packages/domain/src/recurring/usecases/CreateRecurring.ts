import { err, ok } from '../../shared/Result.js';
import type { Result } from '../../shared/Result.js';
import type { Clock } from '../../shared/Clock.js';
import type { IdGenerator } from '../../shared/IdGenerator.js';
import { UserId } from '../../user/UserId.js';
import type { UserError } from '../../user/UserError.js';
import { WalletId } from '../../wallet/WalletId.js';
import type { WalletRepository } from '../../wallet/WalletRepository.js';
import { Money } from '../../transaction/Money.js';
import type { TransactionType } from '../../transaction/TransactionType.js';
import { CategoryId } from '../../category/CategoryId.js';
import type { CategoryRepository } from '../../category/CategoryRepository.js';
import type { CategoryError } from '../../category/CategoryError.js';
import { RecurringTransaction } from '../RecurringTransaction.js';
import { RecurringTransactionId } from '../RecurringTransactionId.js';
import type { RecurringTransactionRepository } from '../RecurringTransactionRepository.js';
import {
  RecurringWalletNotFound,
  RecurringAmountInvalid,
} from '../RecurringError.js';
import type { RecurringError } from '../RecurringError.js';

export interface CreateRecurringInput {
  userId: string;
  walletId: string;
  type: TransactionType;
  /** Integer cents — handler converts from decimal string before calling. */
  amountCents: number;
  categoryId: string;
  description: string | null;
  dayOfMonth: number;
}

export interface CreateRecurringDeps {
  walletRepo: WalletRepository;
  categoryRepo: CategoryRepository;
  recurringRepo: RecurringTransactionRepository;
  idGen: IdGenerator;
  clock: Clock;
}

export type CreateRecurringOutput = Result<
  { recurring: RecurringTransaction },
  RecurringError | UserError | CategoryError
>;

export const makeCreateRecurring =
  (deps: CreateRecurringDeps) =>
  async (input: CreateRecurringInput): Promise<CreateRecurringOutput> => {
    const userIdResult = UserId.create(input.userId);
    if (!userIdResult.ok) return err(userIdResult.error);
    const walletIdResult = WalletId.create(input.walletId);
    if (!walletIdResult.ok) return err(new RecurringWalletNotFound());

    const userId = userIdResult.value;
    const walletId = walletIdResult.value;

    const wallet = await deps.walletRepo.findById(userId, walletId);
    if (wallet?.deletedAt !== null) {
      return err(new RecurringWalletNotFound());
    }

    const categoryIdResult = CategoryId.create(input.categoryId);
    if (!categoryIdResult.ok) return err(categoryIdResult.error);

    const validation = await deps.categoryRepo.validateCategoryForTransaction({
      userId,
      categoryId: categoryIdResult.value,
      transactionType: input.type,
    });
    if (!validation.ok) return err(validation.error);

    const moneyResult = Money.create(input.amountCents, wallet.currency);
    if (!moneyResult.ok) return err(new RecurringAmountInvalid());

    const id = RecurringTransactionId.generate(deps.idGen);

    const entity = RecurringTransaction.create({
      id,
      walletId,
      userId,
      type: input.type,
      amount: moneyResult.value,
      categoryId: input.categoryId,
      description: input.description,
      dayOfMonth: input.dayOfMonth,
      clock: deps.clock,
    });
    if (!entity.ok) return err(entity.error);

    await deps.recurringRepo.create({ recurring: entity.value });
    return ok({ recurring: entity.value });
  };
