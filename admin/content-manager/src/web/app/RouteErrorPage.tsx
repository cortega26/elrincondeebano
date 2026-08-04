import { useRouteError, isRouteErrorResponse, Link } from "react-router-dom";

export function RouteErrorPage(): React.ReactElement {
  const error = useRouteError();

  if (isRouteErrorResponse(error)) {
    return (
      <main role="alert" aria-label="Error de ruta">
        <h1>
          {error.status} {error.statusText}
        </h1>
        <p>{error.data}</p>
        <Link to="/">Volver al inicio</Link>
      </main>
    );
  }

  const message = error instanceof Error ? error.message : "Error inesperado";

  return (
    <main role="alert" aria-label="Error">
      <h1>Error</h1>
      <p>{message}</p>
      <Link to="/">Volver al inicio</Link>
    </main>
  );
}
