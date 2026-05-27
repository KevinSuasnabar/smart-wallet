import { NavLink, useNavigate } from 'react-router-dom';
import { LayoutGrid, Wallet, Plus, Repeat, PiggyBank, Settings } from 'lucide-react';
import { cn } from '../../lib/utils.js';
import { routes } from '../../app/routes.js';

interface BottomTabBarProps {
  className?: string;
}

const tabClass = ({ isActive }: { isActive: boolean }) =>
  cn(
    'flex flex-col items-center gap-0.5 min-w-[40px] min-h-[44px] justify-center font-mono text-[10px] uppercase tracking-caption transition-colors',
    isActive ? 'text-background' : 'text-background/55',
  );

/**
 * Mobile chrome — mirrors the desktop sidebar's navy treatment so the app
 * feels consistent across viewports. The center action runs magenta so it
 * reads as the primary "add" affordance even at thumb height.
 *
 * Six elements (5 tabs + central FAB) — labels collapse to icon-only below
 * `sm` to keep the row from overflowing on 320px viewports.
 */
export const BottomTabBar = ({ className }: BottomTabBarProps) => {
  const navigate = useNavigate();

  return (
    <nav className={cn('fixed inset-x-0 bottom-0 z-30 bg-foreground pb-safe', className)}>
      <div className="flex h-16 items-center justify-around px-1">
        <NavLink to={routes.dashboard} className={tabClass}>
          <LayoutGrid className="size-5" />
          <span className="hidden sm:inline">Resumen</span>
        </NavLink>

        <NavLink to={routes.wallets} className={tabClass}>
          <Wallet className="size-5" />
          <span className="hidden sm:inline">Billeteras</span>
        </NavLink>

        <NavLink to={routes.recurring} className={tabClass}>
          <Repeat className="size-5" />
          <span className="hidden sm:inline">Recurrentes</span>
        </NavLink>

        <button
          type="button"
          onClick={() => navigate(routes.transactionsNew)}
          className="z-40 flex size-14 -translate-y-3 items-center justify-center rounded-full bg-magenta text-white shadow-lg transition-transform active:scale-95"
          aria-label="Agregar movimiento"
        >
          <Plus className="size-6" />
        </button>

        <NavLink to={routes.budgets} className={tabClass}>
          <PiggyBank className="size-5" />
          <span className="hidden sm:inline">Presupuestos</span>
        </NavLink>

        <NavLink to={routes.settings} className={tabClass}>
          <Settings className="size-5" />
          <span className="hidden sm:inline">Ajustes</span>
        </NavLink>
      </div>
    </nav>
  );
};
