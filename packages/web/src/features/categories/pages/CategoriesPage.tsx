import { useState } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '../../../components/ui/button.js';
import { Skeleton } from '../../../components/ui/skeleton.js';
import { ErrorState } from '../../../components/common/ErrorState.js';
import { useCategories } from '../queries.js';
import { CategoryList } from '../components/CategoryList.js';
import { CreateCategoryDialog } from '../components/CreateCategoryDialog.js';
import { DeleteCategoryConfirm } from '../components/DeleteCategoryConfirm.js';
import { t } from '../../../lib/i18n.js';

export const CategoriesPage = () => {
  const { data, isLoading, isError, refetch } = useCategories();
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<
    { categoryId: string; name: string } | null
  >(null);

  return (
    <div className="flex flex-col pb-8 px-4">
      <div className="flex items-center justify-between gap-2 py-4">
        <h1 className="text-xl font-semibold">{t.categories.listTitle}</h1>
        <Button
          size="sm"
          onClick={() => setCreateOpen(true)}
          className="gap-1"
        >
          <Plus className="size-4" />
          {t.categories.createButton}
        </Button>
      </div>

      {isLoading && (
        <div className="flex flex-col gap-2 py-4">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-12 w-full rounded-xl" />
          ))}
        </div>
      )}

      {isError && (
        <ErrorState
          message={t.errors.generic}
          onRetry={() => { void refetch(); }}
        />
      )}

      {!isLoading && !isError && data && (
        <CategoryList
          predefined={data.predefined}
          custom={data.custom}
          onDeleteCustom={(categoryId, name) =>
            setDeleteTarget({ categoryId, name })
          }
        />
      )}

      <CreateCategoryDialog open={createOpen} onOpenChange={setCreateOpen} />

      {deleteTarget && (
        <DeleteCategoryConfirm
          open={deleteTarget !== null}
          onOpenChange={(open) => {
            if (!open) setDeleteTarget(null);
          }}
          categoryId={deleteTarget.categoryId}
          categoryName={deleteTarget.name}
        />
      )}
    </div>
  );
};
