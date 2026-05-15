import { z } from 'zod';

/**
 * Fixed palette for wallet visual identity. Order matters — it drives the
 * "first unused color" smart default in the create form, and the order in
 * which swatches render in the picker.
 *
 * Aligned with the seven `block.*` tones in the Tailwind config (lime,
 * lilac, cream, pink, mint, coral, navy). Adding a new color here MUST
 * also add the matching `bg-block-{tone}` class and the i18n label.
 */
export const WALLET_COLORS = [
  'lime',
  'lilac',
  'cream',
  'pink',
  'mint',
  'coral',
  'navy',
] as const;

export type WalletColor = (typeof WALLET_COLORS)[number];

export const zWalletColor = z.enum(WALLET_COLORS);

export const isWalletColor = (v: unknown): v is WalletColor =>
  typeof v === 'string' && (WALLET_COLORS as readonly string[]).includes(v);
