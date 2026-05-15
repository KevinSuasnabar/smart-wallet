import { Button } from '../ui/button.js';
import { Eyebrow } from './Eyebrow.js';

interface ErrorStateProps {
  message?: string;
  onRetry?: () => void;
}

export const ErrorState = ({
  message = 'Algo salió mal.',
  onRetry,
}: ErrorStateProps) => (
  <div className="flex flex-col items-center gap-4 rounded-block border border-border bg-card px-4 py-12 text-center">
    <div className="flex flex-col items-center gap-1.5">
      <Eyebrow className="text-destructive">Error</Eyebrow>
      <p className="text-base font-medium tracking-tightest">{message}</p>
    </div>
    {onRetry !== undefined && (
      <Button variant="outline" size="sm" onClick={onRetry}>
        Reintentar
      </Button>
    )}
  </div>
);
