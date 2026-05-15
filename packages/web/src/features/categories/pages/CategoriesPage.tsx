import { useState } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '../../../components/ui/button.js';
import { Skeleton } from '../../../components/ui/skeleton.js';
import { ErrorState } from '../../../components/common/ErrorState.js';
import { PageHeader } from '../../../components/common/PageHeader.js';
import { useCategories } from '../queries.js';
import { CategoryList, type CategoryEditTarget } from '../components/CategoryList.js';
import { CreateCategoryDialog } from '../components/CreateCategoryDialog.js';
import { DeleteCategoryConfirm } from '../components/DeleteCategoryConfirm.js';
import { EditCategoryDialog } from '../components/EditCategoryDialog.js';
import { t } from '../../../lib/i18n.js';

interface DeleteTarget {
  categoryId: string;
  name: string;
  kind: 'custom' | 'predefined';
}

export const CategoriesPage = () => {
  const { data, isLoading, isError, refetch } = useCategories();
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<CategoryEditTarget | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);

  return (
    <div className="flex flex-col pb-4">
      <PageHeader
        eyebrow="Organización"
        title={t.categories.listTitle}
        action={
          <Button size="sm" onClick={() => setCreateOpen(true)} className="gap-1">
            <Plus className="size-4" />
            {t.categories.createButton}
          </Button>
        }
      />

      {isLoading && (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-12 w-full rounded-md" />
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
          onEdit={setEditTarget}
          onDelete={setDeleteTarget}
        />
      )}

      <CreateCategoryDialog open={createOpen} onOpenChange={setCreateOpen} />

      <EditCategoryDialog
        open={editTarget !== null}
        onOpenChange={(open) => {
          if (!open) setEditTarget(null);
        }}
        target={editTarget}
      />

      {deleteTarget && (
        <DeleteCategoryConfirm
          open={deleteTarget !== null}
          onOpenChange={(open) => {
            if (!open) setDeleteTarget(null);
          }}
          categoryId={deleteTarget.categoryId}
          categoryName={deleteTarget.name}
          kind={deleteTarget.kind}
        />
      )}
    </div>
  );
};
