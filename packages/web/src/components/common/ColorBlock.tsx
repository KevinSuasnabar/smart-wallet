import type { ReactNode } from 'react';
import { cn } from '../../lib/utils.js';

export type ColorBlockTone =
  | 'lime'
  | 'lilac'
  | 'cream'
  | 'pink'
  | 'mint'
  | 'coral'
  | 'navy';

interface ColorBlockProps {
  tone?: ColorBlockTone;
  children: ReactNode;
  className?: string;
}

/**
 * The signature surface of the system: an oversized pastel panel with
 * rounded.lg corners. In the Figma marketing site these are full-viewport
 * storytelling sections — here they are adapted as app accents (balance
 * header, empty states, section openers). Color IS the depth device, so
 * never add a shadow. Navy is the only inverse tone (DESIGN.md).
 */
const toneClass: Record<ColorBlockTone, string> = {
  lime: 'bg-block-lime text-ink',
  lilac: 'bg-block-lilac text-ink',
  cream: 'bg-block-cream text-ink',
  pink: 'bg-block-pink text-ink',
  mint: 'bg-block-mint text-ink',
  coral: 'bg-block-coral text-ink',
  navy: 'bg-block-navy text-white',
};

export const ColorBlock = ({
  tone = 'lime',
  children,
  className,
}: ColorBlockProps) => (
  <div className={cn('rounded-block p-6 md:p-8', toneClass[tone], className)}>
    {children}
  </div>
);
