import { cn } from '../../../lib/utils.js';

interface BudgetProgressBarProps {
  spent: string;
  effectiveLimit: string;
  className?: string;
}

export const BudgetProgressBar = ({ spent, effectiveLimit, className }: BudgetProgressBarProps) => {
  const spentNum = parseFloat(spent);
  const limitNum = parseFloat(effectiveLimit);
  const ratio = limitNum > 0 ? Math.min(spentNum / limitNum, 1) : 0;
  const pct = ratio * 100;

  const barColor = pct >= 100 ? 'bg-destructive' : pct >= 75 ? 'bg-amber-400' : 'bg-block-lime';

  return (
    <div
      className={cn('h-2 w-full overflow-hidden rounded-full bg-muted', className)}
      role="progressbar"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className={cn('h-full rounded-full transition-all', barColor)}
        style={{ width: `${pct.toFixed(1)}%` }}
      />
    </div>
  );
};
