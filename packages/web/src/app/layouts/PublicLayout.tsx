import { Outlet } from 'react-router-dom';
import { t } from '../../lib/i18n.js';

/**
 * Auth shell — the cream canvas with the wordmark in display weight above
 * a single centered column. No card chrome; auth forms ride a lime block.
 */
export const PublicLayout = () => (
  <div className="flex min-h-dvh flex-col items-center justify-center bg-background px-5 py-12">
    <div className="w-full max-w-sm">
      <div className="mb-10 text-center">
        <span className="text-3xl font-bold leading-none tracking-display">
          {t.app.name}
        </span>
      </div>
      <Outlet />
    </div>
  </div>
);
