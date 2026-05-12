import { NavLink } from 'react-router-dom';
import { Wallet, Tag, Settings, Plus } from 'lucide-react';
import { cn } from '../../lib/utils.js';
import { routes } from '../../app/routes.js';
import { useAuth } from '../../features/auth/useAuth.js';
import { Button } from '../ui/button.js';
import { t } from '../../lib/i18n.js';

interface SidebarProps {
  className?: string;
}

const navItems = [
  { to: routes.wallets, icon: Wallet, label: 'Billeteras' },
  { to: routes.categories, icon: Tag, label: 'Categorías' },
  { to: routes.settings, icon: Settings, label: 'Ajustes' },
] as const;

export const Sidebar = ({ className }: SidebarProps) => {
  const { signOut, user } = useAuth();

  return (
    <aside className={cn('flex flex-col bg-background p-4', className)}>
      <div className="text-xl font-bold mb-8">{t.app.name}</div>

      <nav className="flex flex-col gap-1 flex-1">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 px-3 py-2 rounded-md text-sm hover:bg-accent transition-colors',
                isActive && 'bg-accent text-accent-foreground font-medium',
              )
            }
          >
            <item.icon className="size-4" />
            {item.label}
          </NavLink>
        ))}
      </nav>

      <NavLink to={routes.transactionsNew}>
        <Button variant="default" className="w-full mb-2 gap-2">
          <Plus className="size-4" />
          Agregar movimiento
        </Button>
      </NavLink>

      {user?.email && (
        <div className="text-xs text-muted-foreground mt-4 truncate">
          {user.email}
        </div>
      )}

      <Button
        variant="outline"
        size="sm"
        onClick={() => { void signOut(); }}
        className="w-full mt-2"
      >
        {t.auth.signOut}
      </Button>
    </aside>
  );
};
