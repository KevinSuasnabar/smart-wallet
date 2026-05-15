import { Trash2 } from 'lucide-react';
import { cn } from '../../../lib/utils.js';
import { Eyebrow } from '../../../components/common/Eyebrow.js';
import { t } from '../../../lib/i18n.js';

interface CategoryItemProps {
  name: string;
  type: 'income' | 'expense';
  isCustom: boolean;
  onDelete?: () => void;
}

/**
 * A category as a pastel chip in the grid — mint for income, coral for
 * expense. The type label sits above the name as a mono eyebrow; custom
 * categories carry a top-right delete affordance.
 */
export const CategoryItem = ({
  name,
  type,
  isCustom,
  onDelete,
}: CategoryItemProps) => (
  <div
    className={cn(
      'relative flex min-h-[108px] flex-col gap-2 rounded-block p-4',
      type === 'income' ? 'bg-block-mint' : 'bg-block-coral',
    )}
  >
    <Eyebrow className="text-ink/55">
      {type === 'income' ? t.transactions.income : t.transactions.expense}
    </Eyebrow>
    <p className="text-base font-bold tracking-tightest text-ink">{name}</p>
    {isCustom && onDelete && (
      <button
        type="button"
        onClick={onDelete}
        aria-label={`${t.common.delete} ${name}`}
        className="absolute right-2 top-2 flex size-7 items-center justify-center rounded-full bg-ink/5 text-ink/55 transition-colors hover:bg-ink/15 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/40"
      >
        <Trash2 className="size-3.5" />
      </button>
    )}
  </div>
);
