import { useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchWithCredential } from '../credentialStore.ts';

interface ConflictEntry {
  product_name: string;
  product_id: string;
  field: string;
  local_value: unknown;
  incoming_value: unknown;
  resolved: boolean;
  resolution: null | 'keep_local' | 'use_incoming';
}

interface PreviewResponse {
  conflicts: ConflictEntry[];
  no_conflicts: number;
  total_conflicts: number;
  new_products: Array<Record<string, unknown>>;
  incoming_by_id: Record<string, Record<string, unknown>>;
}

export function ImportPage(): React.ReactElement {
  const [input, setInput] = useState('');
  const [conflicts, setConflicts] = useState<ConflictEntry[]>([]);
  const [noConflicts, setNoConflicts] = useState(0);
  const [newProducts, setNewProducts] = useState<Array<Record<string, unknown>>>([]);
  const [incomingById, setIncomingById] = useState<Record<string, Record<string, unknown>>>({});
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const handlePreview = async (): Promise<void> => {
    setError(null);
    setResult(null);
    setLoading(true);
    try {
      let parsed: unknown;
      try {
        parsed = JSON.parse(input);
      } catch {
        setError('JSON inválido');
        setLoading(false);
        return;
      }

      const products = (parsed as Record<string, unknown>)?.products ?? parsed;

      const response = await fetchWithCredential('/api/v1/import/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ products }),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        setError(
          (err as { error?: { message?: string } }).error?.message ?? `Error ${response.status}`
        );
        setLoading(false);
        return;
      }

      const data = (await response.json()) as PreviewResponse;
      setConflicts(data.conflicts);
      setNoConflicts(data.no_conflicts);
      setNewProducts(data.new_products);
      setIncomingById(data.incoming_by_id);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleResolution = (index: number, resolution: 'keep_local' | 'use_incoming'): void => {
    setConflicts((prev) =>
      prev.map((c, i) => (i === index ? { ...c, resolved: true, resolution } : c))
    );
  };

  const handleApply = async (): Promise<void> => {
    setError(null);
    setResult(null);
    setLoading(true);
    try {
      // Only fields explicitly resolved to "use_incoming" are sent as
      // resolutions — the server applies exactly those fields from the full
      // incoming object and leaves everything else (including "keep_local"
      // fields) untouched.
      const useIncoming = conflicts.filter((c) => c.resolved && c.resolution === 'use_incoming');

      if (useIncoming.length === 0 && newProducts.length === 0) {
        setError('No hay cambios para aplicar');
        setLoading(false);
        return;
      }

      // The server requires a schema-valid full product object per entry
      // (a partial { id, field } object always fails validation) — send the
      // full incoming object captured at preview time for every conflicted
      // product being changed, plus every no-conflict (new) product as-is.
      const conflictedIds = [...new Set(useIncoming.map((c) => c.product_id))];
      const conflictedProducts = conflictedIds
        .map((id) => incomingById[id])
        .filter((p): p is Record<string, unknown> => Boolean(p));

      const resolutions = useIncoming.map((c) => ({
        product_id: c.product_id,
        field: c.field,
        resolution: 'incoming' as const,
      }));

      const response = await fetchWithCredential('/api/v1/import/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          products: [...conflictedProducts, ...newProducts],
          resolutions,
        }),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        setError(
          (err as { error?: { message?: string } }).error?.message ?? `Error ${response.status}`
        );
        setLoading(false);
        return;
      }

      const data = (await response.json()) as {
        applied: number;
        skipped: number;
        errors?: string[];
      };
      setResult(
        `Aplicados: ${data.applied}, omitidos: ${data.skipped}` +
          (data.errors?.length ? `, errores: ${data.errors.length}` : '')
      );
      if (data.errors && data.errors.length > 0) {
        setError(data.errors[0]);
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const resolvedCount = conflicts.filter((c) => c.resolved).length;
  const pendingCount = conflicts.filter((c) => !c.resolved).length;
  const applyCount =
    conflicts.filter((c) => c.resolved && c.resolution === 'use_incoming').length +
    newProducts.length;

  return (
    <main role="main" aria-label="Importar catálogo">
      <h1>Importar catálogo</h1>
      <nav
        aria-label="Navegación principal"
        style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}
      >
        <Link to="/products">Productos</Link>
        <Link to="/categories">Categorías</Link>
        <Link to="/media">Medios</Link>
        <Link to="/import" aria-current="page">
          Importar
        </Link>
      </nav>

      <div style={{ marginBottom: '1rem' }}>
        <textarea
          aria-label="Pegar catálogo JSON"
          rows={12}
          cols={80}
          value={input}
          onChange={(e) => setInput(e.currentTarget.value)}
          placeholder='Pega aquí el catálogo JSON... Ej: { "products": [...] }'
          style={{ width: '100%', fontFamily: 'monospace', fontSize: '0.85rem' }}
        />
      </div>

      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
        <button onClick={handlePreview} disabled={loading || !input.trim()}>
          Vista previa
        </button>
        {(conflicts.length > 0 || newProducts.length > 0) && (
          <button onClick={handleApply} disabled={loading || applyCount === 0}>
            Aplicar
          </button>
        )}
      </div>

      {error && (
        <p role="alert" style={{ color: '#c62828' }}>
          {error}
        </p>
      )}
      {result && <p style={{ color: '#2e7d32' }}>{result}</p>}
      {loading && <p>Cargando…</p>}

      {(conflicts.length > 0 || newProducts.length > 0) && (
        <div style={{ marginBottom: '1rem' }}>
          <p>
            <strong>{noConflicts}</strong> productos sin conflictos (creaciones),{' '}
            <strong>{conflicts.length}</strong> conflictos detectados,{' '}
            <strong>{resolvedCount}</strong> resueltos, <strong>{pendingCount}</strong> pendientes
          </p>

          {conflicts.length > 0 && (
            <table
              aria-label="Conflictos de importación"
              style={{ width: '100%', borderCollapse: 'collapse' }}
            >
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', padding: '0.25rem 0.5rem' }}>Producto</th>
                  <th style={{ textAlign: 'left', padding: '0.25rem 0.5rem' }}>Campo</th>
                  <th style={{ textAlign: 'left', padding: '0.25rem 0.5rem' }}>Valor actual</th>
                  <th style={{ textAlign: 'left', padding: '0.25rem 0.5rem' }}>Valor entrante</th>
                  <th style={{ textAlign: 'left', padding: '0.25rem 0.5rem' }}>Resolución</th>
                </tr>
              </thead>
              <tbody>
                {conflicts.map((c, i) => (
                  <tr
                    key={`${c.product_id}-${c.field}-${i}`}
                    style={{ borderBottom: '1px solid var(--color-border)' }}
                  >
                    <td style={{ padding: '0.25rem 0.5rem' }}>{c.product_name}</td>
                    <td style={{ padding: '0.25rem 0.5rem' }}>{c.field}</td>
                    <td style={{ padding: '0.25rem 0.5rem' }}>{String(c.local_value)}</td>
                    <td style={{ padding: '0.25rem 0.5rem' }}>{String(c.incoming_value)}</td>
                    <td style={{ padding: '0.25rem 0.5rem' }}>
                      {c.field === 'validation' ? (
                        <span style={{ color: '#c62828' }}>Error: {String(c.incoming_value)}</span>
                      ) : (
                        <select
                          value={c.resolution ?? ''}
                          onChange={(e) =>
                            handleResolution(
                              i,
                              e.currentTarget.value as 'keep_local' | 'use_incoming'
                            )
                          }
                        >
                          <option value="">Elegir…</option>
                          <option value="keep_local">Mantener local</option>
                          <option value="use_incoming">Usar entrante</option>
                        </select>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </main>
  );
}
