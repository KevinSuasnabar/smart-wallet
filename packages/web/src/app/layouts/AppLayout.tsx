import { Outlet } from 'react-router-dom';
import { BottomTabBar } from '../../components/layout/BottomTabBar.js';
import { Sidebar } from '../../components/layout/Sidebar.js';

/**
 * The shell: navy sidebar (desktop) or navy bottom tab (mobile) framing a
 * cream canvas. The color shift between chrome and canvas is what carries
 * the structure — no internal borders needed.
 */
export const AppLayout = () => (
  <div className="flex min-h-dvh flex-col bg-background md:flex-row">
    <Sidebar className="hidden md:flex md:w-64 md:sticky md:top-0 md:h-dvh" />

    <main className="flex-1 px-5 pb-28 md:px-10 md:pb-10">
      <div className="mx-auto w-full max-w-3xl">
        <Outlet />
      </div>
    </main>

    <BottomTabBar className="md:hidden" />
  </div>
);
