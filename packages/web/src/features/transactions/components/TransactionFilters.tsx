import { useState } from 'react';
import { Filter, X } from 'lucide-react';
import { Button } from '../../../components/ui/button.js';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../../components/ui/select.js';
import { Label } from '../../../components/ui/label.js';
import { DatePickerField } from '../../../components/common/DatePickerField.js';
import { t } from '../../../lib/i18n.js';

export interface TransactionFiltersState {
  from?: string;
  to?: string;
  type?: 'income' | 'expense';
}

interface TransactionFiltersProps {
  value: TransactionFiltersState;
  onChange: (next: TransactionFiltersState) => void;
}

export const TransactionFilters = ({ value, onChange }: TransactionFiltersProps) => {
  const [open, setOpen] = useState(false);

  const hasFilters =
    value.from !== undefined || value.to !== undefined || value.type !== undefined;

  const reset = () => {
    onChange({});
  };

  return (
    <div className="rounded-xl border p-3 mb-3">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="flex items-center gap-2 text-sm font-medium"
          aria-expanded={open}
        >
          <Filter className="size-4" />
          {t.transactions.filtersTitle}
          {hasFilters && (
            <span className="bg-primary text-primary-foreground rounded-full px-2 py-0.5 text-xs">
              Activos
            </span>
          )}
        </button>
        {hasFilters && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={reset}
            className="gap-1"
          >
            <X className="size-3" />
            Limpiar
          </Button>
        )}
      </div>

      {open && (
        <div className="flex flex-col gap-3 mt-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="filter-type">{t.transactions.filterByType}</Label>
            <Select
              value={value.type ?? '__all__'}
              onValueChange={(v) => {
                if (v === '__all__') {
                  const { type: _t, ...rest } = value;
                  onChange(rest);
                } else {
                  onChange({ ...value, type: v as 'income' | 'expense' });
                }
              }}
            >
              <SelectTrigger id="filter-type" className="min-h-[44px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Todos</SelectItem>
                <SelectItem value="income">{t.transactions.income}</SelectItem>
                <SelectItem value="expense">{t.transactions.expense}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="filter-from">{t.transactions.filterByDateFrom}</Label>
            <DatePickerField
              id="filter-from"
              value={value.from ?? ''}
              onChange={(iso) => onChange({ ...value, from: iso })}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="filter-to">{t.transactions.filterByDateTo}</Label>
            <DatePickerField
              id="filter-to"
              value={value.to ?? ''}
              onChange={(iso) => onChange({ ...value, to: iso })}
            />
          </div>
        </div>
      )}
    </div>
  );
};
