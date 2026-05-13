import { useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { toast } from 'sonner';
import type { AddTransactionDTO } from '@smart-wallet/shared-types';
import { Button } from '../../../components/ui/button.js';
import { TransactionForm } from '../components/TransactionForm.js';
import { useWallets } from '../../wallets/queries.js';
import { useAddTransaction } from '../queries.js';
import { generateIdempotencyKey } from '../../../lib/idempotency.js';
import { userMessageFor } from '../../../lib/api/errors.js';
import { routes } from '../../../app/routes.js';
import { t } from '../../../lib/i18n.js';

export const AddTransactionPage = () => {
  const { walletId: initialWalletId } = useParams<{ walletId: string }>();
  const navigate = useNavigate();
  const { data: walletsData } = useWallets();

  const [walletId, setWalletId] = useState(initialWalletId ?? '');
  const idempotencyKey = useMemo(() => generateIdempotencyKey(), []);

  const { mutate, isPending } = useAddTransaction(walletId);

  const handleSubmit = (values: AddTransactionDTO) => {
    if (walletId === '') {
      toast.error('Elegí una billetera');
      return;
    }
    mutate(
      { dto: values, idempotencyKey },
      {
        onSuccess: () => {
          toast.success('Transacción guardada');
          void navigate(-1);
        },
        onError: (err) => {
          toast.error(userMessageFor(err));
        },
      },
    );
  };

  const handleBack = () => {
    if (initialWalletId !== undefined && initialWalletId !== '') {
      void navigate(routes.walletDetail(initialWalletId));
    } else {
      void navigate(routes.wallets);
    }
  };

  const wallets = walletsData?.items ?? [];

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

      <div className="px-4">
        <h1 className="text-xl font-semibold mb-6">{t.transactions.addTitle}</h1>

        <TransactionForm
          wallets={wallets}
          walletId={walletId}
          onWalletChange={setWalletId}
          onSubmit={handleSubmit}
          submitting={isPending}
        />
      </div>
    </div>
  );
};
