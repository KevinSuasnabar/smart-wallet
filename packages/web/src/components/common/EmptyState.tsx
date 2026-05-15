import type { ReactNode } from 'react';
import { ColorBlock, type ColorBlockTone } from './ColorBlock.js';
import { Eyebrow } from './Eyebrow.js';

interface EmptyStateProps {
  message: string;
  /** Optional mono uppercase label above the message. */
  eyebrow?: string;
  /** Block tone — defaults to lime so the panel pops on the cream canvas. */
  tone?: ColorBlockTone;
  cta?: ReactNode;
}

/**
 * Empty states ride a pastel color block — color, not a dashed gray box,
 * carries the "nothing here yet" moment. Defaults to lime because lime pops
 * cleanest against the cream canvas.
 */
export const EmptyState = ({
  message,
  eyebrow = 'Sin datos',
  tone = 'lime',
  cta,
}: EmptyStateProps) => (
  <ColorBlock tone={tone}>
    <div className="flex flex-col items-center gap-4 py-6 text-center">
      <div className="flex flex-col items-center gap-2">
        <Eyebrow className="text-ink/55">{eyebrow}</Eyebrow>
        <p className="text-base font-medium tracking-tightest">{message}</p>
      </div>
      {cta}
    </div>
  </ColorBlock>
);
