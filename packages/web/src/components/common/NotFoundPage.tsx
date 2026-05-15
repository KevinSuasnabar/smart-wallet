import { Link } from 'react-router-dom';
import { Button } from '../ui/button.js';
import { Eyebrow } from './Eyebrow.js';
import { routes } from '../../app/routes.js';

export const NotFoundPage = () => (
  <div className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-background p-6 text-center">
    <div className="flex flex-col items-center gap-2">
      <Eyebrow>Error 404</Eyebrow>
      <h1 className="text-5xl font-bold tracking-display">Sin salida</h1>
      <p className="mt-1 text-muted-foreground">
        La página que buscás no existe.
      </p>
    </div>
    <Button asChild>
      <Link to={routes.home}>Volver al inicio</Link>
    </Button>
  </div>
);
