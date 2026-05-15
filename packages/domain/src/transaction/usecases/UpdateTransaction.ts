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
import { Money } from '../Money.js';
import type { Transaction } from '../Transaction.js';
import type { TransactionRepository } from '../TransactionRepository.js';
import { TransactionNotFound } from '../TransactionError.js';
import type { TransactionError } from '../TransactionError.js';
import { CategoryId } from '../../category/CategoryId.js';
import type { CategoryRepository } from '../../category/CategoryRepository.js';
import type { CategoryError } from '../../category/CategoryError.js';

export interface UpdateTransactionInput {
  userId: string;
  walletId: string;
  transactionId: string;
  /** Only fields present here are mutated; all are optional. */
  edits: {
    /** New amount in integer cents (already converted at boundary). Strictly positive. */
    amountCents?: number;
    /** Empty string clears; null clears explicitly; undefined leaves unchanged. */
    description?: string | null;
    categoryId?: string;
    occurredAt?: Date;
  };
  /** When present, the repo takes the 3-op idempotent path. */
  idempotencyHash?: string;
}

export interface UpdateTransactionDeps {
  walletRepo: WalletRepository;
  transactionRepo: TransactionRepository;
  categoryRepo: CategoryRepository;
  clock: Clock;
}

export type UpdateTransactionOutput = Result<
  { transaction: Transaction; replay: boolean },
  TransactionError | WalletError | CategoryError | UserError
>;

/**
 * Mutates an existing transaction and atomically adjusts the parent wallet's
 * balance. Field-level validation lives in `Transaction.applyEdits`. Category
 * type-match (if categoryId is changing) and Money parsing (if amount is
 * changing) are validated here at the boundary before delegating to the entity.
 */
export const makeUpdateTransaction =
  (deps: UpdateTransactionDeps) =>
  async (input: UpdateTransactionInput): Promise<UpdateTransactionOutput> => {
    // 1. Parse + validate raw VO inputs.
    const userIdResult = UserId.create(input.userId);
    if (!userIdResult.ok) return err(userIdResult.error);

    const txIdResult = TransactionId.create(input.transactionId);
    if (!txIdResult.ok) return err(txIdResult.error);

    const walletIdResult = WalletId.create(input.walletId);
    if (!walletIdResult.ok) return err(walletIdResult.error);

    const userId = userIdResult.value;
    const txId = txIdResult.value;
    const walletId = walletIdResult.value;

    // 2. Load the existing transaction.
    const existing = await deps.transactionRepo.findById(userId, txId);
    if (!existing) {
      return err(new TransactionNotFound(`Transaction ${input.transactionId} not found`));
    }

    // 2a. Wallet scope guard: the URL-asserted walletId must match the
    //     transaction's actual walletId.
    if (existing.walletId.toString() !== input.walletId) {
      return err(new TransactionNotFound(`Transaction ${input.transactionId} not found`));
    }

    // 3. Load wallet (verify still active). Returns null for missing or owned-by-other.
    const wallet = await deps.walletRepo.findById(userId, walletId);
    if (wallet?.deletedAt !== null) {
      return err(new WalletNotFound());
    }

    // 4. Category validation (only if categoryId is changing). The category's
    //    type must match the transaction's existing type — type is not mutable.
    if (input.edits.categoryId !== undefined) {
      const categoryIdResult = CategoryId.create(input.edits.categoryId);
      if (!categoryIdResult.ok) return err(categoryIdResult.error);

      const categoryValidation = await deps.categoryRepo.validateCategoryForTransaction({
        userId,
        categoryId: categoryIdResult.value,
        transactionType: existing.type,
      });
      if (!categoryValidation.ok) return err(categoryValidation.error);
    }

    // 5. Build Money VO if amount changing.
    let newMoney: Money | undefined;
    if (input.edits.amountCents !== undefined) {
      const moneyResult = Money.create(input.edits.amountCents, wallet.currency);
      if (!moneyResult.ok) return err(moneyResult.error);
      newMoney = moneyResult.value;
    }

    // 6. Snapshot pre-edit values for the repo (SK and balance math).
    const oldDelta = existing.signedDelta();
    const oldOccurredAt = existing.occurredAt;
    const oldCategoryId = existing.categoryId;

    // 7. Apply edits to the aggregate (validates description, occurredAt range).
    const editsForEntity: Parameters<typeof existing.applyEdits>[0] = {};
    if (newMoney !== undefined) editsForEntity.amount = newMoney;
    if (input.edits.description !== undefined) editsForEntity.description = input.edits.description;
    if (input.edits.categoryId !== undefined) editsForEntity.categoryId = input.edits.categoryId;
    if (input.edits.occurredAt !== undefined) editsForEntity.occurredAt = input.edits.occurredAt;

    const applyResult = existing.applyEdits(editsForEntity, deps.clock);
    if (!applyResult.ok) return err(applyResult.error);

    // 8. Compute the wallet balance adjustment.
    const newDelta = existing.signedDelta();
    const walletBalanceDelta = newDelta - oldDelta;

    // 9. Persist atomically.
    if (input.idempotencyHash !== undefined) {
      const persistResult = await deps.transactionRepo.updateIdempotent({
        transaction: existing,
        walletId,
        walletBalanceDelta,
        idempotencyHash: input.idempotencyHash,
        oldOccurredAt,
        oldCategoryId,
      });
      return persistResult;
    }

    try {
      await deps.transactionRepo.update({
        transaction: existing,
        walletBalanceDelta,
        oldOccurredAt,
        oldCategoryId,
      });
    } catch (e) {
      if (e instanceof TransactionNotFound) return err(e);
      if (e instanceof WalletNotFound) return err(e);
      throw e;
    }

    return ok({ transaction: existing, replay: false });
  };
