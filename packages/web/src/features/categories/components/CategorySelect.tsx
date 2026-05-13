import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '../../../components/ui/select.js';
import { useCategories } from '../queries.js';

interface CategorySelectProps {
  type: 'income' | 'expense';
  value: string;
  onChange: (categoryId: string) => void;
  disabled?: boolean;
}

/**
 * Filters categories by type (income/expense). Shows predefined + custom grouped.
 * Parent must clear `value` when `type` changes (handled in TransactionForm).
 */
export const CategorySelect = ({
  type,
  value,
  onChange,
  disabled,
}: CategorySelectProps) => {
  const { data, isLoading } = useCategories();

  const predefined = data?.predefined.filter((c) => c.type === type) ?? [];
  const custom = data?.custom.filter((c) => c.type === type) ?? [];

  return (
    <Select
      value={value}
      onValueChange={onChange}
      disabled={(disabled ?? false) || isLoading}
    >
      <SelectTrigger className="min-h-[44px]">
        <SelectValue placeholder={isLoading ? 'Cargando…' : 'Elegí una categoría'} />
      </SelectTrigger>
      <SelectContent>
        {predefined.length > 0 && (
          <SelectGroup>
            <SelectLabel>Predefinidas</SelectLabel>
            {predefined.map((c) => (
              <SelectItem key={c.categoryId} value={c.categoryId}>
                {c.name}
              </SelectItem>
            ))}
          </SelectGroup>
        )}
        {custom.length > 0 && (
          <SelectGroup>
            <SelectLabel>Personalizadas</SelectLabel>
            {custom.map((c) => (
              <SelectItem key={c.categoryId} value={c.categoryId}>
                {c.name}
              </SelectItem>
            ))}
          </SelectGroup>
        )}
      </SelectContent>
    </Select>
  );
};
