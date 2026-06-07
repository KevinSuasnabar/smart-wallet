import { err, ok } from '../../shared/Result.js';
import type { Result } from '../../shared/Result.js';
import type { Clock } from '../../shared/Clock.js';
import type { IdGenerator } from '../../shared/IdGenerator.js';
import type { Currency } from '../../shared/Currency.js';
import type { TransactionType } from '../../transaction/TransactionType.js';
import { UserId } from '../../user/UserId.js';
import type { UserError } from '../../user/UserError.js';
import { TransactionId } from '../../transaction/TransactionId.js';
import type { RecurringTransactionRepository } from '../RecurringTransactionRepository.js';
import { RecurringWalletNotFound, type RecurringError } from '../RecurringError.js';

const SAFETY_OUTER_LOOP = 50;
const PAGE_SIZE = 20;

export interface MaterializeRecurringsDeps {
  recurringRepo: RecurringTransactionRepository;
  idGen: IdGenerator;
  clock: Clock;
}

export interface MaterializedRecurringTransaction {
  transactionId: string;
  walletId: string;
  type: TransactionType;
  amountCents: number;
  currency: Currency;
  categoryId: string;
  occurredAt: Date;
}

export interface MaterializeRecurringsOutput {
  materializedCount: number;
  materializedTransactionIds: string[];
  materializedTransactions: MaterializedRecurringTransaction[];
}

export type MaterializeRecurringsResult = Result<
  MaterializeRecurringsOutput,
  RecurringError | UserError
>;

const isRaceLost = (e: unknown): boolean => e instanceof Error && e.name === 'RecurringRaceLost';

const isWalletGone = (e: unknown): boolean =>
  e instanceof Error && e.name === 'RecurringWalletNotFound';

export const makeMaterializeRecurrings =
  (deps: MaterializeRecurringsDeps) =>
  async (userIdRaw: string): Promise<MaterializeRecurringsResult> => {
    const userIdResult = UserId.create(userIdRaw);
    if (!userIdResult.ok) return err(userIdResult.error);
    const userId = userIdResult.value;
    const now = deps.clock.now();

    const txIds: string[] = [];
    const materializedTransactions: MaterializedRecurringTransaction[] = [];

    for (let iter = 0; iter < SAFETY_OUTER_LOOP; iter++) {
      const pending = await deps.recurringRepo.listPending(userId, now, PAGE_SIZE);
      if (pending.length === 0) break;

      let progressed = false;
      for (const recurring of pending) {
        const txId = TransactionId.generate(deps.idGen);
        const outcome = recurring.materializeOne(now);
        try {
          await deps.recurringRepo.materializeOne({
            recurring,
            transactionId: txId,
            nextOccurrenceAt: outcome.nextOccurrenceAt,
            materializedAt: outcome.materializedAt,
          });
          recurring.applyMaterializationOutcome(outcome.nextOccurrenceAt, outcome.materializedAt);
          txIds.push(txId.toString());
          materializedTransactions.push({
            transactionId: txId.toString(),
            walletId: outcome.transactionDraft.walletId.toString(),
            type: outcome.transactionDraft.type,
            amountCents: outcome.transactionDraft.amount.amount,
            currency: outcome.transactionDraft.amount.currency,
            categoryId: outcome.transactionDraft.categoryId,
            occurredAt: outcome.transactionDraft.occurredAt,
          });
          progressed = true;
        } catch (e) {
          if (isRaceLost(e)) continue;
          if (isWalletGone(e)) return err(new RecurringWalletNotFound());
          throw e;
        }
      }

      // Avoid spinning if no item moved forward (e.g. all races lost) — the
      // next listPending would return the same set with the same race result.
      if (!progressed) break;
    }

    return ok({
      materializedCount: txIds.length,
      materializedTransactionIds: txIds,
      materializedTransactions,
    });
  };
