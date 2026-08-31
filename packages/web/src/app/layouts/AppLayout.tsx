import { Outlet } from 'react-router-dom';
import { BottomTabBar } from '../../components/layout/BottomTabBar.js';
import { Sidebar } from '../../components/layout/Sidebar.js';
import { OfflineBanner } from '../../features/pwa/components/OfflineBanner.js';
import { InstallHint } from '../../features/pwa/components/InstallHint.js';

/**
 * The shell: navy sidebar (desktop) or navy bottom tab (mobile) framing a
 * cream canvas. The color shift between chrome and canvas is what carries
 * the structure — no internal borders needed.
 *
 * `<main>` sits inside a column wrapper so `<OfflineBanner />` can push content
 * down in normal flow without breaking the desktop sidebar row.
 */
export const AppLayout = () => (
  <div className="flex min-h-dvh flex-col bg-background md:flex-row">
    <Sidebar className="hidden md:flex md:w-64 md:sticky md:top-0 md:h-dvh" />

    <div className="flex min-w-0 flex-1 flex-col">
      <OfflineBanner />
      <main className="flex-1 px-5 pb-28 md:px-10 md:pb-10">
        <div className="mx-auto w-full max-w-3xl">
          <Outlet />
        </div>
      </main>
    </div>

    <BottomTabBar className="md:hidden" />
    <InstallHint />
  </div>
);
