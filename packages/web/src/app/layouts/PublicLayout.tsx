import { Outlet } from 'react-router-dom';
import { t } from '../../lib/i18n.js';

/**
 * Auth shell — editorial white canvas, no card chrome around it. The brand
 * wordmark sits in display weight above a single centered column.
 */
export const PublicLayout = () => (
  <div className="min-h-dvh flex flex-col items-center justify-center bg-background px-5 py-12">
    <div className="w-full max-w-sm">
      <div className="mb-10 text-center">
        <span className="text-2xl font-bold tracking-display">
          {t.app.name}
        </span>
      </div>
      <Outlet />
    </div>
  </div>
);
