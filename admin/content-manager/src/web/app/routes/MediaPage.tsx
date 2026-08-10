import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ContentManagerClient } from '../../api/client.ts';

const client = new ContentManagerClient();

interface MediaEntry {
  path: string;
  name: string;
  size: number;
  ext: string;
  status: 'active' | 'orphan' | 'generated' | 'staged' | 'missing';
  productName?: string;
}

export function MediaPage(): React.ReactElement {
  const [items, setItems] = useState<MediaEntry[]>([]);
  const [summary, setSummary] = useState<Record<string, number>>({});
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('all');

  const load = async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const data = await client.getMedia();
      setItems(data.items);
      setSummary(data.summary);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const filtered = filter === 'all' ? items : items.filter((i) => i.status === filter);

  if (error) {
    return (
      <main role="main" aria-label="Medios">
        <h1>Medios</h1>
        <p role="alert">{error}</p>
        <button
          onClick={() => {
            setError(null);
            void load();
          }}
        >
          Reintentar
        </button>
      </main>
    );
  }

  return (
    <main role="main" aria-label="Medios">
      <h1>Medios ({summary.total ?? 0} archivos)</h1>
      <nav
        aria-label="Navegación principal"
        style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}
      >
        <Link to="/products">Productos</Link>
        <Link to="/categories">Categorías</Link>
        <Link to="/media" aria-current="page">
          Medios
        </Link>
      </nav>

      {/* Summary cards */}
      <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
        {[
          { key: 'active', label: 'Activos', color: '#e8f5e9' },
          { key: 'orphans', label: 'Huérfanos', color: '#fff3e0' },
          { key: 'missing', label: 'Faltantes', color: '#ffebee' },
          { key: 'staged', label: 'Pendientes', color: '#e3f2fd' },
          { key: 'generated', label: 'Generados', color: '#f3e5f5' },
        ].map(({ key, label, color }) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            style={{
              padding: '0.5rem 0.75rem',
              background: filter === key ? color : '#f5f5f5',
              border:
                filter === key ? '2px solid var(--color-primary)' : '1px solid var(--color-border)',
              borderRadius: 'var(--radius)',
              cursor: 'pointer',
              fontSize: '0.85rem',
            }}
          >
            {label}: {summary[key] ?? 0}
          </button>
        ))}
        {filter !== 'all' && (
          <button
            onClick={() => setFilter('all')}
            style={{ padding: '0.5rem 0.75rem', fontSize: '0.85rem' }}
          >
            Mostrar todos
          </button>
        )}
      </div>

      {loading && <p>Cargando…</p>}

      {!loading && filtered.length === 0 && <p>No se encontraron archivos con estado "{filter}"</p>}

      {filtered.length > 0 && (
        <table
          aria-label="Inventario de medios"
          style={{ width: '100%', borderCollapse: 'collapse' }}
        >
          <thead>
            <tr>
              <th style={{ textAlign: 'left', padding: '0.25rem 0.5rem' }}>Archivo</th>
              <th style={{ textAlign: 'right', padding: '0.25rem 0.5rem' }}>Tamaño</th>
              <th style={{ textAlign: 'left', padding: '0.25rem 0.5rem' }}>Ext</th>
              <th style={{ textAlign: 'left', padding: '0.25rem 0.5rem' }}>Producto</th>
              <th style={{ textAlign: 'left', padding: '0.25rem 0.5rem' }}>Estado</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((item) => (
              <tr key={item.path} style={{ borderBottom: '1px solid var(--color-border)' }}>
                <td
                  style={{
                    padding: '0.25rem 0.5rem',
                    maxWidth: '300px',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                  title={item.path}
                >
                  {item.path}
                </td>
                <td style={{ padding: '0.25rem 0.5rem', textAlign: 'right' }}>
                  {item.status === 'missing' ? '—' : formatSize(item.size)}
                </td>
                <td style={{ padding: '0.25rem 0.5rem' }}>{item.ext}</td>
                <td style={{ padding: '0.25rem 0.5rem' }}>{item.productName ?? '—'}</td>
                <td style={{ padding: '0.25rem 0.5rem' }}>
                  <StatusBadge status={item.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}

function StatusBadge({ status }: { status: string }): React.ReactElement {
  const colors: Record<string, { bg: string; text: string }> = {
    active: { bg: '#e8f5e9', text: '#2e7d32' },
    orphan: { bg: '#fff3e0', text: '#e65100' },
    missing: { bg: '#ffebee', text: '#c62828' },
    staged: { bg: '#e3f2fd', text: '#1565c0' },
    generated: { bg: '#f3e5f5', text: '#6a1b9a' },
  };
  const c = colors[status] ?? { bg: '#f5f5f5', text: '#616161' };
  return (
    <span
      style={{
        background: c.bg,
        color: c.text,
        padding: '0.1rem 0.4rem',
        borderRadius: '10px',
        fontSize: '0.8rem',
        fontWeight: 500,
      }}
    >
      {status}
    </span>
  );
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
