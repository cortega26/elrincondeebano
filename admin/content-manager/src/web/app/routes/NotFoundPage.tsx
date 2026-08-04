import { Link } from "react-router-dom";

export function NotFoundPage(): React.ReactElement {
  return (
    <main role="main" aria-label="Página no encontrada">
      <h1>404 — Página no encontrada</h1>
      <p>La ruta solicitada no existe.</p>
      <Link to="/">Volver al inicio</Link>
    </main>
  );
}
