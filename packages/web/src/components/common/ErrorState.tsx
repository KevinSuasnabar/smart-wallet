interface ErrorStateProps {
  message?: string;
  onRetry?: () => void;
}

export const ErrorState = ({ message = 'Algo salió mal.', onRetry }: ErrorStateProps) => (
  <div className="flex flex-col items-center justify-center gap-3 py-12 px-4 text-center">
    <p className="text-sm text-muted-foreground">{message}</p>
    {onRetry !== undefined && (
      <button
        type="button"
        className="text-sm font-medium text-primary underline underline-offset-2"
        onClick={onRetry}
      >
        Reintentar
      </button>
    )}
  </div>
);
