import type { ReactNode } from 'react';
import { ColorBlock } from './ColorBlock.js';
import { Eyebrow } from './Eyebrow.js';

interface EmptyStateProps {
  message: string;
  /** Optional mono uppercase label above the message. */
  eyebrow?: string;
  cta?: ReactNode;
}

/**
 * Empty states ride a soft cream color block — the system uses color, not a
 * dashed gray box, to make "nothing here yet" feel intentional and inviting.
 */
export const EmptyState = ({
  message,
  eyebrow = 'Sin datos',
  cta,
}: EmptyStateProps) => (
  <ColorBlock tone="cream">
    <div className="flex flex-col items-center gap-4 py-6 text-center">
      <div className="flex flex-col items-center gap-2">
        <Eyebrow className="text-foreground/50">{eyebrow}</Eyebrow>
        <p className="text-base font-medium tracking-tightest">{message}</p>
      </div>
      {cta}
    </div>
  </ColorBlock>
);
