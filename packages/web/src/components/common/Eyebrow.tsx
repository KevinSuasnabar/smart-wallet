import type { ReactNode } from 'react';
import { cn } from '../../lib/utils.js';

interface EyebrowProps {
  children: ReactNode;
  className?: string;
}

/**
 * figmaMono eyebrow — an uppercase, positive-tracked monospace label that
 * flags taxonomy (section names, categories) without competing with display
 * type. Mono is taxonomy, never body copy (DESIGN.md).
 */
export const Eyebrow = ({ children, className }: EyebrowProps) => (
  <span
    className={cn(
      'font-mono text-[11px] uppercase tracking-eyebrow text-muted-foreground',
      className,
    )}
  >
    {children}
  </span>
);
