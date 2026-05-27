import { useNavigate } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { toast } from 'sonner';
import type { CreateBudgetDTO } from '@smart-wallet/shared-types';
import { Button } from '../../../components/ui/button.js';
import { Card } from '../../../components/ui/card.js';
import { Eyebrow } from '../../../components/common/Eyebrow.js';
import { BudgetForm } from '../components/BudgetForm.js';
import { useCreateBudget } from '../queries.js';
import { ApiError, userMessageFor } from '../../../lib/api/errors.js';
import { routes } from '../../../app/routes.js';
import { t } from '../../../lib/i18n.js';

export const CreateBudgetPage = () => {
  const navigate = useNavigate();
  const createMutation = useCreateBudget();

  const goBack = () => {
    void navigate(routes.budgets);
  };

  const handleSubmit = (dto: CreateBudgetDTO) => {
    createMutation.mutate(dto, {
      onSuccess: () => {
        toast.success(t.budgets.createSuccess);
        goBack();
      },
      onError: (err) => {
        if (err instanceof ApiError && err.status === 409) {
          toast.error(t.errors.generic);
          return;
        }
        toast.error(userMessageFor(err));
      },
    });
  };

  return (
    <div className="flex flex-col gap-6 py-4 pb-4">
      <Button variant="ghost" size="sm" onClick={goBack} className="-ml-2 self-start gap-1">
        <ChevronLeft className="size-4" />
        {t.common.back}
      </Button>

      <div className="flex flex-col gap-2">
        <Eyebrow>{t.budgets.createEyebrow}</Eyebrow>
        <h1 className="text-3xl font-bold leading-none tracking-display md:text-4xl">
          {t.budgets.createTitle}
        </h1>
      </div>

      <Card className="p-6">
        <BudgetForm mode="create" onSubmit={handleSubmit} submitting={createMutation.isPending} />
      </Card>
    </div>
  );
};
