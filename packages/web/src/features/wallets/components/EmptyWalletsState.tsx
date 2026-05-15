import { Link } from 'react-router-dom';
import { Button } from '../../../components/ui/button.js';
import { EmptyState } from '../../../components/common/EmptyState.js';
import { routes } from '../../../app/routes.js';
import { t } from '../../../lib/i18n.js';

export const EmptyWalletsState = () => (
  <EmptyState
    eyebrow="Billeteras"
    message={t.wallets.emptyState}
    cta={
      <Button asChild>
        <Link to={routes.walletsNew}>{t.wallets.emptyCta}</Link>
      </Button>
    }
  />
);
