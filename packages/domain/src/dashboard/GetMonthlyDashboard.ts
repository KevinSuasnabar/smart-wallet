import { ok, err } from '../shared/Result.js';
import type { Result } from '../shared/Result.js';
import type { Clock } from '../shared/Clock.js';
import type { Currency } from '../shared/Currency.js';
import { UserId } from '../user/UserId.js';
import type { UserError } from '../user/UserError.js';
import type { Wallet } from '../wallet/Wallet.js';
import type { WalletRepository } from '../wallet/WalletRepository.js';
import type {
  MonthlyTransactionSummary,
  TransactionRepository,
} from '../transaction/TransactionRepository.js';

export interface CurrencyBalance {
  currency: Currency;
  balanceCents: number;
}

export interface MonthlyDashboardSummary {
  currency: Currency;
  incomeCents: number;
  expenseCents: number;
  netCents: number;
  topCategories: {
    categoryId: string;
    amountCents: number;
    share: number;
  }[];
}

export interface GetMonthlyDashboardOutput {
  range: {
    from: Date;
    to: Date;
  };
  totalsByCurrency: CurrencyBalance[];
  summariesByCurrency: MonthlyDashboardSummary[];
}

export interface GetMonthlyDashboardDeps {
  walletRepo: WalletRepository;
  transactionRepo: TransactionRepository;
  clock: Clock;
}

export interface GetMonthlyDashboardInput {
  userId: string;
}

const monthRange = (now: Date): { from: Date; to: Date } => ({
  from: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)),
  to: now,
});

const asCurrency = (currency: string): Currency => currency as Currency;

const toSummary = (summary: MonthlyTransactionSummary): MonthlyDashboardSummary => {
  const topCategories = summary.topExpenseCategories.map((cat) => ({
    categoryId: cat.categoryId,
    amountCents: cat.amountCents,
    share: summary.expenseCents > 0 ? cat.amountCents / summary.expenseCents : 0,
  }));

  return {
    currency: asCurrency(summary.currency),
    incomeCents: summary.incomeCents,
    expenseCents: summary.expenseCents,
    netCents: summary.incomeCents - summary.expenseCents,
    topCategories,
  };
};

export const makeGetMonthlyDashboard =
  (deps: GetMonthlyDashboardDeps) =>
  async (
    input: GetMonthlyDashboardInput,
  ): Promise<Result<GetMonthlyDashboardOutput, UserError>> => {
    const userIdResult = UserId.create(input.userId);
    if (!userIdResult.ok) return err(userIdResult.error);

    const userId = userIdResult.value;
    const range = monthRange(deps.clock.now());

    const wallets: Wallet[] = [];
    let cursor: string | undefined;
    do {
      const page = await deps.walletRepo.listByUser(
        userId,
        cursor !== undefined ? { limit: 100, cursor } : { limit: 100 },
      );
      wallets.push(...page.items);
      cursor = page.nextCursor;
    } while (cursor !== undefined);

    const totals = new Map<Currency, number>();
    for (const wallet of wallets) {
      totals.set(wallet.currency, (totals.get(wallet.currency) ?? 0) + wallet.balance);
    }

    const transactionSummaries = await deps.transactionRepo.summarizeMonthlyByCurrency(
      userId,
      range,
    );
    const summariesByCurrency = transactionSummaries.map(toSummary);

    for (const currency of totals.keys()) {
      if (!summariesByCurrency.some((summary) => summary.currency === currency)) {
        summariesByCurrency.push({
          currency,
          incomeCents: 0,
          expenseCents: 0,
          netCents: 0,
          topCategories: [],
        });
      }
    }

    summariesByCurrency.sort((a, b) => a.currency.localeCompare(b.currency));

    return ok({
      range,
      totalsByCurrency: Array.from(totals.entries())
        .map(([currency, balanceCents]) => ({ currency, balanceCents }))
        .sort((a, b) => a.currency.localeCompare(b.currency)),
      summariesByCurrency,
    });
  };
