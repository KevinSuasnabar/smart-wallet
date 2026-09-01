import type { ReactNode } from 'react';
import { Eyebrow } from './Eyebrow.js';

interface PageHeaderProps {
  title: string;
  /** Optional mono uppercase taxonomy label above the title. */
  eyebrow?: string;
  action?: ReactNode;
}

/**
 * Display heading — runs at near display-lg scale on desktop so a page title
 * reads like an editorial section opener, not a card header.
 */
export const PageHeader = ({ title, eyebrow, action }: PageHeaderProps) => (
  <header className="flex items-end justify-between gap-4 py-6 md:py-8">
    <div className="flex min-w-0 flex-col gap-2">
      {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
      <h1 className="truncate text-3xl font-bold leading-tight tracking-display md:text-4xl">
        {title}
      </h1>
    </div>
    {action && <div className="shrink-0">{action}</div>}
  </header>
);
