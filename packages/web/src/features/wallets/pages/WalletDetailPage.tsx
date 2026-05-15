import { useState } from 'react';
import { useParams, useNavigate, useLocation, Link } from 'react-router-dom';
import { ChevronLeft, Pencil, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '../../../components/ui/button.js';
import { Skeleton } from '../../../components/ui/skeleton.js';
import { ErrorState } from '../../../components/common/ErrorState.js';
import { Eyebrow } from '../../../components/common/Eyebrow.js';
import { WalletBalanceHeader } from '../components/WalletBalanceHeader.js';
import { DeleteWalletDialog } from '../components/DeleteWalletDialog.js';
import { RecentTransactionsList } from '../../transactions/components/RecentTransactionsList.js';
import { DeleteTransactionDialog } from '../../transactions/components/DeleteTransactionDialog.js';
import { useWallet, useDeleteWallet } from '../queries.js';
import { useDeleteTransaction } from '../../transactions/queries.js';
import { userMessageFor } from '../../../lib/api/errors.js';
import { t } from '../../../lib/i18n.js';
import { routes } from '../../../app/routes.js';

export const WalletDetailPage = () => {
  const { walletId } = useParams<{ walletId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { data: wallet, isLoading, isError, refetch } = useWallet(walletId);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [walletDeleteOpen, setWalletDeleteOpen] = useState(false);
  const deleteMutation = useDeleteTransaction(wallet?.walletId ?? '');
  const deleteWalletMutation = useDeleteWallet();

  const handleBack = () => { void navigate(routes.wallets); };

  const handleEdit = () => {
    if (wallet === undefined) return;
    void navigate(routes.walletEdit(wallet.walletId), {
      state: { from: location.pathname },
    });
  };

  const confirmDelete = () => {
    if (pendingDeleteId === null) return;
    deleteMutation.mutate(
      { transactionId: pendingDeleteId },
      {
        onSuccess: () => {
          toast.success(t.transactions.deleteSuccess);
          setPendingDeleteId(null);
        },
        onError: (err) => {
          toast.error(userMessageFor(err));
          setPendingDeleteId(null);
        },
      },
    );
  };

  const confirmDeleteWallet = () => {
    if (wallet === undefined) return;
    deleteWalletMutation.mutate(
      { walletId: wallet.walletId },
      {
        onSuccess: () => {
          toast.success(t.wallets.deleteSuccess);
          setWalletDeleteOpen(false);
          void navigate(routes.wallets, { replace: true });
        },
        onError: (err) => {
          toast.error(userMessageFor(err));
          setWalletDeleteOpen(false);
        },
      },
    );
  };

  return (
    <div className="flex flex-col gap-6 py-4 pb-4">
      <div className="flex items-center justify-between gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={handleBack}
          className="-ml-2 gap-1"
        >
          <ChevronLeft className="size-4" />
          {t.common.back}
        </Button>
        {wallet !== undefined && (
          <div className="flex items-center gap-0.5">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={handleEdit}
              aria-label={t.wallets.editTitle}
              className="text-muted-foreground hover:text-foreground"
            >
              <Pencil className="size-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => setWalletDeleteOpen(true)}
              aria-label={t.wallets.deleteDialogTitle}
              className="text-muted-foreground hover:text-destructive"
            >
              <Trash2 className="size-4" />
            </Button>
          </div>
        )}
      </div>

      {isLoading && (
        <div className="flex flex-col gap-10 rounded-block bg-secondary px-6 py-12 md:px-10 md:py-14">
          <div className="flex items-center justify-between">
            <Skeleton className="h-3 w-24 rounded-sm" />
            <Skeleton className="h-3 w-12 rounded-sm" />
          </div>
          <Skeleton className="h-14 w-3/4 rounded-sm md:h-20" />
          <Skeleton className="h-3 w-28 rounded-sm" />
        </div>
      )}

      {isError && (
        <ErrorState
          message={t.errors.generic}
          onRetry={() => { void refetch(); }}
        />
      )}

      {!isLoading && !isError && wallet === undefined && (
        <div className="flex flex-col items-center gap-4 rounded-block border border-border py-16 text-center">
          <p className="text-muted-foreground">Billetera no encontrada.</p>
          <Button variant="outline" onClick={handleBack}>
            {t.common.back}
          </Button>
        </div>
      )}

      {!isLoading && !isError && wallet !== undefined && (
        <>
          <WalletBalanceHeader wallet={wallet} />

          <section className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-4">
              <div className="flex flex-col gap-1.5">
                <Eyebrow>Actividad</Eyebrow>
                <h2 className="text-2xl font-bold leading-none tracking-display md:text-3xl">
                  {t.transactions.listTitle}
                </h2>
              </div>
              <Link to={routes.walletTransactionsNew(wallet.walletId)}>
                <Button size="sm" className="gap-1">
                  <Plus className="size-4" />
                  {t.transactions.addTitle}
                </Button>
              </Link>
            </div>

            <RecentTransactionsList
              walletId={wallet.walletId}
              limit={10}
              onDelete={(id) => setPendingDeleteId(id)}
            />
          </section>
        </>
      )}

      <DeleteTransactionDialog
        open={pendingDeleteId !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDeleteId(null);
        }}
        onConfirm={confirmDelete}
        pending={deleteMutation.isPending}
      />

      <DeleteWalletDialog
        open={walletDeleteOpen}
        onOpenChange={setWalletDeleteOpen}
        onConfirm={confirmDeleteWallet}
        pending={deleteWalletMutation.isPending}
      />
    </div>
  );
};
