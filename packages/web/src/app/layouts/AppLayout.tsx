import { Outlet } from 'react-router-dom';
import { BottomTabBar } from '../../components/layout/BottomTabBar.js';
import { Sidebar } from '../../components/layout/Sidebar.js';

export const AppLayout = () => (
  <div className="min-h-dvh flex flex-col md:flex-row">
    {/* Desktop sidebar — hidden on mobile */}
    <Sidebar className="hidden md:flex md:w-60 md:border-r" />

    {/* Main content area */}
    <main className="flex-1 pb-24 md:pb-6 px-4 md:px-6">
      <Outlet />
    </main>

    {/* Mobile bottom tab bar — hidden on desktop */}
    <BottomTabBar className="md:hidden" />
  </div>
);
