import { cn } from '../../lib/utils.js';
import { t } from '../../lib/i18n.js';

interface TypeTagProps {
  type: 'income' | 'expense';
  className?: string;
}

/**
 * Income/expense taxonomy tag — a mono uppercase label on a pastel block
 * color (mint for income, coral for expense). Color flags the type without
 * a saturated accent; the label keeps it accessible.
 */
export const TypeTag = ({ type, className }: TypeTagProps) => (
  <span
    className={cn(
      'inline-flex items-center rounded-full px-2 py-0.5 font-mono text-[10px] uppercase tracking-caption text-ink',
      type === 'income' ? 'bg-block-mint' : 'bg-block-coral',
      className,
    )}
  >
    {type === 'income' ? t.transactions.income : t.transactions.expense}
  </span>
);
