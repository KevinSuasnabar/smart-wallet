import { Link } from 'react-router-dom';
import { routes } from '../../app/routes.js';

export const NotFoundPage = () => (
  <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-6 text-center">
    <h1 className="text-2xl font-bold">404</h1>
    <p className="text-muted-foreground text-sm">No encontrado.</p>
    <Link
      to={routes.home}
      className="text-sm font-medium text-primary underline underline-offset-2"
    >
      Volver al inicio
    </Link>
  </div>
);
