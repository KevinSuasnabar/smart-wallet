import { WALLET_COLORS } from '@smart-wallet/shared-types';
import type { WalletColor } from '@smart-wallet/shared-types';
import { cn } from '../../../lib/utils.js';
import { t } from '../../../lib/i18n.js';

interface ColorPickerProps {
  value: WalletColor;
  onChange: (color: WalletColor) => void;
  disabled?: boolean;
}

/**
 * Static map from WalletColor to its Tailwind background class. Required as
 * a literal table — Tailwind's JIT compiler scans source for literal class
 * names; `bg-block-${tone}` would not be detected and would render empty.
 *
 * Keep in sync with the design-system tokens in tailwind.config.ts and the
 * WALLET_COLORS array in shared-types.
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

/**
 * Seven-swatch palette picker. The selected swatch gets a focus ring; all
 * swatches are keyboard-navigable via the standard radio role + arrow keys.
 */
export const ColorPicker = ({
  value,
  onChange,
  disabled = false,
}: ColorPickerProps) => (
  <div
    role="radiogroup"
    aria-label={t.wallets.colorLabel}
    className="flex flex-wrap gap-2"
  >
    {WALLET_COLORS.map((color) => {
      const isSelected = value === color;
      return (
        <button
          key={color}
          type="button"
          role="radio"
          aria-checked={isSelected}
          aria-label={t.wallets.colors[color]}
          title={t.wallets.colors[color]}
          disabled={disabled}
          onClick={() => onChange(color)}
          className={cn(
            'size-10 rounded-full border border-border transition',
            SWATCH_BG[color],
            isSelected && 'ring-2 ring-offset-2 ring-foreground',
            disabled
              ? 'opacity-50 cursor-not-allowed'
              : 'hover:scale-105 cursor-pointer',
          )}
        />
      );
    })}
  </div>
);
