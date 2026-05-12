import type { ReactNode } from 'react';

interface PageHeaderProps {
  title: string;
  action?: ReactNode;
}

export const PageHeader = ({ title, action }: PageHeaderProps) => (
  <header className="flex items-center justify-between py-4">
    <h1 className="text-xl font-semibold leading-none">{title}</h1>
    {action}
  </header>
);
