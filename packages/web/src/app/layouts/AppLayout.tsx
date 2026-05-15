import { Outlet } from 'react-router-dom';
import { BottomTabBar } from '../../components/layout/BottomTabBar.js';
import { Sidebar } from '../../components/layout/Sidebar.js';

export const AppLayout = () => (
  <div className="min-h-dvh flex flex-col md:flex-row bg-background">
    {/* Desktop sidebar — hairline rule, hidden on mobile */}
    <Sidebar className="hidden md:flex md:w-64 md:border-r md:border-border" />

    {/* Main content area — capped width for editorial line length */}
    <main className="flex-1 pb-28 md:pb-10 px-5 md:px-10">
      <div className="mx-auto w-full max-w-3xl">
        <Outlet />
      </div>
    </main>

    {/* Mobile bottom tab bar — hidden on desktop */}
    <BottomTabBar className="md:hidden" />
  </div>
);
