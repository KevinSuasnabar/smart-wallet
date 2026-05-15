import { useEffect, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import {
  CreateCustomCategoryRequestSchema,
  type CreateCustomCategoryDTO,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../../components/ui/select.js';
import { ColorPicker } from '../../wallets/components/ColorPicker.js';
import { useCreateCustomCategory } from '../queries.js';
import { userMessageFor } from '../../../lib/api/errors.js';
import { t } from '../../../lib/i18n.js';

interface CreateCategoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const DEFAULT_COLOR_FOR = {
  income: 'mint',
  expense: 'coral',
} as const;

export const CreateCategoryDialog = ({
  open,
  onOpenChange,
}: CreateCategoryDialogProps) => {
  const { mutate, isPending } = useCreateCustomCategory();

  const form = useForm<CreateCustomCategoryDTO>({
    resolver: zodResolver(CreateCustomCategoryRequestSchema),
    mode: 'onChange',
    defaultValues: {
      name: '',
      type: 'expense',
      color: 'coral',
    },
  });

  // Sync color default to match the chosen type, but only when the user
  // hasn't manually touched the color picker. Once they pick a color, leave
  // their choice alone.
  const watchedType = form.watch('type');
  const colorTouchedRef = useRef(false);
  useEffect(() => {
    if (colorTouchedRef.current) return;
    form.setValue('color', DEFAULT_COLOR_FOR[watchedType], { shouldValidate: true });
  }, [watchedType, form]);

  const handleSubmit = (values: CreateCustomCategoryDTO) => {
    mutate(values, {
      onSuccess: () => {
        toast.success('Categoría creada');
        form.reset();
        colorTouchedRef.current = false;
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
          <DialogTitle>{t.categories.createTitle}</DialogTitle>
          <DialogDescription>
            Las categorías personalizadas se suman a las predefinidas.
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
                    <Input
                      {...field}
                      maxLength={32}
                      disabled={isPending}
                      placeholder="Ej: Cafetería, freelance…"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="type"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Tipo</FormLabel>
                  <FormControl>
                    <Select
                      value={field.value}
                      onValueChange={field.onChange}
                      disabled={isPending}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="expense">
                          {t.transactions.expense}
                        </SelectItem>
                        <SelectItem value="income">
                          {t.transactions.income}
                        </SelectItem>
                      </SelectContent>
                    </Select>
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
                      onChange={(c) => {
                        colorTouchedRef.current = true;
                        field.onChange(c);
                      }}
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
              <Button
                type="submit"
                disabled={isPending || !form.formState.isValid}
              >
                {isPending ? t.app.loading : t.common.save}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};
