import { err, ok } from '../../shared/Result.js';
import type { Result } from '../../shared/Result.js';
import type { Clock } from '../../shared/Clock.js';
import type { IdGenerator } from '../../shared/IdGenerator.js';
import type { Currency } from '../../shared/Currency.js';
import { UserId } from '../../user/UserId.js';
import type { UserError } from '../../user/UserError.js';
import { WalletId } from '../../wallet/WalletId.js';
import type { WalletRepository } from '../../wallet/WalletRepository.js';
import type { WalletError } from '../../wallet/WalletError.js';
import { WalletNotFound } from '../../wallet/WalletError.js';
import { TransactionId } from '../TransactionId.js';
import { Money } from '../Money.js';
import { Transaction } from '../Transaction.js';
import type { TransactionRepository } from '../TransactionRepository.js';
import type { TransactionType } from '../TransactionType.js';
import { CurrencyMismatch } from '../TransactionError.js';
import type { TransactionError } from '../TransactionError.js';
import { CategoryId } from '../../category/CategoryId.js';
import type { CategoryRepository } from '../../category/CategoryRepository.js';
import type { CategoryError } from '../../category/CategoryError.js';

export interface AddTransactionInput {
  /** Raw userId string from JWT — validated here before use. */
  userId: string;
  /** Raw walletId string from path parameter — validated here before use. */
  walletId: string;
  type: TransactionType;
  /** Amount in integer cents — conversion from decimal string done at the handler boundary. */
  amountCents: number;
  /** Currency from the request — cross-checked against wallet.currency. */
  currency: Currency;
  /** categoryId string — validated via CategoryId.create() + categoryRepo.validateCategoryForTransaction(). */
  categoryId: string;
  description: string | null;
  occurredAt: Date;
  /**
   * Pre-computed 32 hex char SHA-256 hash of (userId + ':' + walletId + ':' + idempotencyKey).
   * Computed at the handler boundary (api layer — Node crypto); domain does not touch it.
   * When present, the repository uses the 3-op idempotent TransactWrite path.
   * When absent, the standard 2-op path is used.
   */
  idempotencyHash?: string;
}

export interface AddTransactionDeps {
  walletRepo: WalletRepository;
  transactionRepo: TransactionRepository;
  /** Wired in T-05-05: validates category existence, ownership, and type-match. */
  categoryRepo: CategoryRepository;
  idGen: IdGenerator;
  clock: Clock;
}

/**
 * Unified output shape for both idempotent and non-idempotent paths.
 * - `replay: false` — new transaction created (handler returns 201).
 * - `replay: true`  — existing transaction returned from idempotency record (handler returns 200).
 */
export type AddTransactionOutput = Result<
  { transaction: Transaction; replay: boolean },
  TransactionError | WalletError | UserError | CategoryError
>;

export const makeAddTransaction =
  (deps: AddTransactionDeps) =>
  async (input: AddTransactionInput): Promise<AddTransactionOutput> => {
    // 1. Parse + validate raw VO inputs
    const userIdResult = UserId.create(input.userId);
    if (!userIdResult.ok) return err(userIdResult.error);

    const walletIdResult = WalletId.create(input.walletId);
    if (!walletIdResult.ok) return err(walletIdResult.error);

    const userId = userIdResult.value;
    const walletId = walletIdResult.value;

    // 2. Load wallet — returns null when not found or belongs to another user (DDB partition-scoped)
    // Optional chain: wallet?.deletedAt is null when wallet is null (short-circuits), so this guards both cases.
    const wallet = await deps.walletRepo.findById(userId, walletId);
    if (wallet?.deletedAt !== null) {
      return err(new WalletNotFound());
    }

    // 3. Validate that the request currency matches the wallet's locked currency
    if (input.currency !== wallet.currency) {
      return err(new CurrencyMismatch());
    }

    // 4a. Parse + validate categoryId VO
    const categoryIdResult = CategoryId.create(input.categoryId);
    if (!categoryIdResult.ok) return err(categoryIdResult.error);

    // 4b. Validate category: existence, ownership, not-deleted, and type-match
    //     Predefined IDs are validated structurally (no DB lookup).
    //     Custom IDs are looked up in the repository.
    const categoryValidation = await deps.categoryRepo.validateCategoryForTransaction({
      userId,
      categoryId: categoryIdResult.value,
      transactionType: input.type,
    });
    if (!categoryValidation.ok) return err(categoryValidation.error);

    // 5. Construct Money VO (amount must be strictly positive integer cents)
    const moneyResult = Money.create(input.amountCents, wallet.currency);
    if (!moneyResult.ok) return err(moneyResult.error);

    const money = moneyResult.value;

    // 6. Generate a new TransactionId
    const transactionId = TransactionId.generate(deps.idGen);

    // 7. Construct Transaction aggregate — enforces occurredAt range, description length, and categoryId shape
    const transactionResult = Transaction.create({
      id: transactionId,
      walletId,
      userId,
      type: input.type,
      amount: money,
      categoryId: input.categoryId,
      description: input.description,
      occurredAt: input.occurredAt,
      clock: deps.clock,
    });

    if (!transactionResult.ok) return transactionResult;

    const transaction = transactionResult.value;

    // 8. Signed balance delta: income increases (+), expense decreases (−)
    const walletBalanceDelta =
      input.type === 'income' ? money.amount : money.negate().amount;

    // 9. Persist — choose path based on idempotencyHash presence
    if (input.idempotencyHash !== undefined) {
      // 3-op idempotent path: Transaction Put + Wallet Update + IdempotencyRecord Put
      // The repository handles TransactionCanceledException and returns replay: true on retry.
      return deps.transactionRepo.addIdempotent({
        transaction,
        walletBalanceDelta,
        walletId,
        idempotencyHash: input.idempotencyHash,
      });
    }

    // Standard 2-op path: Transaction Put + Wallet balance Update
    await deps.transactionRepo.add({ transaction, walletBalanceDelta });

    return ok({ transaction, replay: false });
  };
