import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { toast } from 'sonner';
import type { BudgetListItemDTO } from '@smart-wallet/shared-types';
import { PageHeader } from '../../../components/common/PageHeader.js';
import { ErrorState } from '../../../components/common/ErrorState.js';
import { Button } from '../../../components/ui/button.js';
import { BudgetCard } from '../components/BudgetCard.js';
import { DeleteBudgetDialog } from '../components/DeleteBudgetDialog.js';
import { useListBudgets, useDeleteBudget } from '../queries.js';
import { userMessageFor } from '../../../lib/api/errors.js';
import { routes } from '../../../app/routes.js';
import { t } from '../../../lib/i18n.js';

const ListSkeleton = () => (
  <div className="flex flex-col gap-3">
    {[0, 1, 2].map((i) => (
      <div key={i} className="h-32 animate-pulse rounded-xl bg-muted" />
    ))}
  </div>
);

export const BudgetsPage = () => {
  const { data, isLoading, isError, refetch } = useListBudgets();
  const deleteMutation = useDeleteBudget();
  const [target, setTarget] = useState<BudgetListItemDTO | null>(null);

  const handleDelete = () => {
    if (target === null) return;
    deleteMutation.mutate(target.budgetId, {
      onSuccess: () => {
        toast.success(t.budgets.deleteSuccess);
        setTarget(null);
      },
      onError: (err) => {
        toast.error(userMessageFor(err));
      },
    });
  };

  return (
    <div className="flex flex-col gap-5 pb-4">
      <PageHeader
        eyebrow={t.budgets.eyebrow}
        title={t.budgets.title}
        action={
          <Button asChild size="sm" className="gap-1">
            <Link to={routes.budgetsNew}>
              <Plus className="size-4" />
              {t.budgets.createSubmit}
            </Link>
          </Button>
        }
      />

      {isLoading && <ListSkeleton />}

      {isError && (
        <ErrorState
          message={t.errors.generic}
          onRetry={() => {
            void refetch();
          }}
        />
      )}

      {!isLoading &&
        !isError &&
        data !== undefined &&
        (data.items.length === 0 ? (
          <div className="flex flex-col items-center gap-4 py-16 text-center">
            <p className="text-foreground/60">{t.budgets.emptyState}</p>
            <Button asChild variant="outline" size="sm">
              <Link to={routes.budgetsNew}>{t.budgets.emptyCta}</Link>
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {data.items.map((item) => (
              <BudgetCard key={item.budgetId} item={item} onDelete={setTarget} />
            ))}
          </div>
        ))}

      <DeleteBudgetDialog
        open={target !== null}
        onOpenChange={(open) => {
          if (!open) setTarget(null);
        }}
        onConfirm={handleDelete}
        pending={deleteMutation.isPending}
      />
    </div>
  );
};
