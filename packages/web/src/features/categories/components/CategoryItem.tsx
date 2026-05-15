import { Pencil, Trash2 } from 'lucide-react';
import { isWalletColor } from '@smart-wallet/shared-types';
import type { WalletColor } from '@smart-wallet/shared-types';
import { cn } from '../../../lib/utils.js';
import { Eyebrow } from '../../../components/common/Eyebrow.js';
import { t } from '../../../lib/i18n.js';

interface CategoryItemProps {
  categoryId: string;
  name: string;
  type: 'income' | 'expense';
  color?: string;
  /** When supplied, the pencil affordance appears. */
  onEdit?: () => void;
  /** When supplied, the trash affordance appears. */
  onDelete?: () => void;
}

/**
 * Static map from WalletColor to a Tailwind background utility. Required as
 * a literal record so Tailwind's JIT can detect the class names.
 */
const SWATCH_BG: Record<WalletColor, string> = {
  lime: 'bg-block-lime',
  lilac: 'bg-block-lilac',
  cream: 'bg-block-cream',
  pink: 'bg-block-pink',
  mint: 'bg-block-mint',
  coral: 'bg-block-coral',
  navy: 'bg-block-navy',
};

const FOREGROUND_FOR: Record<WalletColor, string> = {
  // 6 light tones use ink for text + eyebrows.
  lime: 'text-ink',
  lilac: 'text-ink',
  cream: 'text-ink',
  pink: 'text-ink',
  mint: 'text-ink',
  coral: 'text-ink',
  // navy is the inverse tone — use bg-card (cream) text.
  navy: 'text-background',
};

/**
 * A category as a pastel chip in the grid. The tone is the category's own
 * `color` (predefined or user-chosen); legacy items without a color fall
 * back to the type-based default. Both custom and predefined items get the
 * edit + delete affordances now — predefined edits fork into a new custom,
 * predefined deletes hide for this user only.
 */
export const CategoryItem = ({
  name,
  type,
  color,
  onEdit,
  onDelete,
}: CategoryItemProps) => {
  const resolvedColor: WalletColor = isWalletColor(color)
    ? color
    : type === 'income'
      ? 'mint'
      : 'coral';
  const bgClass = SWATCH_BG[resolvedColor];
  const fgClass = FOREGROUND_FOR[resolvedColor];

  return (
    <div
      className={cn(
        'relative flex min-h-[108px] flex-col gap-2 rounded-block p-4',
        bgClass,
        fgClass,
      )}
    >
      <Eyebrow className={resolvedColor === 'navy' ? 'text-background/55' : 'text-ink/55'}>
        {type === 'income' ? t.transactions.income : t.transactions.expense}
      </Eyebrow>
      <p className="text-base font-bold tracking-tightest">{name}</p>
      <div className="absolute right-2 top-2 flex items-center gap-1">
        {onEdit && (
          <button
            type="button"
            onClick={onEdit}
            aria-label={`${t.categories.editTitle}: ${name}`}
            className={cn(
              'flex size-7 items-center justify-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2',
              resolvedColor === 'navy'
                ? 'bg-background/10 text-background/70 hover:bg-background/20 hover:text-background focus-visible:ring-background/40'
                : 'bg-ink/5 text-ink/55 hover:bg-ink/15 hover:text-ink focus-visible:ring-ink/40',
            )}
          >
            <Pencil className="size-3.5" />
          </button>
        )}
        {onDelete && (
          <button
            type="button"
            onClick={onDelete}
            aria-label={`${t.common.delete} ${name}`}
            className={cn(
              'flex size-7 items-center justify-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2',
              resolvedColor === 'navy'
                ? 'bg-background/10 text-background/70 hover:bg-background/20 hover:text-background focus-visible:ring-background/40'
                : 'bg-ink/5 text-ink/55 hover:bg-ink/15 hover:text-destructive focus-visible:ring-ink/40',
            )}
          >
            <Trash2 className="size-3.5" />
          </button>
        )}
      </div>
    </div>
  );
};
