import { Link } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { PageHeader } from '../../../components/common/PageHeader.js';
import { ErrorState } from '../../../components/common/ErrorState.js';
import { Button } from '../../../components/ui/button.js';
import { WalletCard } from '../components/WalletCard.js';
import { WalletsListSkeleton } from '../components/WalletsListSkeleton.js';
import { EmptyWalletsState } from '../components/EmptyWalletsState.js';
import { useWallets } from '../queries.js';
import { routes } from '../../../app/routes.js';
import { t } from '../../../lib/i18n.js';

export const WalletsListPage = () => {
  const { data, isLoading, isError, refetch } = useWallets();

  return (
    <div className="flex flex-col pb-4">
      <PageHeader
        eyebrow="Cuentas"
        title={t.wallets.listTitle}
        action={
          <Button asChild size="sm" className="gap-1">
            <Link to={routes.walletsNew}>
              <Plus className="size-4" />
              {t.wallets.createCta}
            </Link>
          </Button>
        }
      />

      {isLoading && <WalletsListSkeleton />}

      {isError && (
        <ErrorState
          message={t.errors.generic}
          onRetry={() => { void refetch(); }}
        />
      )}

      {!isLoading && !isError && data !== undefined && (
        data.items.length === 0
          ? <EmptyWalletsState />
          : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {data.items.map((wallet) => (
                <WalletCard key={wallet.walletId} wallet={wallet} />
              ))}
            </div>
          )
      )}
    </div>
  );
};
