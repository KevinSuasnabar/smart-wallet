import { NavLink, useNavigate } from 'react-router-dom';
import { Wallet, Plus, Tag, Settings } from 'lucide-react';
import { cn } from '../../lib/utils.js';
import { routes } from '../../app/routes.js';

interface BottomTabBarProps {
  className?: string;
}

const tabClass = ({ isActive }: { isActive: boolean }) =>
  cn(
    'flex flex-col items-center gap-1 min-w-[44px] min-h-[44px] justify-center font-mono text-[10px] uppercase tracking-caption transition-colors',
    isActive ? 'text-background' : 'text-background/55',
  );

/**
 * Mobile chrome — mirrors the desktop sidebar's navy treatment so the app
 * feels consistent across viewports. The center action runs magenta so it
 * reads as the primary "add" affordance even at thumb height.
 */
export const BottomTabBar = ({ className }: BottomTabBarProps) => {
  const navigate = useNavigate();

  return (
    <nav
      className={cn(
        'fixed inset-x-0 bottom-0 z-30 bg-foreground pb-safe',
        className,
      )}
    >
      <div className="flex h-16 items-center justify-around px-4">
        <NavLink to={routes.wallets} className={tabClass}>
          <Wallet className="size-5" />
          <span>Billeteras</span>
        </NavLink>

        <button
          type="button"
          onClick={() => navigate(routes.transactionsNew)}
          className="z-40 flex size-14 -translate-y-3 items-center justify-center rounded-full bg-magenta text-white shadow-lg transition-transform active:scale-95"
          aria-label="Agregar movimiento"
        >
          <Plus className="size-6" />
        </button>

        <NavLink to={routes.categories} className={tabClass}>
          <Tag className="size-5" />
          <span>Categorías</span>
        </NavLink>

        <NavLink to={routes.settings} className={tabClass}>
          <Settings className="size-5" />
          <span>Ajustes</span>
        </NavLink>
      </div>
    </nav>
  );
};
