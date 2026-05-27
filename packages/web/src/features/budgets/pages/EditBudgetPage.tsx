import { useParams, useNavigate } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { toast } from 'sonner';
import type { UpdateBudgetDTO } from '@smart-wallet/shared-types';
import { Button } from '../../../components/ui/button.js';
import { Card } from '../../../components/ui/card.js';
import { Eyebrow } from '../../../components/common/Eyebrow.js';
import { ErrorState } from '../../../components/common/ErrorState.js';
import { BudgetForm } from '../components/BudgetForm.js';
import { useListBudgets, useUpdateBudget } from '../queries.js';
import { userMessageFor } from '../../../lib/api/errors.js';
import { routes } from '../../../app/routes.js';
import { t } from '../../../lib/i18n.js';

export const EditBudgetPage = () => {
  const { budgetId = '' } = useParams<{ budgetId: string }>();
  const navigate = useNavigate();

  const listQuery = useListBudgets();
  const updateMutation = useUpdateBudget(budgetId);

  const goBack = () => {
    void navigate(routes.budgets);
  };

  if (listQuery.isLoading) {
    return (
      <div className="flex flex-col gap-6 py-4 pb-4">
        <div className="h-9 w-20 animate-pulse rounded-full bg-muted" />
        <Card className="p-6">
          <div className="flex flex-col gap-5">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-11 animate-pulse rounded-md bg-muted" />
            ))}
          </div>
        </Card>
      </div>
    );
  }

  const budget = listQuery.data?.items.find((b) => b.budgetId === budgetId);

  if (listQuery.isError || budget === undefined) {
    return (
      <div className="flex flex-col gap-6 py-4 pb-4">
        <Button variant="ghost" size="sm" onClick={goBack} className="-ml-2 self-start gap-1">
          <ChevronLeft className="size-4" />
          {t.common.back}
        </Button>
        <ErrorState
          message={budget === undefined ? t.budgets.notFound : userMessageFor(listQuery.error)}
          onRetry={() => {
            void listQuery.refetch();
          }}
        />
      </div>
    );
  }

  const handleSubmit = (dto: UpdateBudgetDTO) => {
    if (Object.keys(dto).length === 0) {
      toast(t.budgets.editNoChanges);
      return;
    }

    updateMutation.mutate(dto, {
      onSuccess: () => {
        toast.success(t.budgets.editSuccess);
        goBack();
      },
      onError: (err) => {
        toast.error(userMessageFor(err));
      },
    });
  };

  return (
    <div className="flex flex-col gap-6 py-4 pb-4">
      <Button variant="ghost" size="sm" onClick={goBack} className="-ml-2 self-start gap-1">
        <ChevronLeft className="size-4" />
        {t.common.back}
      </Button>

      <div className="flex flex-col gap-2">
        <Eyebrow>{t.budgets.editEyebrow}</Eyebrow>
        <h1 className="text-3xl font-bold leading-none tracking-display md:text-4xl">
          {t.budgets.editTitle}
        </h1>
      </div>

      <Card className="p-6">
        <BudgetForm
          mode="edit"
          currency={budget.currency}
          initialValues={{
            limit: budget.limit,
            rollover: budget.rollover,
          }}
          onSubmit={handleSubmit}
          submitting={updateMutation.isPending}
        />
      </Card>
    </div>
  );
};
