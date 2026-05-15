import { useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { toast } from 'sonner';
import type { AddTransactionDTO } from '@smart-wallet/shared-types';
import { Button } from '../../../components/ui/button.js';
import { Card } from '../../../components/ui/card.js';
import { Eyebrow } from '../../../components/common/Eyebrow.js';
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
    <div className="flex flex-col gap-6 py-4 pb-4">
      <Button
        variant="ghost"
        size="sm"
        onClick={handleBack}
        className="-ml-2 self-start gap-1"
      >
        <ChevronLeft className="size-4" />
        {t.common.back}
      </Button>

      <div className="flex flex-col gap-1.5">
        <Eyebrow>Nuevo movimiento</Eyebrow>
        <h1 className="text-2xl font-bold tracking-display">
          {t.transactions.addTitle}
        </h1>
      </div>

      <Card className="p-6">
        <TransactionForm
          wallets={wallets}
          walletId={walletId}
          onWalletChange={setWalletId}
          onSubmit={handleSubmit}
          submitting={isPending}
        />
      </Card>
    </div>
  );
};
