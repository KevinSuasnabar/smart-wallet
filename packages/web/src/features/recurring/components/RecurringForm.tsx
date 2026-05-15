import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import type {
  CreateRecurringDTO,
  WalletResponseDTO,
} from '@smart-wallet/shared-types';
import { LOOSE_DECIMAL_REGEX, normalizeAmount } from '../../../lib/amount.js';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '../../../components/ui/form.js';
import { Input } from '../../../components/ui/input.js';
import { Label } from '../../../components/ui/label.js';
import { Button } from '../../../components/ui/button.js';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../../components/ui/select.js';
import { MoneyInput } from '../../../components/common/MoneyInput.js';
import { WalletSelect } from '../../wallets/components/WalletSelect.js';
import { CategorySelect } from '../../categories/components/CategorySelect.js';
import { t } from '../../../lib/i18n.js';

/**
 * Form-side schema with a loose amount regex (mirrors TransactionForm). The
 * decimal is normalized in `handleSubmit` before being handed to the parent.
 */
const FormSchema = z.object({
  walletId: z.string().min(1),
  type: z.enum(['income', 'expense']),
  amount: z
    .string()
    .regex(LOOSE_DECIMAL_REGEX, 'Ingresa un monto válido (ej. 100 o 100.50)'),
  categoryId: z.string().min(1),
  description: z.string().max(256).optional(),
  dayOfMonth: z.coerce.number().int().min(1).max(31),
});
type FormValues = z.infer<typeof FormSchema>;

interface RecurringFormProps {
  wallets: WalletResponseDTO[];
  walletId: string;
  onWalletChange: (walletId: string) => void;
  onSubmit: (values: CreateRecurringDTO) => void;
  submitting: boolean;
  mode?: 'add' | 'edit';
  initialValues?: Partial<FormValues>;
}

export const RecurringForm = ({
  wallets,
  walletId,
  onWalletChange,
  onSubmit,
  submitting,
  mode = 'add',
  initialValues,
}: RecurringFormProps) => {
  const selectedWallet = wallets.find((w) => w.walletId === walletId);
  const isEdit = mode === 'edit';

  const form = useForm<FormValues>({
    resolver: zodResolver(FormSchema),
    mode: 'onChange',
    defaultValues: {
      walletId,
      type: initialValues?.type ?? 'expense',
      amount: initialValues?.amount ?? '',
      categoryId: initialValues?.categoryId ?? '',
      description: initialValues?.description ?? '',
      dayOfMonth: initialValues?.dayOfMonth ?? 1,
    },
  });

  // Keep the form's walletId in sync with the parent-controlled state.
  useEffect(() => {
    form.setValue('walletId', walletId);
  }, [walletId, form]);

  // Reset category when type flips (categories are filtered by type).
  const type = form.watch('type');
  useEffect(() => {
    if (!isEdit) form.setValue('categoryId', '');
  }, [type, form, isEdit]);

  const handleSubmit = (values: FormValues) => {
    onSubmit({
      walletId: values.walletId,
      type: values.type,
      amount: normalizeAmount(values.amount),
      categoryId: values.categoryId,
      ...(values.description !== undefined && values.description !== ''
        ? { description: values.description }
        : {}),
      dayOfMonth: values.dayOfMonth,
    });
  };

  return (
    <Form {...form}>
      <form
        onSubmit={(e) => {
          void form.handleSubmit(handleSubmit)(e);
        }}
        className="flex flex-col gap-5"
      >
        <FormField
          control={form.control}
          name="type"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t.transactions.typeLabel}</FormLabel>
              <FormControl>
                <Select
                  value={field.value}
                  onValueChange={field.onChange}
                  disabled={submitting || isEdit}
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

        <div className="space-y-2">
          <Label htmlFor="recurring-wallet-select">Billetera</Label>
          {isEdit ? (
            <div className="flex h-11 items-center rounded-md border border-input bg-muted/40 px-3.5 text-[15px] text-muted-foreground">
              {selectedWallet
                ? `${selectedWallet.name} (${selectedWallet.currency})`
                : '—'}
            </div>
          ) : (
            <WalletSelect
              id="recurring-wallet-select"
              wallets={wallets}
              value={walletId}
              onChange={onWalletChange}
              disabled={submitting}
            />
          )}
        </div>

        <FormField
          control={form.control}
          name="amount"
          render={({ field }) => (
            <FormItem>
              <FormLabel>
                {t.transactions.amountLabel} ({selectedWallet?.currency ?? '—'})
              </FormLabel>
              <FormControl>
                <MoneyInput
                  value={field.value}
                  onChange={field.onChange}
                  disabled={submitting}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="categoryId"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t.transactions.categoryLabel}</FormLabel>
              <FormControl>
                <CategorySelect
                  type={type}
                  value={field.value}
                  onChange={field.onChange}
                  disabled={submitting}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="dayOfMonth"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t.recurring.dayOfMonthLabel}</FormLabel>
              <FormControl>
                <Input
                  type="number"
                  min={1}
                  max={31}
                  step={1}
                  value={field.value}
                  onChange={(e) =>
                    field.onChange(
                      e.target.value === ''
                        ? ''
                        : Number.parseInt(e.target.value, 10),
                    )
                  }
                  disabled={submitting}
                />
              </FormControl>
              <p className="font-mono text-[11px] text-foreground/55">
                {t.recurring.dayOfMonthHelper}
              </p>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t.transactions.descriptionLabel}</FormLabel>
              <FormControl>
                <Input
                  {...field}
                  disabled={submitting}
                  maxLength={256}
                  placeholder="Ej: Sueldo, Alquiler, Netflix…"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <Button
          type="submit"
          disabled={submitting || !form.formState.isValid || walletId === ''}
          className="mt-1 w-full"
        >
          {submitting
            ? t.app.loading
            : isEdit
              ? t.recurring.editSubmit
              : t.recurring.createSubmit}
        </Button>
      </form>
    </Form>
  );
};
