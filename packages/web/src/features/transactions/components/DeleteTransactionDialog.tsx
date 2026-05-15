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

interface DeleteTransactionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  pending: boolean;
}

/**
 * Controlled confirmation dialog for transaction delete. The pending prop
 * locks the dialog in place during an in-flight DELETE — both buttons
 * disable and overlay/Escape dismissal is blocked (REQ-FE-UI-04).
 */
export const DeleteTransactionDialog = ({
  open,
  onOpenChange,
  onConfirm,
  pending,
}: DeleteTransactionDialogProps) => {
  const handleOpenChange = (next: boolean) => {
    // Block dismissal while the request is in flight.
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
          <DialogTitle>{t.transactions.deleteDialogTitle}</DialogTitle>
          <DialogDescription>
            {t.transactions.deleteDialogBody}
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
            {pending ? t.app.loading : t.transactions.deleteDialogConfirm}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
