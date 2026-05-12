import { Link } from 'react-router-dom';
import { Button } from '../../../components/ui/button.js';
import { routes } from '../../../app/routes.js';
import { t } from '../../../lib/i18n.js';

export const EmptyWalletsState = () => (
  <div className="flex flex-col items-center justify-center gap-4 py-16 px-4 text-center">
    <p className="text-muted-foreground">{t.wallets.emptyState}</p>
    <Button asChild>
      <Link to={routes.walletsNew}>{t.wallets.emptyCta}</Link>
    </Button>
  </div>
);
