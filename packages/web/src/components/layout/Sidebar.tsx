import { NavLink } from 'react-router-dom';
import { LayoutGrid, Wallet, Repeat, Tag, Settings, Plus, LogOut, PiggyBank } from 'lucide-react';
import { cn } from '../../lib/utils.js';
import { routes } from '../../app/routes.js';
import { useAuth } from '../../features/auth/useAuth.js';
import { Button } from '../ui/button.js';
import { t } from '../../lib/i18n.js';

interface SidebarProps {
  className?: string;
}

const navItems = [
  { to: routes.dashboard, icon: LayoutGrid, label: 'Resumen' },
  { to: routes.wallets, icon: Wallet, label: 'Billeteras' },
  { to: routes.budgets, icon: PiggyBank, label: t.budgets.sidebarLabel },
  { to: routes.recurring, icon: Repeat, label: 'Recurrentes' },
  { to: routes.categories, icon: Tag, label: 'Categorías' },
  { to: routes.settings, icon: Settings, label: 'Ajustes' },
] as const;

/**
 * Navy chrome — the wall that breaks the cream canvas. Cream text on navy,
 * lime block on the active item (the "selected = primary surface" pattern,
 * but using lime as the brand accent inside the inverse surface).
 */
export const Sidebar = ({ className }: SidebarProps) => {
  const { signOut, user } = useAuth();

  return (
    <aside className={cn('flex flex-col bg-foreground px-5 py-8 text-background', className)}>
      <div className="mb-12 text-3xl font-bold leading-none tracking-display">{t.app.name}</div>

      <span className="mb-3 block px-3 font-mono text-[11px] uppercase tracking-eyebrow text-background/45">
        Menú
      </span>
      <nav className="flex flex-1 flex-col gap-1.5">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 rounded-full px-3 py-2.5 text-[15px] transition-colors',
                isActive
                  ? 'bg-block-lime font-semibold text-ink'
                  : 'text-background/75 hover:bg-background/10 hover:text-background',
              )
            }
          >
            <item.icon className="size-[18px]" />
            {item.label}
          </NavLink>
        ))}
      </nav>

      <NavLink to={routes.transactionsNew} className="mt-6">
        <Button variant="promo" className="w-full gap-2">
          <Plus className="size-4" />
          Agregar movimiento
        </Button>
      </NavLink>

      <div className="mt-6 border-t border-background/10 pt-4">
        {user?.email && (
          <p className="mb-3 truncate font-mono text-[11px] tracking-caption text-background/55">
            {user.email}
          </p>
        )}
        <button
          type="button"
          onClick={() => {
            void signOut();
          }}
          className="inline-flex items-center gap-2 rounded-full px-3 py-2 text-sm text-background/70 transition-colors hover:bg-background/10 hover:text-background"
        >
          <LogOut className="size-4" />
          {t.auth.signOut}
        </button>
      </div>
    </aside>
  );
};
