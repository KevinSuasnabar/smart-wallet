import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  AddTransactionRequestSchema,
  type AddTransactionDTO,
  type WalletResponseDTO,
} from '@smart-wallet/shared-types';
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
}

export const TransactionForm = ({
  wallets,
  walletId,
  onWalletChange,
  onSubmit,
  submitting,
}: TransactionFormProps) => {
  const selectedWallet = wallets.find((w) => w.walletId === walletId);
  const currency = selectedWallet?.currency ?? 'USD';

  const now = new Date();
  const maxDate = new Date(now.getTime() + 24 * 60 * 60 * 1000); // +1 day
  const minDate = new Date(now);
  minDate.setFullYear(minDate.getFullYear() - 5); // -5 years

  const form = useForm<AddTransactionDTO>({
    resolver: zodResolver(AddTransactionRequestSchema),
    defaultValues: {
      type: 'expense',
      amount: '',
      categoryId: '',
      occurredAt: new Date().toISOString(),
      description: '',
      currency,
    },
  });

  // Sync currency from selected wallet
  useEffect(() => {
    form.setValue('currency', currency);
  }, [currency, form]);

  // Reset category when type changes (categories are filtered by type)
  const type = form.watch('type');
  useEffect(() => {
    form.setValue('categoryId', '');
  }, [type, form]);

  return (
    <Form {...form}>
      <form
        onSubmit={(e) => { void form.handleSubmit(onSubmit)(e); }}
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
                  disabled={submitting}
                >
                  <SelectTrigger className="min-h-[44px]">
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

        <FormItem>
          <FormLabel>Billetera</FormLabel>
          <FormControl>
            <WalletSelect
              wallets={wallets}
              value={walletId}
              onChange={onWalletChange}
              disabled={submitting}
            />
          </FormControl>
        </FormItem>

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
                  className="min-h-[44px]"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <Button
          type="submit"
          disabled={submitting || !form.formState.isValid}
          className="w-full min-h-[44px]"
        >
          {submitting ? t.app.loading : t.transactions.submitButton}
        </Button>
      </form>
    </Form>
  );
};
