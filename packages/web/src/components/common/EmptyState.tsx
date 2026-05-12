import type { ReactNode } from 'react';

interface EmptyStateProps {
  message: string;
  cta?: ReactNode;
}

export const EmptyState = ({ message, cta }: EmptyStateProps) => (
  <div className="flex flex-col items-center justify-center gap-4 py-16 px-4 text-center">
    <p className="text-sm text-muted-foreground">{message}</p>
    {cta}
  </div>
);
