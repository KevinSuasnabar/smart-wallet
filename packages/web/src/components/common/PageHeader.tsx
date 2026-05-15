import type { ReactNode } from 'react';
import { Eyebrow } from './Eyebrow.js';

interface PageHeaderProps {
  title: string;
  /** Optional mono uppercase taxonomy label above the title. */
  eyebrow?: string;
  action?: ReactNode;
}

export const PageHeader = ({ title, eyebrow, action }: PageHeaderProps) => (
  <header className="flex items-end justify-between gap-4 py-6">
    <div className="flex flex-col gap-1.5">
      {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
      <h1 className="text-2xl font-bold leading-none tracking-display">
        {title}
      </h1>
    </div>
    {action && <div className="shrink-0">{action}</div>}
  </header>
);
