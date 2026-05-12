import { useParams, useNavigate } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { Button } from '../../../components/ui/button.js';
import { Skeleton } from '../../../components/ui/skeleton.js';
import { ErrorState } from '../../../components/common/ErrorState.js';
import { WalletBalanceHeader } from '../components/WalletBalanceHeader.js';
import { useWallet } from '../queries.js';
import { t } from '../../../lib/i18n.js';
import { routes } from '../../../app/routes.js';

export const WalletDetailPage = () => {
  const { walletId } = useParams<{ walletId: string }>();
  const navigate = useNavigate();
  const { data: wallet, isLoading, isError, refetch } = useWallet(walletId);

  const handleBack = () => { void navigate(routes.wallets); };

  return (
    <div className="flex flex-col pb-8">
      <div className="flex items-center gap-2 p-4">
        <Button
          variant="ghost"
          size="sm"
          onClick={handleBack}
          className="gap-1"
        >
          <ChevronLeft className="size-4" />
          {t.common.back}
        </Button>
      </div>

      {isLoading && (
        <div className="flex flex-col items-center gap-2 py-8 px-4">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-10 w-48" />
          <Skeleton className="h-3 w-24" />
        </div>
      )}

      {isError && (
        <ErrorState
          message={t.errors.generic}
          onRetry={() => { void refetch(); }}
        />
      )}

      {!isLoading && !isError && wallet === undefined && (
        <div className="flex flex-col items-center justify-center gap-4 py-16 px-4 text-center">
          <p className="text-muted-foreground">Billetera no encontrada.</p>
          <Button variant="outline" onClick={handleBack}>
            {t.common.back}
          </Button>
        </div>
      )}

      {!isLoading && !isError && wallet !== undefined && (
        <>
          <WalletBalanceHeader wallet={wallet} />
          <div className="px-4">
            <div className="rounded-xl border bg-muted/30 p-6 text-center">
              <p className="text-sm text-muted-foreground">
                Movimientos próximamente
              </p>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
