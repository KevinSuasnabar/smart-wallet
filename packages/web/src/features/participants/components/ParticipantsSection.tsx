import { useState } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { isWalletColor } from '@smart-wallet/shared-types';
import type { ParticipantResponseDTO, WalletColor } from '@smart-wallet/shared-types';
import { Card } from '../../../components/ui/card.js';
import { Button } from '../../../components/ui/button.js';
import { Skeleton } from '../../../components/ui/skeleton.js';
import { Eyebrow } from '../../../components/common/Eyebrow.js';
import { ErrorState } from '../../../components/common/ErrorState.js';
import { ParticipantFormDialog } from './ParticipantFormDialog.js';
import { DeleteParticipantDialog } from './DeleteParticipantDialog.js';
import { useParticipants, useDeleteParticipant } from '../queries.js';
import { userMessageFor } from '../../../lib/api/errors.js';
import { cn } from '../../../lib/utils.js';
import { t } from '../../../lib/i18n.js';

/**
 * Literal record so Tailwind's JIT can see every class name — a computed
 * `bg-block-${color}` would be purged from the build.
 */
const SWATCH_BG: Record<WalletColor, string> = {
  lime: 'bg-block-lime',
  lilac: 'bg-block-lilac',
  cream: 'bg-block-cream',
  pink: 'bg-block-pink',
  mint: 'bg-block-mint',
  coral: 'bg-block-coral',
  navy: 'bg-block-navy',
};

/**
 * Account-level CRUD for the people a transaction can be attributed to.
 *
 * Lives in Ajustes rather than getting its own tab: on a shared wallet this is
 * a set-once list of two or three names, not something you visit often.
 */
export const ParticipantsSection = () => {
  const { data, isLoading, isError, refetch } = useParticipants();
  const deleteMutation = useDeleteParticipant();

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ParticipantResponseDTO | undefined>(undefined);
  const [pendingDelete, setPendingDelete] = useState<ParticipantResponseDTO | null>(null);

  const participants = data?.items ?? [];

  const openCreate = () => {
    setEditing(undefined);
    setFormOpen(true);
  };

  const openEdit = (participant: ParticipantResponseDTO) => {
    setEditing(participant);
    setFormOpen(true);
  };

  const confirmDelete = () => {
    if (pendingDelete === null) return;
    deleteMutation.mutate(pendingDelete.participantId, {
      onSuccess: () => {
        toast.success(t.participants.deleteSuccess);
        setPendingDelete(null);
      },
      onError: (err) => {
        toast.error(userMessageFor(err));
        setPendingDelete(null);
      },
    });
  };

  return (
    <Card className="flex flex-col gap-4 p-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-2">
          <Eyebrow>{t.participants.eyebrow}</Eyebrow>
          <h2 className="text-2xl font-bold leading-none tracking-display">
            {t.participants.title}
          </h2>
        </div>
        <Button size="sm" className="shrink-0 gap-1" onClick={openCreate}>
          <Plus className="size-4" />
          {t.participants.createCta}
        </Button>
      </div>

      <p className="text-sm text-muted-foreground">{t.participants.helper}</p>

      {isLoading && (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-14 w-full rounded-md" />
          <Skeleton className="h-14 w-full rounded-md" />
        </div>
      )}

      {isError && (
        <ErrorState
          message={t.errors.generic}
          onRetry={() => {
            void refetch();
          }}
        />
      )}

      {!isLoading && !isError && participants.length === 0 && (
        <p className="rounded-md border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
          {t.participants.emptyState}
        </p>
      )}

      {!isLoading && !isError && participants.length > 0 && (
        <ul className="flex flex-col">
          {participants.map((participant) => (
            <li
              key={participant.participantId}
              className="flex items-center gap-3 border-b border-border py-3 last:border-b-0"
            >
              <span
                aria-hidden
                className={cn(
                  'size-8 shrink-0 rounded-full',
                  SWATCH_BG[
                    isWalletColor(participant.color) ? participant.color : 'lilac'
                  ],
                )}
              />
              <p className="min-w-0 flex-1 truncate font-semibold tracking-tightest">
                {participant.name}
              </p>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => openEdit(participant)}
                aria-label={`${t.participants.editTitle}: ${participant.name}`}
                className="text-muted-foreground hover:text-foreground"
              >
                <Pencil className="size-4" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => setPendingDelete(participant)}
                aria-label={`${t.common.delete} ${participant.name}`}
                className="text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="size-4" />
              </Button>
            </li>
          ))}
        </ul>
      )}

      <ParticipantFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        {...(editing !== undefined ? { participant: editing } : {})}
      />

      <DeleteParticipantDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
        onConfirm={confirmDelete}
        pending={deleteMutation.isPending}
      />
    </Card>
  );
};
