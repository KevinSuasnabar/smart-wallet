import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { decimalStringToCents, type Currency } from '@smart-wallet/shared-types';
import type { CreateBudgetDTO, UpdateBudgetDTO } from '@smart-wallet/shared-types';
import { LOOSE_DECIMAL_REGEX, normalizeAmount } from '../../../lib/amount.js';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '../../../components/ui/form.js';
import { Button } from '../../../components/ui/button.js';
import { Label } from '../../../components/ui/label.js';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../../components/ui/select.js';
import { MoneyInput } from '../../../components/common/MoneyInput.js';
import { CategorySelect } from '../../categories/components/CategorySelect.js';
import { t } from '../../../lib/i18n.js';

const FormSchema = z.object({
  type: z.enum(['per_category', 'global']),
  categoryId: z.string().optional(),
  currency: z.enum(['PEN', 'USD']),
  limit: z.string().regex(LOOSE_DECIMAL_REGEX, 'Ingresá un monto válido (ej. 100 o 100.50)'),
  rollover: z.boolean(),
});
type FormValues = z.infer<typeof FormSchema>;

interface BudgetFormCreateProps {
  mode: 'create';
  onSubmit: (dto: CreateBudgetDTO) => void;
  submitting: boolean;
  initialValues?: Partial<FormValues>;
}

interface BudgetFormEditProps {
  mode: 'edit';
  currency: Currency;
  onSubmit: (dto: UpdateBudgetDTO) => void;
  submitting: boolean;
  initialValues: Pick<FormValues, 'limit' | 'rollover'>;
}

type BudgetFormProps = BudgetFormCreateProps | BudgetFormEditProps;

export const BudgetForm = (props: BudgetFormProps) => {
  const isEdit = props.mode === 'edit';
  const currency: Currency = isEdit ? props.currency : (props.initialValues?.currency ?? 'PEN');

  const form = useForm<FormValues>({
    resolver: zodResolver(FormSchema),
    mode: 'onChange',
    defaultValues: {
      type: isEdit ? 'per_category' : (props.initialValues?.type ?? 'per_category'),
      categoryId: isEdit ? undefined : (props.initialValues?.categoryId ?? ''),
      currency: isEdit ? props.currency : (props.initialValues?.currency ?? 'PEN'),
      limit: props.initialValues?.limit ?? '',
      rollover: props.initialValues?.rollover ?? false,
    },
  });

  const watchedType = form.watch('type');
  const watchedCurrency = form.watch('currency');

  useEffect(() => {
    if (!isEdit && watchedType === 'global') {
      form.setValue('categoryId', undefined);
    }
  }, [watchedType, form, isEdit]);

  const handleSubmit = (values: FormValues) => {
    const normalized = normalizeAmount(values.limit);
    const resolvedCurrency = isEdit ? props.currency : values.currency;
    const limitCents = decimalStringToCents(normalized, resolvedCurrency);

    if (isEdit) {
      const initialLimit = props.initialValues.limit;
      const initialRollover = props.initialValues.rollover;
      const patch: UpdateBudgetDTO = {};
      if (normalized !== normalizeAmount(initialLimit)) patch.limitCents = limitCents;
      if (values.rollover !== initialRollover) patch.rollover = values.rollover;

      if (Object.keys(patch).length === 0) {
        props.onSubmit(patch);
        return;
      }
      props.onSubmit(patch);
    } else {
      const dto: CreateBudgetDTO = {
        type: values.type,
        currency: values.currency,
        limitCents,
        rollover: values.rollover,
        ...(values.type === 'per_category' && values.categoryId
          ? { categoryId: values.categoryId }
          : {}),
      };
      props.onSubmit(dto);
    }
  };

  return (
    <Form {...form}>
      <form
        onSubmit={(e) => {
          void form.handleSubmit(handleSubmit)(e);
        }}
        className="flex flex-col gap-5"
      >
        {!isEdit && (
          <FormField
            control={form.control}
            name="type"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t.budgets.typeLabel}</FormLabel>
                <FormControl>
                  <Select
                    value={field.value}
                    onValueChange={field.onChange}
                    disabled={props.submitting}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="per_category">{t.budgets.typePerCategory}</SelectItem>
                      <SelectItem value="global">{t.budgets.typeGlobal}</SelectItem>
                    </SelectContent>
                  </Select>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        )}

        {!isEdit && watchedType === 'per_category' && (
          <FormField
            control={form.control}
            name="categoryId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t.budgets.categoryLabel}</FormLabel>
                <FormControl>
                  <CategorySelect
                    type="expense"
                    value={field.value ?? ''}
                    onChange={field.onChange}
                    disabled={props.submitting}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        )}

        {!isEdit && (
          <FormField
            control={form.control}
            name="currency"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t.budgets.currencyLabel}</FormLabel>
                <FormControl>
                  <Select
                    value={field.value}
                    onValueChange={field.onChange}
                    disabled={props.submitting}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="PEN">PEN</SelectItem>
                      <SelectItem value="USD">USD</SelectItem>
                    </SelectContent>
                  </Select>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        )}

        {isEdit && (
          <div className="flex h-11 items-center rounded-md border border-input bg-muted/40 px-3.5 text-[15px] text-muted-foreground">
            {currency}
          </div>
        )}

        <FormField
          control={form.control}
          name="limit"
          render={({ field }) => (
            <FormItem>
              <FormLabel>
                {t.budgets.limitLabel} ({isEdit ? currency : watchedCurrency})
              </FormLabel>
              <FormControl>
                <MoneyInput
                  value={field.value}
                  onChange={field.onChange}
                  disabled={props.submitting}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-3">
            <input
              id="budget-rollover"
              type="checkbox"
              checked={form.watch('rollover')}
              onChange={(e) => form.setValue('rollover', e.target.checked)}
              disabled={props.submitting}
              className="size-4 cursor-pointer accent-foreground"
            />
            <Label htmlFor="budget-rollover" className="cursor-pointer">
              {t.budgets.rolloverLabel}
            </Label>
          </div>
          <p className="font-mono text-[11px] text-foreground/55">{t.budgets.rolloverHelper}</p>
        </div>

        <Button
          type="submit"
          disabled={props.submitting || !form.formState.isValid}
          className="mt-1 w-full"
        >
          {props.submitting
            ? t.app.loading
            : isEdit
              ? t.budgets.editSubmit
              : t.budgets.createSubmit}
        </Button>
      </form>
    </Form>
  );
};
