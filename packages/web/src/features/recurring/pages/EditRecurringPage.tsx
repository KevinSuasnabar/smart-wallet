import { useParams, useNavigate } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { toast } from 'sonner';
import type {
  CreateRecurringDTO,
  UpdateRecurringDTO,
} from '@smart-wallet/shared-types';
import { Button } from '../../../components/ui/button.js';
import { Card } from '../../../components/ui/card.js';
import { Eyebrow } from '../../../components/common/Eyebrow.js';
import { ErrorState } from '../../../components/common/ErrorState.js';
import { RecurringForm } from '../components/RecurringForm.js';
import { useWallets } from '../../wallets/queries.js';
import { useRecurring, useUpdateRecurring } from '../queries.js';
import { ApiError, userMessageFor } from '../../../lib/api/errors.js';
import { routes } from '../../../app/routes.js';
import { t } from '../../../lib/i18n.js';

export const EditRecurringPage = () => {
  const { recurringId = '' } = useParams<{ recurringId: string }>();
  const navigate = useNavigate();

  const recurringQuery = useRecurring(recurringId);
  const walletsQuery = useWallets();
  const updateMutation = useUpdateRecurring(recurringId);

  const goBack = () => {
    void navigate(routes.recurring);
  };

  if (recurringQuery.isLoading || walletsQuery.isLoading) {
    return (
      <div className="flex flex-col gap-6 py-4 pb-4">
        <div className="h-9 w-20 animate-pulse rounded-full bg-muted" />
        <Card className="p-6">
          <div className="flex flex-col gap-5">
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="h-11 animate-pulse rounded-md bg-muted" />
            ))}
          </div>
        </Card>
      </div>
    );
  }

  if (recurringQuery.isError || !recurringQuery.data) {
    const isNotFound =
      recurringQuery.error instanceof ApiError &&
      recurringQuery.error.status === 404;
    return (
      <div className="flex flex-col gap-6 py-4 pb-4">
        <Button
          variant="ghost"
          size="sm"
          onClick={goBack}
          className="-ml-2 self-start gap-1"
        >
          <ChevronLeft className="size-4" />
          {t.common.back}
        </Button>
        <ErrorState
          message={
            isNotFound
              ? t.recurring.notFound
              : userMessageFor(recurringQuery.error)
          }
          onRetry={() => {
            void recurringQuery.refetch();
          }}
        />
      </div>
    );
  }

  const r = recurringQuery.data;
  const wallets = walletsQuery.data?.items ?? [];

  const initialValues = {
    walletId: r.walletId,
    type: r.type,
    amount: r.amount,
    categoryId: r.categoryId,
    description: r.description ?? '',
    dayOfMonth: r.dayOfMonth,
  };

  const handleSubmit = (values: CreateRecurringDTO) => {
    const patch: UpdateRecurringDTO = {};
    if (values.amount !== initialValues.amount) patch.amount = values.amount;
    if (values.categoryId !== initialValues.categoryId) {
      patch.categoryId = values.categoryId;
    }
    const newDesc = values.description ?? '';
    if (newDesc !== initialValues.description) {
      patch.description = newDesc === '' ? null : newDesc;
    }
    if (values.dayOfMonth !== initialValues.dayOfMonth) {
      patch.dayOfMonth = values.dayOfMonth;
    }

    if (Object.keys(patch).length === 0) {
      toast(t.recurring.editNoChanges);
      return;
    }

    updateMutation.mutate(patch, {
      onSuccess: () => {
        toast.success(t.recurring.editSuccess);
        goBack();
      },
      onError: (err) => {
        if (err instanceof ApiError && err.status === 404) {
          toast.error(t.recurring.notFound);
          goBack();
          return;
        }
        toast.error(userMessageFor(err));
      },
    });
  };

  return (
    <div className="flex flex-col gap-6 py-4 pb-4">
      <Button
        variant="ghost"
        size="sm"
        onClick={goBack}
        className="-ml-2 self-start gap-1"
      >
        <ChevronLeft className="size-4" />
        {t.common.back}
      </Button>

      <div className="flex flex-col gap-2">
        <Eyebrow>{t.recurring.editEyebrow}</Eyebrow>
        <h1 className="text-3xl font-bold leading-none tracking-display md:text-4xl">
          {t.recurring.editTitle}
        </h1>
      </div>

      <Card className="p-6">
        <RecurringForm
          mode="edit"
          initialValues={initialValues}
          wallets={wallets}
          walletId={r.walletId}
          onWalletChange={() => {
            /* immutable in edit mode */
          }}
          onSubmit={handleSubmit}
          submitting={updateMutation.isPending}
        />
      </Card>
    </div>
  );
};
