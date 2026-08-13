import { useState, useEffect, useCallback } from 'react';
import { ContentManagerClient } from '../../api/client.ts';
// Plan 115 exception: the workbench mutations (upload, intents) keep the
// credential helper until they get client methods of their own.
import { fetchWithCredential } from '../credentialStore.ts';

const client = new ContentManagerClient();

interface MediaEntry {
  path: string;
  name: string;
  size: number;
  ext: string;
  status: 'active' | 'orphan' | 'generated' | 'staged' | 'missing';
  productName?: string;
}

interface MediaIntent {
  id: string;
  type: string;
  status: 'pending' | 'running' | 'succeeded' | 'failed' | 'cancelled' | 'applied';
  progress: number;
  target_path?: string;
  product_id?: string;
  category_slug?: string;
  errors: string[];
}

interface CategoryEntry {
  key: string;
  slug: string;
}

interface ProductOption {
  id: string;
  name: string;
}

const MEDIA_STATUS_LABEL: Record<string, string> = {
  active: 'Activo',
  orphan: 'Huérfano',
  generated: 'Generado',
  staged: 'Staging',
  missing: 'Faltante',
  pending: 'Pendiente',
  running: 'Ejecutando',
  succeeded: 'Listo',
  failed: 'Falló',
  cancelled: 'Cancelado',
  applied: 'Aplicado',
};

const STATUS_LABEL: Record<string, string> = {
  pending: 'Pendiente',
  running: 'Ejecutando',
  succeeded: 'Listo',
  failed: 'Falló',
  cancelled: 'Cancelado',
  applied: 'Aplicado',
};

