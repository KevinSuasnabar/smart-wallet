import { Trash2 } from 'lucide-react';
import { Button } from '../../../components/ui/button.js';
import { TypeTag } from '../../../components/common/TypeTag.js';
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
  <div className="flex items-center justify-between gap-3 border-b border-border py-3 last:border-b-0">
    <div className="flex min-w-0 flex-1 items-center gap-3">
      <span className="truncate font-medium tracking-tightest">{name}</span>
      <TypeTag type={type} />
    </div>
    {isCustom && onDelete && (
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={onDelete}
        className="size-9 text-destructive hover:bg-destructive/10 hover:text-destructive"
        aria-label={`${t.common.delete} ${name}`}
      >
        <Trash2 className="size-4" />
      </Button>
    )}
  </div>
);
