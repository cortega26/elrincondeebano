import { useState, useEffect } from "react";

interface HistoryEntry {
  product_name: string;
  product_id?: string;
  field: string;
  timestamp?: string;
  by?: string;
  rev?: number;
}

export function HistoryPage(): React.ReactElement {
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [summary, setSummary] = useState<Record<string, unknown>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/history");
      const data = await res.json() as { entries: HistoryEntry[]; total_products: number; products_with_history: number };
      setEntries(data.entries);
      setSummary(data);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  return (
    <main role="main" aria-label="Historial">
      <h1>Historial de cambios</h1>
      <nav aria-label="Navegación principal" style={{ display: "flex", gap: "1rem", marginBottom: "1rem" }}>
        <a href="/products">Productos</a>
        <a href="/categories">Categorías</a>
        <a href="/media">Medios</a>
        <a href="/history" aria-current="page">Historial</a>
      </nav>

      {error && <p role="alert">{error}</p>}
      {loading && <p>Cargando…</p>}

      <p style={{ color: "#6c757d", marginBottom: "1rem" }}>
        {String(summary.products_with_history ?? 0)} de {String(summary.total_products ?? 0)} productos con historial
      </p>

      {entries.length > 0 && (
        <table aria-label="Historial de cambios" style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={{ textAlign: "left", padding: "0.25rem 0.5rem" }}>Producto</th>
              <th style={{ textAlign: "left", padding: "0.25rem 0.5rem" }}>Campo</th>
              <th style={{ textAlign: "left", padding: "0.25rem 0.5rem" }}>Fecha</th>
              <th style={{ textAlign: "left", padding: "0.25rem 0.5rem" }}>Por</th>
              <th style={{ textAlign: "right", padding: "0.25rem 0.5rem" }}>Rev</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e, i) => (
              <tr key={i} style={{ borderBottom: "1px solid var(--color-border)" }}>
                <td style={{ padding: "0.25rem 0.5rem" }}>{e.product_name}</td>
                <td style={{ padding: "0.25rem 0.5rem" }}><code>{e.field}</code></td>
                <td style={{ padding: "0.25rem 0.5rem" }}>{e.timestamp ?? "—"}</td>
                <td style={{ padding: "0.25rem 0.5rem" }}>{e.by ?? "—"}</td>
                <td style={{ padding: "0.25rem 0.5rem", textAlign: "right" }}>{e.rev}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {!loading && entries.length === 0 && <p>No hay entradas de historial.</p>}
    </main>
  );
}
