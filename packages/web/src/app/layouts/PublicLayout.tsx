import { Outlet } from 'react-router-dom';

export const PublicLayout = () => (
  <div className="min-h-screen flex items-center justify-center px-4 py-8 bg-muted/30">
    <div className="w-full max-w-sm">
      <Outlet />
    </div>
  </div>
);
