import { NavLink } from 'react-router-dom';
import { Wallet, Tag, Settings, Plus } from 'lucide-react';
import { cn } from '../../lib/utils.js';
import { routes } from '../../app/routes.js';
import { useAuth } from '../../features/auth/useAuth.js';
import { Button } from '../ui/button.js';
import { Eyebrow } from '../common/Eyebrow.js';
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
    <aside className={cn('flex flex-col bg-background px-5 py-8', className)}>
      <div className="mb-12 text-3xl font-bold leading-none tracking-display">
        {t.app.name}
      </div>

      <Eyebrow className="mb-3 block px-3">Menú</Eyebrow>
      <nav className="flex flex-col gap-1.5 flex-1">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 rounded-full px-3 py-2.5 text-[15px] transition-colors',
                isActive
                  ? 'bg-primary font-semibold text-primary-foreground'
                  : 'text-muted-foreground hover:bg-accent hover:text-foreground',
              )
            }
          >
            <item.icon className="size-[18px]" />
            {item.label}
          </NavLink>
        ))}
      </nav>

      <NavLink to={routes.transactionsNew} className="mt-6">
        <Button variant="outline" className="w-full gap-2">
          <Plus className="size-4" />
          Agregar movimiento
        </Button>
      </NavLink>

      <div className="mt-6 border-t border-border pt-4">
        {user?.email && (
          <p className="mb-3 truncate font-mono text-[11px] tracking-caption text-muted-foreground">
            {user.email}
          </p>
        )}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => { void signOut(); }}
          className="w-full"
        >
          {t.auth.signOut}
        </Button>
      </div>
    </aside>
  );
};
