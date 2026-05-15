import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  AddTransactionRequestSchema,
  type AddTransactionDTO,
  type WalletResponseDTO,
} from '@smart-wallet/shared-types';
import { normalizeAmount, LOOSE_DECIMAL_REGEX } from '../../../lib/amount.js';

/**
 * Form-side schema: same shape as AddTransactionRequestSchema but the
 * amount field accepts both integers and decimals with 1-2 places (e.g.
 * "100", "100.5", "100.55"). This keeps formState.isValid green while
 * the user is still typing; the final value is normalized to the strict
 * "100.00" shape in the submit handler before being sent to the API.
 */
const FormAddTransactionSchema = AddTransactionRequestSchema.extend({
  amount: z
    .string()
    .regex(LOOSE_DECIMAL_REGEX, 'Ingresá un monto válido (ej. 100 o 100.50)'),
});
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
import { DatePickerField } from '../../../components/common/DatePickerField.js';
import { WalletSelect } from '../../wallets/components/WalletSelect.js';
import { CategorySelect } from '../../categories/components/CategorySelect.js';
import { t } from '../../../lib/i18n.js';

interface TransactionFormProps {
  wallets: WalletResponseDTO[];
  walletId: string;
  onWalletChange: (walletId: string) => void;
  onSubmit: (values: AddTransactionDTO) => void;
  submitting: boolean;
  /**
   * `'add'` (default) renders the form as it has always rendered. `'edit'`
   * disables the `type` selector (immutable), replaces the wallet selector
   * with a static read-only field (also immutable), and switches the submit
   * button copy. Diff-and-PATCH logic lives in the parent page.
   */
  mode?: 'add' | 'edit';
  /**
   * In edit mode, pre-populates the form fields. Has no effect in add mode.
   * Currency is read from the wallets array (matching `walletId`) — no need
   * to pass it here.
   */
  initialValues?: Partial<AddTransactionDTO>;
}

export const TransactionForm = ({
  wallets,
  walletId,
  onWalletChange,
  onSubmit,
  submitting,
  mode = 'add',
  initialValues,
}: TransactionFormProps) => {
  const selectedWallet = wallets.find((w) => w.walletId === walletId);
  const currency = selectedWallet?.currency ?? 'USD';
  const isEdit = mode === 'edit';

  const now = new Date();
  const maxDate = new Date(now.getTime() + 24 * 60 * 60 * 1000); // +1 day
  const minDate = new Date(now);
  minDate.setFullYear(minDate.getFullYear() - 5); // -5 years

  const form = useForm<AddTransactionDTO>({
    resolver: zodResolver(FormAddTransactionSchema),
    // 'onChange' so form.formState.isValid stays in sync with the current
    // field values — otherwise the submit button stays disabled forever
    // because the default 'onSubmit' mode only flips isValid after a submit
    // that we never let happen.
    mode: 'onChange',
    defaultValues: {
      type: initialValues?.type ?? 'expense',
      amount: initialValues?.amount ?? '',
      categoryId: initialValues?.categoryId ?? '',
      occurredAt: initialValues?.occurredAt ?? new Date().toISOString(),
      description: initialValues?.description ?? '',
      currency: initialValues?.currency ?? currency,
    },
  });

  // Normalize the amount ("100" → "100.00") before delegating to the parent's
  // onSubmit, which expects the strict API contract shape.
  const handleSubmit = (values: AddTransactionDTO) => {
    onSubmit({ ...values, amount: normalizeAmount(values.amount) });
  };

  // Sync currency from selected wallet
  useEffect(() => {
    form.setValue('currency', currency);
  }, [currency, form]);

  // Reset category when type changes (categories are filtered by type).
  // Skipped in edit mode: type is immutable, so the category stays as loaded.
  const type = form.watch('type');
  useEffect(() => {
    if (!isEdit) {
      form.setValue('categoryId', '');
    }
  }, [type, form, isEdit]);

  return (
    <Form {...form}>
      <form
        onSubmit={(e) => { void form.handleSubmit(handleSubmit)(e); }}
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
                    <SelectItem value="expense">{t.transactions.expense}</SelectItem>
                    <SelectItem value="income">{t.transactions.income}</SelectItem>
                  </SelectContent>
                </Select>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Wallet selector lives outside react-hook-form (controlled by the
            parent page) so we use plain Label + the component directly, not
            the Form/FormField primitives which require a FormFieldContext.
            In edit mode, the wallet is immutable so we show static text. */}
        <div className="space-y-2">
          <Label htmlFor="wallet-select">Billetera</Label>
          {isEdit ? (
            <div className="flex h-11 items-center rounded-md border border-input bg-muted/40 px-3.5 text-[15px] text-muted-foreground">
              {selectedWallet
                ? `${selectedWallet.name} (${selectedWallet.currency})`
                : '—'}
            </div>
          ) : (
            <WalletSelect
              id="wallet-select"
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
                {t.transactions.amountLabel} ({currency})
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
          name="occurredAt"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t.transactions.occurredAtLabel}</FormLabel>
              <FormControl>
                <DatePickerField
                  value={field.value}
                  onChange={field.onChange}
                  disabled={submitting}
                  minDate={minDate}
                  maxDate={maxDate}
                />
              </FormControl>
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
                  placeholder="Ej: Almuerzo, sueldo, alquiler…"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <Button
          type="submit"
          disabled={submitting || !form.formState.isValid}
          className="mt-1 w-full"
        >
          {submitting
            ? t.app.loading
            : isEdit
              ? t.transactions.editSubmit
              : t.transactions.submitButton}
        </Button>
      </form>
    </Form>
  );
};
