import { NavLink, useNavigate } from 'react-router-dom';
import { LayoutGrid, Wallet, Plus, PiggyBank, Settings } from 'lucide-react';
import { cn } from '../../lib/utils.js';
import { routes } from '../../app/routes.js';

interface BottomTabBarProps {
  className?: string;
}

const tabClass = ({ isActive }: { isActive: boolean }) =>
  cn(
    'flex flex-col items-center gap-0.5 min-h-[44px] justify-center font-mono text-[10px] uppercase tracking-caption transition-colors',
    isActive ? 'text-background' : 'text-background/55',
  );

/**
 * Mobile chrome — mirrors the desktop sidebar's navy treatment so the app
 * feels consistent across viewports. The center action runs magenta so it
 * reads as the primary "add" affordance even at thumb height.
 *
 * Four tabs on an even `grid-cols-4` row (Recurrentes lives only in the
 * desktop sidebar + a header shortcut on the mobile dashboard) so the FAB —
 * absolutely centered on the bar's own midpoint, not a flex sibling — lands
 * exactly in the gap between the 2nd and 3rd column instead of drifting off
 * to whichever slot it happens to occupy. `ring-background` cuts a visual
 * notch so it reads as raised, not just overlapping.
 */
export const BottomTabBar = ({ className }: BottomTabBarProps) => {
  const navigate = useNavigate();

  return (
    <nav className={cn('fixed inset-x-0 bottom-0 z-30 bg-foreground pb-safe', className)}>
      <div className="relative">
        <div className="grid h-16 grid-cols-4 items-center px-1">
          <NavLink to={routes.dashboard} className={tabClass}>
            <LayoutGrid className="size-5" />
            <span className="hidden sm:inline">Resumen</span>
          </NavLink>

          <NavLink to={routes.wallets} className={tabClass}>
            <Wallet className="size-5" />
            <span className="hidden sm:inline">Billeteras</span>
          </NavLink>

          <NavLink to={routes.budgets} className={tabClass}>
            <PiggyBank className="size-5" />
            <span className="hidden sm:inline">Presupuestos</span>
          </NavLink>

          <NavLink to={routes.settings} className={tabClass}>
            <Settings className="size-5" />
            <span className="hidden sm:inline">Ajustes</span>
          </NavLink>
        </div>

        <button
          type="button"
          onClick={() => navigate(routes.transactionsNew)}
          className="absolute left-1/2 top-0 z-40 flex size-14 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-magenta text-white shadow-lg ring-4 ring-background transition-transform active:scale-95"
          aria-label="Agregar movimiento"
        >
          <Plus className="size-6" />
        </button>
      </div>
    </nav>
  );
};
