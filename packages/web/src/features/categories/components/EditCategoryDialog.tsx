import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { z } from 'zod';
import { zWalletColor, type UpdateCategoryDTO } from '@smart-wallet/shared-types';
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
import { useUpdateCategory } from '../queries.js';
import { userMessageFor } from '../../../lib/api/errors.js';
import { t } from '../../../lib/i18n.js';
import type { CategoryEditTarget } from './CategoryList.js';

interface EditCategoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  target: CategoryEditTarget | null;
}

const FormSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'El nombre es requerido')
    .max(32, 'Máximo 32 caracteres'),
  color: zWalletColor,
});
type FormValues = z.infer<typeof FormSchema>;

export const EditCategoryDialog = ({
  open,
  onOpenChange,
  target,
}: EditCategoryDialogProps) => {
  const updateMutation = useUpdateCategory();

  // Render nothing while the parent's state is null — the dialog is
  // controlled, so opening with target=null shouldn't happen, but guard.
  if (target === null) return null;

  return (
    <EditCategoryForm
      key={target.categoryId}
      open={open}
      onOpenChange={onOpenChange}
      target={target}
      submitting={updateMutation.isPending}
      onSubmit={(diff) => {
        updateMutation.mutate(
          { categoryId: target.categoryId, dto: diff },
          {
            onSuccess: () => {
              toast.success(t.categories.editSuccess);
              onOpenChange(false);
            },
            onError: (err) => toast.error(userMessageFor(err)),
          },
        );
      }}
    />
  );
};

interface EditCategoryFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  target: CategoryEditTarget;
  submitting: boolean;
  onSubmit: (diff: UpdateCategoryDTO) => void;
}

const EditCategoryForm = ({
  open,
  onOpenChange,
  target,
  submitting,
  onSubmit,
}: EditCategoryFormProps) => {
  const form = useForm<FormValues>({
    resolver: zodResolver(FormSchema),
    mode: 'onChange',
    defaultValues: {
      name: target.name,
      color: target.color as FormValues['color'],
    },
  });

  const handleSubmit = (values: FormValues) => {
    const diff: UpdateCategoryDTO = {};
    if (values.name !== target.name) diff.name = values.name;
    if (values.color !== target.color) diff.color = values.color;

    if (Object.keys(diff).length === 0) {
      toast(t.categories.editNoChanges);
      return;
    }
    onSubmit(diff);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t.categories.editTitle}</DialogTitle>
          <DialogDescription>
            {target.kind === 'predefined'
              ? 'Editar una categoría predefinida crea una versión tuya con los cambios.'
              : 'Cambia el nombre o el color.'}
          </DialogDescription>
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
                  <FormLabel>Nombre</FormLabel>
                  <FormControl>
                    <Input {...field} maxLength={32} disabled={submitting} />
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
                  <FormLabel>{t.categories.colorLabel}</FormLabel>
                  <FormControl>
                    <ColorPicker
                      value={field.value}
                      onChange={field.onChange}
                      disabled={submitting}
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
                disabled={submitting}
              >
                {t.common.cancel}
              </Button>
              <Button
                type="submit"
                disabled={submitting || !form.formState.isValid}
              >
                {submitting ? t.app.loading : t.categories.editSubmit}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};
