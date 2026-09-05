import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import {
  CreateParticipantRequestSchema,
  type CreateParticipantDTO,
  type ParticipantResponseDTO,
} from '@smart-wallet/shared-types';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../../components/ui/dialog.js';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '../../../components/ui/form.js';
import { Input } from '../../../components/ui/input.js';
import { Button } from '../../../components/ui/button.js';
import { ColorPicker } from '../../wallets/components/ColorPicker.js';
import { useCreateParticipant, useUpdateParticipant } from '../queries.js';
import { userMessageFor } from '../../../lib/api/errors.js';
import { t } from '../../../lib/i18n.js';

interface ParticipantFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** When present the dialog edits that participant; otherwise it creates one. */
  participant?: ParticipantResponseDTO;
}

const DEFAULT_COLOR = 'lilac';

/**
 * One dialog for both create and edit — the two forms have identical fields,
 * so splitting them would duplicate the whole body to change one mutation.
 */
export const ParticipantFormDialog = ({
  open,
  onOpenChange,
  participant,
}: ParticipantFormDialogProps) => {
  const createMutation = useCreateParticipant();
  const updateMutation = useUpdateParticipant();
  const isEdit = participant !== undefined;
  const isPending = createMutation.isPending || updateMutation.isPending;

  const form = useForm<CreateParticipantDTO>({
    resolver: zodResolver(CreateParticipantRequestSchema),
    mode: 'onChange',
    defaultValues: {
      name: participant?.name ?? '',
      color: participant?.color ?? DEFAULT_COLOR,
    },
  });

  // The dialog stays mounted between openings, so re-seed the fields whenever
  // it opens or the edited participant changes.
  const { reset } = form;
  useEffect(() => {
    if (!open) return;
    reset({
      name: participant?.name ?? '',
      color: participant?.color ?? DEFAULT_COLOR,
    });
  }, [open, participant, reset]);

  const handleSubmit = (values: CreateParticipantDTO) => {
    const onSuccess = () => {
      toast.success(isEdit ? t.participants.editSuccess : t.participants.createSuccess);
      onOpenChange(false);
    };
    const onError = (err: Error) => {
      toast.error(userMessageFor(err));
    };

    if (isEdit) {
      updateMutation.mutate(
        { participantId: participant.participantId, dto: values },
        { onSuccess, onError },
      );
      return;
    }

    createMutation.mutate(values, { onSuccess, onError });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {isEdit ? t.participants.editTitle : t.participants.createTitle}
          </DialogTitle>
          <DialogDescription>{t.participants.dialogHelper}</DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form
            onSubmit={(e) => { void form.handleSubmit(handleSubmit)(e); }}
            className="flex flex-col gap-4"
          >
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t.participants.nameLabel}</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      maxLength={32}
                      disabled={isPending}
                      placeholder={t.participants.namePlaceholder}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="color"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t.participants.colorLabel}</FormLabel>
                  <FormControl>
                    <ColorPicker
                      value={field.value}
                      onChange={field.onChange}
                      disabled={isPending}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={isPending}
              >
                {t.common.cancel}
              </Button>
              <Button type="submit" disabled={isPending || !form.formState.isValid}>
                {isPending ? t.app.loading : t.common.save}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};
