import { Button } from '../ui/button.js';
import { Eyebrow } from './Eyebrow.js';

// Full-screen error fallback used by ErrorBoundary.
export const GenericErrorScreen = () => (
  <div className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-background p-6 text-center">
    <div className="flex flex-col items-center gap-2">
      <Eyebrow className="text-destructive">Error</Eyebrow>
      <h1 className="text-3xl font-bold tracking-display">Algo salió mal</h1>
      <p className="mt-1 max-w-sm text-muted-foreground">
        Ocurrió un error inesperado. Puedes intentar recargar la página.
      </p>
    </div>
    <Button onClick={() => window.location.reload()}>Recargar</Button>
  </div>
);
