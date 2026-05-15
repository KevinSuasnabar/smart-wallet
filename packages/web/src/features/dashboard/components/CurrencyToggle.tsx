import type { Currency } from '@smart-wallet/shared-types';

interface CurrencyToggleProps {
  available: Currency[];
  value: Currency;
  onChange: (next: Currency) => void;
}

export const CurrencyToggle = ({
  available,
  value,
  onChange,
}: CurrencyToggleProps) => (
  <div
    role="radiogroup"
    aria-label="Moneda mostrada"
    className="flex gap-1 self-start rounded-full border border-input p-1"
  >
    {available.map((c) => {
      const active = c === value;
      return (
        <button
          key={c}
          type="button"
          role="radio"
          aria-checked={active}
          onClick={() => onChange(c)}
          className={`rounded-full px-3 py-1.5 font-mono text-[11px] uppercase tracking-caption transition-colors ${
            active
              ? 'bg-foreground text-background'
              : 'text-foreground/60 hover:text-foreground'
          }`}
        >
          {c}
        </button>
      );
    })}
  </div>
);
