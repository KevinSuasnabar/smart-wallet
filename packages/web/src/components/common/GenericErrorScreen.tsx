// Full-screen error fallback used by ErrorBoundary.
export const GenericErrorScreen = () => (
  <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-6 text-center">
    <h1 className="text-xl font-semibold">Algo salió mal.</h1>
    <p className="text-muted-foreground text-sm">
      Ocurrió un error inesperado. Podés intentar recargar la página.
    </p>
    <button
      type="button"
      className="rounded-md bg-primary px-4 py-2 text-primary-foreground text-sm font-medium hover:bg-primary/90"
      onClick={() => window.location.reload()}
    >
      Recargar
    </button>
  </div>
);
