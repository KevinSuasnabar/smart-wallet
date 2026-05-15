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

interface DeleteWalletDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  pending: boolean;
}

/**
 * Strong-copy confirmation for wallet deletion. Cascade hard-deletes the
 * wallet and every transaction it contains, so the body text is explicit
 * and the destructive button is styled accordingly.
 *
 * Locks during the in-flight DELETE (overlay/Escape dismissal blocked,
 * both buttons disabled) so a slow request can't be aborted mid-cascade.
 */
export const DeleteWalletDialog = ({
  open,
  onOpenChange,
  onConfirm,
  pending,
}: DeleteWalletDialogProps) => {
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
          <DialogTitle>{t.wallets.deleteDialogTitle}</DialogTitle>
          <DialogDescription>
            {t.wallets.deleteDialogBody}
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
            {pending ? t.app.loading : t.wallets.deleteDialogConfirm}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
