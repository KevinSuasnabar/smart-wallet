import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../../components/ui/dialog.js';
import { Button } from '../../../components/ui/button.js';
import { useDeleteCustomCategory } from '../queries.js';
import { userMessageFor } from '../../../lib/api/errors.js';
import { t } from '../../../lib/i18n.js';

interface DeleteCategoryConfirmProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categoryId: string;
  categoryName: string;
}

export const DeleteCategoryConfirm = ({
  open,
  onOpenChange,
  categoryId,
  categoryName,
}: DeleteCategoryConfirmProps) => {
  const { mutate, isPending } = useDeleteCustomCategory();

  const handleDelete = () => {
    mutate(categoryId, {
      onSuccess: () => {
        toast.success('Categoría eliminada');
        onOpenChange(false);
      },
      onError: (err) => {
        toast.error(userMessageFor(err));
      },
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t.categories.deleteTitle}</DialogTitle>
          <DialogDescription>
            {t.categories.deleteConfirm}
            <br />
            <strong className="text-foreground">{categoryName}</strong>
          </DialogDescription>
        </DialogHeader>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
          >
            {t.categories.cancelCta}
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={handleDelete}
            disabled={isPending}
          >
            {isPending ? t.app.loading : t.categories.deleteCta}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
