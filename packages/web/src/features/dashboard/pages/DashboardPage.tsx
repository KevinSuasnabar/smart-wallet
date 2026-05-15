import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus } from 'lucide-react';
import type { Currency } from '@smart-wallet/shared-types';
import { PageHeader } from '../../../components/common/PageHeader.js';
import { ErrorState } from '../../../components/common/ErrorState.js';
import { Button } from '../../../components/ui/button.js';
import { BalanceCard } from '../components/BalanceCard.js';
import { MonthlyStatsCard } from '../components/MonthlyStatsCard.js';
import { TopCategoriesCard } from '../components/TopCategoriesCard.js';
import { CurrencyToggle } from '../components/CurrencyToggle.js';
import { DashboardSkeleton } from '../components/DashboardSkeleton.js';
import { useMonthlyDashboard } from '../hooks/useMonthlyDashboard.js';
import { usePreferredCurrency } from '../../settings/usePreferredCurrency.js';
import { routes } from '../../../app/routes.js';
import { t } from '../../../lib/i18n.js';

const resolveInitialCurrency = (
  preferred: Currency | null,
  available: Currency[],
): Currency | null => {
  if (preferred !== null && available.includes(preferred)) return preferred;
  if (available.length > 0) return available[0] ?? null;
  return null;
};

export const DashboardPage = () => {
  const { currency: preferred } = usePreferredCurrency();
  const [override, setOverride] = useState<Currency | null>(null);

  // Probe with `null` so we can read `availableCurrencies` before deciding
  // which currency to aggregate by. Both calls hit the same React Query
  // cache entries, so the second call is free.
  const probe = useMonthlyDashboard(null);
  const displayCurrency =
    override ?? resolveInitialCurrency(preferred, probe.availableCurrencies);
  const dash = useMonthlyDashboard(displayCurrency);

  if (dash.isLoading) {
    return (
      <div className="flex flex-col gap-5 pb-4">
        <PageHeader eyebrow={t.dashboard.eyebrow} title={t.dashboard.title} />
        <DashboardSkeleton />
      </div>
    );
  }

  if (dash.isError) {
    return (
      <div className="flex flex-col gap-5 pb-4">
        <PageHeader eyebrow={t.dashboard.eyebrow} title={t.dashboard.title} />
        <ErrorState
          message={t.errors.generic}
          onRetry={() => {
            void dash.refetch();
          }}
        />
      </div>
    );
  }

  const hasWallets = dash.totalsByCurrency.length > 0;
  const showToggle =
    hasWallets &&
    dash.availableCurrencies.length > 1 &&
    displayCurrency !== null;

  return (
    <div className="flex flex-col gap-5 pb-4">
      <PageHeader eyebrow={t.dashboard.eyebrow} title={t.dashboard.title} />

      <BalanceCard totals={dash.totalsByCurrency} />

      {showToggle && displayCurrency !== null && (
        <CurrencyToggle
          available={dash.availableCurrencies}
          value={displayCurrency}
          onChange={setOverride}
        />
      )}

      {hasWallets && displayCurrency !== null && (
        <>
          <MonthlyStatsCard
            currency={displayCurrency}
            income={dash.monthlyIncome}
            expenses={dash.monthlyExpenses}
            net={dash.monthlyNet}
          />
          <TopCategoriesCard
            currency={displayCurrency}
            items={dash.topCategories}
          />
          <Button asChild variant="promo" className="w-full gap-2">
            <Link to={routes.transactionsNew}>
              <Plus className="size-4" />
              {t.dashboard.addTransactionCta}
            </Link>
          </Button>
        </>
      )}
    </div>
  );
};
