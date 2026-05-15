import { Link } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { ColorBlock } from '../../../components/common/ColorBlock.js';
import { Eyebrow } from '../../../components/common/Eyebrow.js';
import { Button } from '../../../components/ui/button.js';
import { routes } from '../../../app/routes.js';
import { t } from '../../../lib/i18n.js';

export const EmptyRecurringState = () => (
  <ColorBlock tone="lime" className="flex flex-col items-start gap-3">
    <Eyebrow>{t.recurring.eyebrow}</Eyebrow>
    <p className="text-base text-foreground/80">{t.recurring.emptyState}</p>
    <Button asChild size="sm" className="gap-1">
      <Link to={routes.recurringNew}>
        <Plus className="size-4" />
        {t.recurring.emptyCta}
      </Link>
    </Button>
  </ColorBlock>
);
