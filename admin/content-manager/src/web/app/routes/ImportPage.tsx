import { useState } from 'react';
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
}

export function ImportPage(): React.ReactElement {
  const [input, setInput] = useState('');
  const [conflicts, setConflicts] = useState<ConflictEntry[]>([]);
  const [noConflicts, setNoConflicts] = useState(0);
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
      const resolved = conflicts.filter((c) => c.resolved);
      if (resolved.length === 0) {
        setError('No hay conflictos resueltos para aplicar');
        setLoading(false);
        return;
      }

      // Build products to apply from resolved conflicts
      const productMap = new Map<string, Record<string, unknown>>();
      for (const c of resolved) {
        if (!productMap.has(c.product_id)) {
          productMap.set(c.product_id, { id: c.product_id });
        }
        const entry = productMap.get(c.product_id)!;
        if (c.resolution === 'use_incoming') {
          entry[c.field] = c.incoming_value;
        }
        // "keep_local" means we skip that field (no change)
      }

      const response = await fetchWithCredential('/api/v1/import/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ products: [...productMap.values()] }),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        setError(
          (err as { error?: { message?: string } }).error?.message ?? `Error ${response.status}`
        );
        setLoading(false);
        return;
      }

      const data = (await response.json()) as { created: number; updated: number };
      const pending = conflicts.filter((c) => !c.resolved).length;
      setResult(
        `${conflicts.length} conflictos totales, ${resolved.length} resueltos, ${pending} pendientes. Creados: ${data.created}, Actualizados: ${data.updated}`
      );
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const resolvedCount = conflicts.filter((c) => c.resolved).length;
  const pendingCount = conflicts.filter((c) => !c.resolved).length;

  return (
    <main role="main" aria-label="Importar catálogo">
      <h1>Importar catálogo</h1>
      <nav
        aria-label="Navegación principal"
        style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}
      >
        <a href="/products">Productos</a>
        <a href="/categories">Categorías</a>
        <a href="/media">Medios</a>
        <a href="/import" aria-current="page">
          Importar
        </a>
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
        {conflicts.length > 0 && (
          <button onClick={handleApply} disabled={loading || resolvedCount === 0}>
            Aplicar resueltos
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

      {conflicts.length > 0 && (
        <div style={{ marginBottom: '1rem' }}>
          <p>
            <strong>{noConflicts}</strong> productos sin conflictos (creaciones),{' '}
            <strong>{conflicts.length}</strong> conflictos detectados,{' '}
            <strong>{resolvedCount}</strong> resueltos, <strong>{pendingCount}</strong> pendientes
          </p>

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
        </div>
      )}
    </main>
  );
}
