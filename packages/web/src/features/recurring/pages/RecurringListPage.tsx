import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { toast } from 'sonner';
import type { RecurringResponseDTO } from '@smart-wallet/shared-types';
import { PageHeader } from '../../../components/common/PageHeader.js';
import { ErrorState } from '../../../components/common/ErrorState.js';
import { Button } from '../../../components/ui/button.js';
import { RecurringListItem } from '../components/RecurringListItem.js';
import { RecurringListSkeleton } from '../components/RecurringListSkeleton.js';
import { EmptyRecurringState } from '../components/EmptyRecurringState.js';
import { DeleteRecurringDialog } from '../components/DeleteRecurringDialog.js';
import { useRecurringList, useDeleteRecurring } from '../queries.js';
import { userMessageFor } from '../../../lib/api/errors.js';
import { routes } from '../../../app/routes.js';
import { t } from '../../../lib/i18n.js';

export const RecurringListPage = () => {
  const { data, isLoading, isError, refetch } = useRecurringList();
  const deleteMutation = useDeleteRecurring();
  const [target, setTarget] = useState<RecurringResponseDTO | null>(null);

  const handleDelete = () => {
    if (target === null) return;
    deleteMutation.mutate(target.recurringId, {
      onSuccess: () => {
        toast.success(t.recurring.deleteSuccess);
        setTarget(null);
      },
      onError: (err) => {
        toast.error(userMessageFor(err));
      },
    });
  };

  return (
    <div className="flex flex-col gap-5 pb-4">
      <PageHeader
        eyebrow={t.recurring.eyebrow}
        title={t.recurring.title}
        action={
          <Button asChild size="sm" className="gap-1">
            <Link to={routes.recurringNew}>
              <Plus className="size-4" />
              {t.recurring.createSubmit}
            </Link>
          </Button>
        }
      />

      {isLoading && <RecurringListSkeleton />}

      {isError && (
        <ErrorState
          message={t.errors.generic}
          onRetry={() => {
            void refetch();
          }}
        />
      )}

      {!isLoading && !isError && data !== undefined && (
        data.items.length === 0 ? (
          <EmptyRecurringState />
        ) : (
          <div className="flex flex-col gap-3">
            {data.items.map((item) => (
              <RecurringListItem
                key={item.recurringId}
                item={item}
                onDelete={setTarget}
              />
            ))}
          </div>
        )
      )}

      <DeleteRecurringDialog
        open={target !== null}
        onOpenChange={(open) => {
          if (!open) setTarget(null);
        }}
        onConfirm={handleDelete}
        pending={deleteMutation.isPending}
      />
    </div>
  );
};
