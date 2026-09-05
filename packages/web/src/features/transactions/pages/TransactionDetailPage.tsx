import { useState, type ReactNode } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { ChevronLeft, Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '../../../components/ui/button.js';
import { Card } from '../../../components/ui/card.js';
import { Skeleton } from '../../../components/ui/skeleton.js';
import { ErrorState } from '../../../components/common/ErrorState.js';
import { Eyebrow } from '../../../components/common/Eyebrow.js';
import { TypeTag } from '../../../components/common/TypeTag.js';
import { DeleteTransactionDialog } from '../components/DeleteTransactionDialog.js';
import { useTransaction, useDeleteTransaction } from '../queries.js';
import { useWallet } from '../../wallets/queries.js';
import { useCategories } from '../../categories/queries.js';
import { useParticipantName } from '../../participants/queries.js';
import { formatSignedAmount } from '../../../lib/currency.js';
import { ApiError, userMessageFor } from '../../../lib/api/errors.js';
import { cn } from '../../../lib/utils.js';
import { routes } from '../../../app/routes.js';
import { t } from '../../../lib/i18n.js';

interface DetailRowProps {
  label: string;
  children: ReactNode;
}

/** One label/value pair of the definition list. Hairline separated, no card chrome. */
const DetailRow = ({ label, children }: DetailRowProps) => (
  <div className="flex items-baseline justify-between gap-6 border-b border-border py-3 last:border-b-0">
    <dt className="shrink-0 font-mono text-[10px] uppercase tracking-caption text-muted-foreground">
      {label}
    </dt>
    <dd className="min-w-0 text-right text-sm font-medium">{children}</dd>
  </div>
);

/**
 * Read-only view of a single transaction, reached by tapping a row in any
 * transaction list. Deep-linkable — it loads the transaction by id rather than
 * relying on router state, so a shared or reloaded URL resolves on its own.
 *
 * Edit and delete live here too: on mobile the row's icon buttons are cramped,
 * and this page is where the user has the full context to act.
 */
export const TransactionDetailPage = () => {
  const { walletId = '', transactionId = '' } = useParams<{
    walletId: string;
    transactionId: string;
  }>();
  const navigate = useNavigate();
  const location = useLocation();

  const txQuery = useTransaction(walletId, transactionId);
  const { data: wallet } = useWallet(walletId);
  const { data: categories } = useCategories();
  const participantName = useParticipantName();
  const deleteMutation = useDeleteTransaction(walletId);
  const [deleteOpen, setDeleteOpen] = useState(false);

  // Where "back" lands: the list that linked here, or the wallet as a fallback
  // for a cold deep link.
  const origin = (location.state as { from?: string } | null)?.from;
  const fallback = routes.walletDetail(walletId);

  const goBack = () => {
    void navigate(origin ?? fallback);
  };

  const categoryName = (categoryId: string): string | undefined => {
    if (!categories) return undefined;
    return [...categories.predefined, ...categories.custom].find(
      (c) => c.categoryId === categoryId,
    )?.name;
  };

  const backButton = (
    <Button variant="ghost" size="sm" onClick={goBack} className="-ml-2 self-start gap-1">
      <ChevronLeft className="size-4" />
      {t.common.back}
    </Button>
  );

  if (txQuery.isLoading) {
    return (
      <div className="flex flex-col gap-6 py-4 pb-4">
        <Skeleton className="h-9 w-20 rounded-full" />
        <div className="flex flex-col gap-10 rounded-block bg-secondary px-6 py-12 md:px-10 md:py-14">
          <Skeleton className="h-3 w-24 rounded-sm" />
          <Skeleton className="h-14 w-3/4 rounded-sm md:h-20" />
          <Skeleton className="h-3 w-28 rounded-sm" />
        </div>
        <Card className="px-5 py-2 md:px-6">
          <Skeleton className="my-3 h-4 w-full rounded-sm" />
          <Skeleton className="my-3 h-4 w-full rounded-sm" />
          <Skeleton className="my-3 h-4 w-full rounded-sm" />
          <Skeleton className="my-3 h-4 w-full rounded-sm" />
        </Card>
      </div>
    );
  }

  if (txQuery.isError || !txQuery.data) {
    const isNotFound = txQuery.error instanceof ApiError && txQuery.error.status === 404;
    return (
      <div className="flex flex-col gap-6 py-4 pb-4">
        {backButton}
        <ErrorState
          message={isNotFound ? t.transactions.editNotFound : userMessageFor(txQuery.error)}
          onRetry={() => {
            void txQuery.refetch();
          }}
        />
      </div>
    );
  }

  const tx = txQuery.data;
  const category = categoryName(tx.categoryId) ?? tx.categoryId;

  const handleEdit = () => {
    void navigate(routes.walletTransactionEdit(walletId, transactionId), {
      state: { from: location.pathname },
    });
  };

  const confirmDelete = () => {
    deleteMutation.mutate(
      { transactionId },
      {
        onSuccess: () => {
          toast.success(t.transactions.deleteSuccess);
          setDeleteOpen(false);
          // replace: the deleted transaction must not stay in history.
          void navigate(origin ?? fallback, { replace: true });
        },
        onError: (err) => {
          toast.error(userMessageFor(err));
          setDeleteOpen(false);
        },
      },
    );
  };

  return (
    <div className="flex flex-col gap-6 py-4 pb-4">
      <div className="flex items-center justify-between gap-2">
        {backButton}
        <div className="flex items-center gap-0.5">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={handleEdit}
            aria-label={t.transactions.editTitle}
            className="text-muted-foreground hover:text-foreground"
          >
            <Pencil className="size-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => setDeleteOpen(true)}
            aria-label={t.transactions.deleteDialogTitle}
            className="text-muted-foreground hover:text-destructive"
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      </div>

      {/* Hero: the amount is the headline, everything else is metadata. */}
      <div className="flex flex-col gap-6 rounded-block bg-secondary px-6 py-10 md:px-10 md:py-12">
        <div className="flex items-center justify-between gap-4">
          <Eyebrow>{t.transactions.detailEyebrow}</Eyebrow>
          <TypeTag type={tx.type} />
        </div>
        <p
          className={cn(
            'break-words text-4xl font-bold leading-none tracking-display tabular-nums md:text-5xl',
            tx.type === 'income' ? 'text-success' : 'text-foreground',
          )}
        >
          {formatSignedAmount(tx.amount, tx.currency, tx.type)}
        </p>
        <p className="truncate text-sm font-semibold tracking-tightest">{category}</p>
      </div>

      <Card className="px-5 py-2 md:px-6">
        <dl>
          <DetailRow label={t.transactions.occurredAtLabel}>
            {format(new Date(tx.occurredAt), "d 'de' MMMM 'de' yyyy", { locale: es })}
          </DetailRow>
          <DetailRow label={t.transactions.categoryLabel}>{category}</DetailRow>
          <DetailRow label={t.transactions.detailDescriptionLabel}>
            {tx.description !== undefined && tx.description !== '' ? (
              tx.description
            ) : (
              <span className="text-muted-foreground">
                {t.transactions.detailNoDescription}
              </span>
            )}
          </DetailRow>
          <DetailRow label={t.transactions.detailParticipantLabel}>
            {tx.participantId === undefined ? (
              <span className="text-muted-foreground">{t.participants.unattributed}</span>
            ) : (
              // A soft-deleted participant keeps its id on the transaction but
              // drops out of the list, so an unresolved id is expected here.
              (participantName(tx.participantId) ?? (
                <span className="text-muted-foreground">{t.participants.deletedFallback}</span>
              ))
            )}
          </DetailRow>
          <DetailRow label={t.transactions.detailWalletLabel}>
            {wallet?.name ?? tx.walletId}
          </DetailRow>
          <DetailRow label={t.transactions.detailCreatedAtLabel}>
            {format(new Date(tx.createdAt), 'd MMM yyyy, HH:mm', { locale: es })}
          </DetailRow>
        </dl>
      </Card>

      <DeleteTransactionDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        onConfirm={confirmDelete}
        pending={deleteMutation.isPending}
      />
    </div>
  );
};