export function MediaPage(): React.ReactElement {
  const [items, setItems] = useState<MediaEntry[]>([]);
  const [intents, setIntents] = useState<MediaIntent[]>([]);
  const [summary, setSummary] = useState<Record<string, number>>({});
  const [categories, setCategories] = useState<CategoryEntry[]>([]);
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('all');
  // Plan 127 F2.4: multi-select for batch intent operations.
  const [selectedIntents, setSelectedIntents] = useState<Set<string>>(new Set());
  const [fileName, setFileName] = useState<string | null>(null);
  const [uploadState, setUploadState] = useState<{
    staged_file: string;
    sha256: string;
    size: number;
    content_type: string;
  } | null>(null);
  const [targetPath, setTargetPath] = useState('');
  const [productId, setProductId] = useState('');
  const [intentType, setIntentType] = useState<'avif' | 'variant'>('avif');
  const [ogCategory, setOgCategory] = useState('');

  const load = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      // Plan 115: typed client for the media inventory read.
      const data = await client.getMedia();
      setItems(data.items);
      setSummary(data.summary);
      setIntents(data.intents);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    fetch('/api/v1/categories')
      .then((r) => r.json())
      .then((d) => setCategories(d.categories as CategoryEntry[]))
      .catch(() => {});
    fetch('/api/v1/products')
      .then((r) => r.json())
      .then((d) => setProducts(d.items as ProductOption[]))
      .catch(() => {});
  }, [load]);

  const handleFile = async (file: File | undefined): Promise<void> => {
    setError(null);
    setFeedback(null);
    setUploadState(null);
    if (!file) return;

    const base64 = await new Promise<string>((resolvePromise, reject) => {
      const reader = new FileReader();
      reader.onload = (): void => {
        const result = String(reader.result ?? '');
        resolvePromise(result.split(',')[1] ?? '');
      };
      reader.onerror = (): void => reject(new Error('No se pudo leer el archivo'));
      reader.readAsDataURL(file);
    });

    const contentType =
      file.type ||
      (file.name.toLowerCase().endsWith('.png') ? 'image/png' : 'application/octet-stream');
    const target = `assets/images/${file.name}`;
    setTargetPath(target);
    setFileName(file.name);

    const res = await fetchWithCredential('/api/v1/media/upload', {
      method: 'POST',
      body: JSON.stringify({
        data: base64,
        targetPath: target,
        content_type: contentType,
      }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError((body as { error?: { message?: string } }).error?.message ?? `Error ${res.status}`);
      return;
    }
    const body = (await res.json()) as {
      staged_file: string;
      sha256: string;
      size: number;
      content_type: string;
    };
    setUploadState(body);
    setFeedback(
      `Archivo ${file.name} inspeccionado y en staging (${Math.round(body.size / 1024)} KB)`
    );
  };

  const createIntent = async (type: string, extra: Record<string, unknown> = {}): Promise<void> => {
    setError(null);
    setFeedback(null);
    if (type === 'avif' || type === 'variant') {
      if (!uploadState || !targetPath || !productId) {
        setError('Sube un archivo, elige destino y producto');
        return;
      }
    }
    const res = await fetchWithCredential('/api/v1/media/intents', {
      method: 'POST',
      body: JSON.stringify({
        type,
        staged_file: uploadState?.staged_file,
        // Plan 089: OG intents target the category's canonical OG asset;
        // the shared upload-destination input does not apply to them.
        target_path:
          type === 'og' || type === 'og-delete'
            ? `assets/images/og/categories/${String(extra.category_slug ?? '')}.png`
            : targetPath,
        product_id: productId,
        ...extra,
      }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError((body as { error?: { message?: string } }).error?.message ?? `Error ${res.status}`);
      return;
    }
    setFeedback('Intent creado — ejecútalo para generar los derivados');
    setUploadState(null);
    setFileName(null);
    void load();
  };

  const intentAction = async (
    id: string,
    action: 'run' | 'cancel' | 'discard' | 'apply'
  ): Promise<void> => {
    setError(null);
    setFeedback(null);
    const method = action === 'discard' ? 'DELETE' : 'POST';
    const res = await fetchWithCredential(
      `/api/v1/media/intents/${id}/${action === 'discard' ? '' : action}`,
      {
        method,
        body: JSON.stringify({}),
      }
    );
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError((body as { error?: { message?: string } }).error?.message ?? `Error ${res.status}`);
      return;
    }
    setFeedback(
      `Intent ${action === 'apply' ? 'aplicado' : action === 'run' ? 'en ejecución' : action === 'discard' ? 'descartado' : 'cancelado'}`
    );
    if (action === 'run') {
      // Poll until terminal.
      const poll = async (): Promise<void> => {
        const r = await fetch('/api/v1/media');
        const d = (await r.json()) as { intents: MediaIntent[] };
        const current = d.intents.find((i) => i.id === id);
        if (current && ['succeeded', 'failed', 'cancelled'].includes(current.status)) {
          await load();
          return;
        }
        window.setTimeout(() => void poll(), 600);
      };
      void poll();
    } else {
      await load();
    }
  };

  const handleBatch = async (action: 'run' | 'cancel' | 'discard'): Promise<void> => {
    const ids = [...selectedIntents];
    if (ids.length === 0) return;
    setError(null);
    setFeedback(null);
    const res = await fetchWithCredential('/api/v1/media/intents/batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, ids }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError((body as { error?: { message?: string } }).error?.message ?? `Error ${res.status}`);
      return;
    }
    const body = (await res.json()) as {
      applied: number;
      skipped: Array<{ id: string; reason: string }>;
    };
    setFeedback(
      `Batch ${action}: ${body.applied} aplicados` +
        (body.skipped.length > 0 ? `, ${body.skipped.length} omitidos` : '') +
        ' ✓'
    );
    setSelectedIntents(new Set());
    await load();
  };

  const toggleIntent = (id: string, checked: boolean): void => {
    setSelectedIntents((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const statusCounts = (): Record<string, number> => {
    const counts: Record<string, number> = {};
    for (const intent of intents) {
      counts[intent.status] = (counts[intent.status] ?? 0) + 1;
    }
    return counts;
  };

  const filtered = filter === 'all' ? items : items.filter((i) => i.status === filter);

  return (
    <main role="main" aria-label="Medios">
      <h1>Medios y derivados ({summary.total ?? 0} archivos)</h1>

      {error && (
        <p role="alert" style={{ color: '#c62828' }}>
          {error}
        </p>
      )}
      {feedback && (
        <p role="status" style={{ color: '#2e7d32' }}>
          {feedback}
        </p>
      )}
      {loading && <p>Cargando…</p>}

      <section aria-label="Subir y crear intent" style={{ marginBottom: '1.5rem' }}>
        <h2>Ingesta y derivados</h2>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <label>
            Archivo:{' '}
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp,image/avif,image/gif"
              onChange={(e) => void handleFile(e.currentTarget.files?.[0])}
            />
          </label>
          {fileName && <span style={{ fontSize: '0.85rem', color: '#6c757d' }}>{fileName}</span>}
          <label>
            Destino:{' '}
            <input
              type="text"
              value={targetPath}
              onChange={(e) => setTargetPath(e.currentTarget.value)}
              style={{ width: '220px', padding: '0.25rem' }}
              aria-label="Ruta destino"
            />
          </label>
          <label>
            Producto:{' '}
            <select
              value={productId}
              onChange={(e) => setProductId(e.currentTarget.value)}
              aria-label="Producto destino"
            >
              <option value="">Elegir…</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Tipo:{' '}
            <select
              value={intentType}
              onChange={(e) => setIntentType(e.currentTarget.value as 'avif' | 'variant')}
              aria-label="Tipo de derivado"
            >
              <option value="avif">AVIF</option>
              <option value="variant">Variant 480</option>
            </select>
          </label>
          <button onClick={() => void createIntent(intentType)} disabled={loading}>
            Crear intent
          </button>
        </div>

        <div style={{ marginTop: '0.75rem' }}>
          <label>
            OG de categoría:{' '}
            <select
              value={ogCategory}
              onChange={(e) => setOgCategory(e.currentTarget.value)}
              aria-label="Categoría OG"
            >
              <option value="">Elegir…</option>
              {categories.map((c) => (
                <option key={c.key} value={c.slug ?? c.key}>
                  {c.key}
                </option>
              ))}
            </select>
          </label>{' '}
          <button
            onClick={() => void createIntent('og', { category_slug: ogCategory })}
            disabled={!ogCategory || loading}
          >
            Generar OG
          </button>{' '}
          <button
            onClick={() => void createIntent('og-delete', { category_slug: ogCategory })}
            disabled={!ogCategory || loading}
          >
            Eliminar OG
          </button>
        </div>
      </section>

      <section aria-label="Intents" style={{ marginBottom: '1.5rem' }}>
        <h2>Intents ({intents.length})</h2>
        {intents.length > 0 && (
          <p style={{ fontSize: '0.85rem', color: '#6c757d' }}>
            {Object.entries(statusCounts())
              .map(([status, count]) => `${status}: ${count}`)
              .join(' · ')}
          </p>
        )}
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem', flexWrap: 'wrap' }}>
          <span style={{ alignSelf: 'center', fontSize: '0.9rem' }}>
            {selectedIntents.size} seleccionados
          </span>
          <button onClick={() => void handleBatch('run')} disabled={selectedIntents.size === 0}>
            Ejecutar seleccionados
          </button>
          <button onClick={() => void handleBatch('cancel')} disabled={selectedIntents.size === 0}>
            Cancelar seleccionados
          </button>
          <button
            onClick={() => {
              if (
                window.confirm(
                  `¿Descartar ${selectedIntents.size} intents seleccionados? Solo se elimina staging.`
                )
              ) {
                void handleBatch('discard');
              }
            }}
            disabled={selectedIntents.size === 0}
          >
            Descartar seleccionados
          </button>
        </div>
        {intents.length === 0 && <p style={{ color: '#6c757d' }}>No hay intents.</p>}
        {intents.length > 0 && (
          <table
            aria-label="Intents de medios"
            style={{ width: '100%', borderCollapse: 'collapse' }}
          >
            <thead>
              <tr>
                <th style={{ textAlign: 'left', padding: '0.25rem 0.5rem' }}>
                  <input
                    type="checkbox"
                    aria-label="Seleccionar todos los intents"
                    checked={intents.length > 0 && selectedIntents.size === intents.length}
                    onChange={(e) => {
                      setSelectedIntents(
                        e.target.checked ? new Set(intents.map((i) => i.id)) : new Set()
                      );
                    }}
                  />
                </th>
                <th style={{ textAlign: 'left', padding: '0.25rem 0.5rem' }}>Intent</th>
                <th style={{ textAlign: 'left', padding: '0.25rem 0.5rem' }}>Tipo</th>
                <th style={{ textAlign: 'left', padding: '0.25rem 0.5rem' }}>Estado</th>
                <th style={{ textAlign: 'left', padding: '0.25rem 0.5rem' }}>Progreso</th>
                <th style={{ textAlign: 'left', padding: '0.25rem 0.5rem' }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {intents.map((intent) => (
                <tr key={intent.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                  <td style={{ padding: '0.25rem 0.5rem' }}>
                    <input
                      type="checkbox"
                      aria-label={`Seleccionar intent ${intent.id}`}
                      checked={selectedIntents.has(intent.id)}
                      onChange={(e) => toggleIntent(intent.id, e.target.checked)}
                    />
                  </td>
                  <td style={{ padding: '0.25rem 0.5rem' }}>
                    <code>{intent.id}</code>
                    <div style={{ fontSize: '0.8rem', color: '#6c757d' }}>
                      {intent.target_path ?? ''}
                    </div>
                    {intent.errors.length > 0 && (
                      <div style={{ fontSize: '0.8rem', color: '#c62828' }}>
                        {intent.errors.join('; ')}
                      </div>
                    )}
                  </td>
                  <td style={{ padding: '0.25rem 0.5rem' }}>{intent.type}</td>
                  <td style={{ padding: '0.25rem 0.5rem' }}>
                    {STATUS_LABEL[intent.status] ?? intent.status}
                  </td>
                  <td style={{ padding: '0.25rem 0.5rem' }}>
                    <progress max={100} value={intent.progress} style={{ width: '80px' }} />
                  </td>
                  <td style={{ padding: '0.25rem 0.5rem' }}>
                    {(intent.status === 'pending' ||
                      intent.status === 'failed' ||
                      intent.status === 'cancelled') && (
                      <button onClick={() => void intentAction(intent.id, 'run')}>Ejecutar</button>
                    )}{' '}
                    {intent.status === 'running' && (
                      <button onClick={() => void intentAction(intent.id, 'cancel')}>
                        Cancelar
                      </button>
                    )}{' '}
                    {intent.status === 'succeeded' && (
                      <button onClick={() => void intentAction(intent.id, 'apply')}>Aplicar</button>
                    )}{' '}
                    {intent.status !== 'running' && (
                      <button
                        onClick={() => {
                          if (
                            window.confirm(
                              `¿Descartar el intent ${intent.id}? Solo se elimina staging.`
                            )
                          ) {
                            void intentAction(intent.id, 'discard');
                          }
                        }}
                      >
                        Descartar
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section aria-label="Inventario">
        <h2>Inventario</h2>
        <label>
          Estado:{' '}
          <select value={filter} onChange={(e) => setFilter(e.currentTarget.value)}>
            <option value="all">Todos</option>
            <option value="active">Activos</option>
            <option value="orphan">Huérfanos</option>
            <option value="generated">Generados</option>
            <option value="staged">Staging</option>
            <option value="missing">Faltantes</option>
          </select>
        </label>
        <table
          aria-label="Inventario de medios"
          style={{ width: '100%', borderCollapse: 'collapse', marginTop: '0.5rem' }}
        >
          <thead>
            <tr>
              <th style={{ textAlign: 'left', padding: '0.25rem 0.5rem' }}>Archivo</th>
              <th style={{ textAlign: 'left', padding: '0.25rem 0.5rem' }}>Estado</th>
              <th style={{ textAlign: 'left', padding: '0.25rem 0.5rem' }}>Producto</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((entry) => (
              <tr key={entry.path} style={{ borderBottom: '1px solid var(--color-border)' }}>
                <td style={{ padding: '0.25rem 0.5rem' }}>
                  <code>{entry.path}</code>
                </td>
                <td style={{ padding: '0.25rem 0.5rem' }}>
                  {MEDIA_STATUS_LABEL[entry.status] ?? entry.status}
                </td>
                <td style={{ padding: '0.25rem 0.5rem' }}>{entry.productName ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}
