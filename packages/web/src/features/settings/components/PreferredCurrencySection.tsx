import { Card } from '../../../components/ui/card.js';
import { Eyebrow } from '../../../components/common/Eyebrow.js';
import { Label } from '../../../components/ui/label.js';
import { CurrencySelect } from '../../wallets/components/CurrencySelect.js';
import { usePreferredCurrency } from '../usePreferredCurrency.js';
import { t } from '../../../lib/i18n.js';

export const PreferredCurrencySection = () => {
  const { currency, setCurrency } = usePreferredCurrency();

  return (
    <Card className="flex flex-col gap-4 p-6">
      <div className="flex flex-col gap-2">
        <Eyebrow>{t.settings.preferredCurrency.eyebrow}</Eyebrow>
        <h2 className="text-2xl font-bold leading-none tracking-display">
          {t.settings.preferredCurrency.title}
        </h2>
      </div>

      <p className="text-sm text-muted-foreground">
        {t.settings.preferredCurrency.helper}
      </p>

      <div className="space-y-2">
        <Label htmlFor="preferred-currency-select">
          {t.settings.preferredCurrency.label}
        </Label>
        <CurrencySelect
          id="preferred-currency-select"
          value={currency ?? undefined}
          onChange={setCurrency}
          placeholder={t.settings.preferredCurrency.placeholder}
        />
      </div>
    </Card>
  );
};
