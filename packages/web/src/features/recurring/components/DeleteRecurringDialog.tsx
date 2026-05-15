import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../../components/ui/dialog.js';
import { Button } from '../../../components/ui/button.js';
import { t } from '../../../lib/i18n.js';

interface DeleteRecurringDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  pending: boolean;
}

export const DeleteRecurringDialog = ({
  open,
  onOpenChange,
  onConfirm,
  pending,
}: DeleteRecurringDialogProps) => {
  const handleOpenChange = (next: boolean) => {
    if (pending && !next) return;
    onOpenChange(next);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        onEscapeKeyDown={(e) => {
          if (pending) e.preventDefault();
        }}
        onPointerDownOutside={(e) => {
          if (pending) e.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle>{t.recurring.deleteDialogTitle}</DialogTitle>
          <DialogDescription>
            {t.recurring.deleteDialogBody}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={() => onOpenChange(false)}
          >
            {t.common.cancel}
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={pending}
            onClick={onConfirm}
          >
            {pending ? t.app.loading : t.recurring.deleteDialogConfirm}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
