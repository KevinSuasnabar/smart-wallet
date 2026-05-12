import { NavLink, useNavigate } from 'react-router-dom';
import { Wallet, Plus, Tag, Settings } from 'lucide-react';
import { cn } from '../../lib/utils.js';
import { routes } from '../../app/routes.js';

interface BottomTabBarProps {
  className?: string;
}

export const BottomTabBar = ({ className }: BottomTabBarProps) => {
  const navigate = useNavigate();

  return (
    <nav
      className={cn(
        'fixed bottom-0 inset-x-0 bg-background border-t pb-safe z-30',
        className,
      )}
    >
      <div className="flex items-center justify-around h-16 px-4">
        <NavLink
          to={routes.wallets}
          className={({ isActive }) =>
            cn(
              'flex flex-col items-center gap-1 min-w-[44px] min-h-[44px] justify-center text-xs',
              isActive ? 'text-primary' : 'text-muted-foreground',
            )
          }
        >
          <Wallet className="size-5" />
          <span>Billeteras</span>
        </NavLink>

        <button
          type="button"
          onClick={() => { void navigate(routes.transactionsNew); }}
          className="flex items-center justify-center size-14 rounded-full bg-primary text-primary-foreground shadow-lg -translate-y-2 z-40"
          aria-label="Agregar movimiento"
        >
          <Plus className="size-6" />
        </button>

        <NavLink
          to={routes.categories}
          className={({ isActive }) =>
            cn(
              'flex flex-col items-center gap-1 min-w-[44px] min-h-[44px] justify-center text-xs',
              isActive ? 'text-primary' : 'text-muted-foreground',
            )
          }
        >
          <Tag className="size-5" />
          <span>Categorías</span>
        </NavLink>

        <NavLink
          to={routes.settings}
          className={({ isActive }) =>
            cn(
              'flex flex-col items-center gap-1 min-w-[44px] min-h-[44px] justify-center text-xs',
              isActive ? 'text-primary' : 'text-muted-foreground',
            )
          }
        >
          <Settings className="size-5" />
          <span>Ajustes</span>
        </NavLink>
      </div>
    </nav>
  );
};
