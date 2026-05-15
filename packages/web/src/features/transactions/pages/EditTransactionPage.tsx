import { useMemo } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { toast } from 'sonner';
import type {
  AddTransactionDTO,
  UpdateTransactionDTO,
} from '@smart-wallet/shared-types';
import { Button } from '../../../components/ui/button.js';
import { Card } from '../../../components/ui/card.js';
import { Eyebrow } from '../../../components/common/Eyebrow.js';
import { ErrorState } from '../../../components/common/ErrorState.js';
import { TransactionForm } from '../components/TransactionForm.js';
import { useWallets } from '../../wallets/queries.js';
import { useTransaction, useUpdateTransaction } from '../queries.js';
import { generateIdempotencyKey } from '../../../lib/idempotency.js';
import { ApiError, userMessageFor } from '../../../lib/api/errors.js';
import { routes } from '../../../app/routes.js';
import { t } from '../../../lib/i18n.js';

/**
 * Edits an existing transaction. Deep-linkable: loads the transaction via
 * GET, hydrates the form with `initialValues`, computes a diff on submit,
 * and PATCHes only the changed fields. If nothing changed, shows a toast
 * and does not fire a request.
 */
export const EditTransactionPage = () => {
  const { walletId = '', transactionId = '' } = useParams<{
    walletId: string;
    transactionId: string;
  }>();
  const navigate = useNavigate();
  const location = useLocation();

  const txQuery = useTransaction(walletId, transactionId);
  const walletsQuery = useWallets();
  const updateMutation = useUpdateTransaction(walletId);

  // Fresh idempotency key per submit attempt. useMemo ensures the same key is
  // reused if the user double-clicks submit on a single attempt; a manual
  // retry after error will produce a NEW key by re-rendering the page.
  const idempotencyKey = useMemo(() => generateIdempotencyKey(), []);

  const goBack = () => {
    const from = (location.state as { from?: string } | null)?.from;
    void navigate(from ?? routes.walletDetail(walletId), { replace: true });
  };

  // Loading state
  if (txQuery.isLoading || walletsQuery.isLoading) {
    return (
      <div className="flex flex-col gap-6 py-4 pb-4">
        <div className="h-9 w-20 animate-pulse rounded-full bg-muted" />
        <div className="flex flex-col gap-2">
          <div className="h-3 w-20 animate-pulse rounded bg-muted" />
          <div className="h-10 w-64 animate-pulse rounded bg-muted" />
        </div>
        <Card className="p-6">
          <div className="flex flex-col gap-5">
            <div className="h-11 animate-pulse rounded-md bg-muted" />
            <div className="h-11 animate-pulse rounded-md bg-muted" />
            <div className="h-11 animate-pulse rounded-md bg-muted" />
            <div className="h-11 animate-pulse rounded-md bg-muted" />
            <div className="h-11 animate-pulse rounded-md bg-muted" />
          </div>
        </Card>
      </div>
    );
  }

  // Error / not-found state
  if (txQuery.isError || !txQuery.data) {
    const isNotFound = txQuery.error instanceof ApiError && txQuery.error.status === 404;
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
          message={isNotFound ? t.transactions.editNotFound : userMessageFor(txQuery.error)}
          onRetry={() => { void txQuery.refetch(); }}
        />
      </div>
    );
  }

  const tx = txQuery.data;
  const wallets = walletsQuery.data?.items ?? [];

  // Build initialValues from the loaded transaction. Description may be
  // absent in the response (the server omits it when null); normalize to ''.
  const initialValues: Partial<AddTransactionDTO> = {
    type: tx.type,
    amount: tx.amount,
    categoryId: tx.categoryId,
    occurredAt: tx.occurredAt,
    description: tx.description ?? '',
    currency: tx.currency,
  };

  const handleSubmit = (values: AddTransactionDTO) => {
    // Diff: only send fields whose value differs from initialValues.
    const dto: UpdateTransactionDTO = {};
    if (values.amount !== initialValues.amount) {
      dto.amount = values.amount;
    }
    if ((values.description ?? '') !== (initialValues.description ?? '')) {
      // Empty string clears the description on the server (handler maps '' → null).
      dto.description = values.description ?? '';
    }
    if (values.categoryId !== initialValues.categoryId) {
      dto.categoryId = values.categoryId;
    }
    if (values.occurredAt !== initialValues.occurredAt) {
      dto.occurredAt = values.occurredAt;
    }

    if (Object.keys(dto).length === 0) {
      toast(t.transactions.editNoChanges);
      return;
    }

    updateMutation.mutate(
      { transactionId, dto, idempotencyKey },
      {
        onSuccess: () => {
          toast.success(t.transactions.editSuccess);
          goBack();
        },
        onError: (err) => {
          if (err instanceof ApiError && err.status === 404) {
            toast.error(t.transactions.editNotFound);
            goBack();
            return;
          }
          toast.error(userMessageFor(err));
        },
      },
    );
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
        <Eyebrow>{t.transactions.editEyebrow}</Eyebrow>
        <h1 className="text-3xl font-bold leading-none tracking-display md:text-4xl">
          {t.transactions.editTitle}
        </h1>
      </div>

      <Card className="p-6">
        <TransactionForm
          mode="edit"
          initialValues={initialValues}
          wallets={wallets}
          walletId={walletId}
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
