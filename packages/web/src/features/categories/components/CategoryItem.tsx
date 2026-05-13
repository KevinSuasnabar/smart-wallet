import { Trash2 } from 'lucide-react';
import { Button } from '../../../components/ui/button.js';
import { Badge } from '../../../components/ui/badge.js';
import { t } from '../../../lib/i18n.js';

interface CategoryItemProps {
  name: string;
  type: 'income' | 'expense';
  isCustom: boolean;
  onDelete?: () => void;
}

export const CategoryItem = ({
  name,
  type,
  isCustom,
  onDelete,
}: CategoryItemProps) => (
  <div className="flex items-center justify-between gap-3 py-3 border-b last:border-b-0">
    <div className="flex items-center gap-3 min-w-0 flex-1">
      <span className="font-medium truncate">{name}</span>
      <Badge variant={type === 'income' ? 'default' : 'secondary'}>
        {type === 'income' ? t.transactions.income : t.transactions.expense}
      </Badge>
    </div>
    {isCustom && onDelete && (
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={onDelete}
        className="size-11"
        aria-label={`${t.common.delete} ${name}`}
      >
        <Trash2 className="size-4 text-red-600" />
      </Button>
    )}
  </div>
);
