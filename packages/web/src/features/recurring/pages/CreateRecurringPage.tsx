import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { toast } from 'sonner';
import type { CreateRecurringDTO } from '@smart-wallet/shared-types';
import { Button } from '../../../components/ui/button.js';
import { Card } from '../../../components/ui/card.js';
import { Eyebrow } from '../../../components/common/Eyebrow.js';
import { RecurringForm } from '../components/RecurringForm.js';
import { useWallets } from '../../wallets/queries.js';
import { useCreateRecurring } from '../queries.js';
import { userMessageFor } from '../../../lib/api/errors.js';
import { routes } from '../../../app/routes.js';
import { t } from '../../../lib/i18n.js';

export const CreateRecurringPage = () => {
  const navigate = useNavigate();
  const { data: walletsData } = useWallets();
  const { mutate, isPending } = useCreateRecurring();
  const [walletId, setWalletId] = useState('');

  const handleSubmit = (values: CreateRecurringDTO) => {
    if (walletId === '') {
      toast.error('Elige una billetera');
      return;
    }
    mutate(values, {
      onSuccess: () => {
        toast.success(t.recurring.createSuccess);
        void navigate(routes.recurring);
      },
      onError: (err) => {
        toast.error(userMessageFor(err));
      },
    });
  };

  const wallets = walletsData?.items ?? [];

  return (
    <div className="flex flex-col gap-6 py-4 pb-4">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => void navigate(routes.recurring)}
        className="-ml-2 self-start gap-1"
      >
        <ChevronLeft className="size-4" />
        {t.common.back}
      </Button>

      <div className="flex flex-col gap-2">
        <Eyebrow>{t.recurring.eyebrow}</Eyebrow>
        <h1 className="text-3xl font-bold leading-none tracking-display md:text-4xl">
          {t.recurring.createTitle}
        </h1>
      </div>

      <Card className="p-6">
        <RecurringForm
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
