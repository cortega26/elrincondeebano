import { useState, useEffect, useMemo, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ContentManagerClient } from '../../api/client.ts';
import type { PaginatedResponse, ProductResponse } from '../../api/client.ts';
import type { CategoryRecord } from '../../../shared/schemas/category.ts';
import { fetchWithCredential } from '../credentialStore.ts';
import { buildUndoEntry, computeUndoActions } from './undo.ts';
import type { UndoEntry } from './undo.ts';

const client = new ContentManagerClient();

function getImageUrl(mediaPath: string): string {
  if (!mediaPath) return '';
  if (mediaPath.startsWith('assets/images/')) {
    return '/' + mediaPath;
  }
  return '/' + mediaPath;
}

interface BulkChange {
  product_id: string;
  name: string;
  field: string;
  old_value: number | boolean | string;
  new_value: number | boolean | string;
}

export function ProductsPage(): React.ReactElement {
  const [searchParams, setSearchParams] = useSearchParams();
  const [data, setData] = useState<PaginatedResponse<ProductResponse> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<ProductResponse | null>(null);
  const [editing, setEditing] = useState<ProductResponse | null>(null);
  const [creating, setCreating] = useState(false);
  const [bulkPreview, setBulkPreview] = useState<BulkChange[] | null>(null);
  const [bulkAction, setBulkAction] = useState<string>('set_discount_percent');
  const [bulkValue, setBulkValue] = useState<string>('10');
  const [feedback, setFeedback] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'table' | 'gallery'>('table');
  const [sortField, setSortField] = useState<string>('order');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [categories, setCategories] = useState<CategoryRecord[]>([]);
  const [syncStatus, setSyncStatus] = useState<{
    enabled: boolean;
    api_base: string;
    paused: boolean;
    token_configured: boolean;
    queue: { pending: number; error: number; total: number };
    last_push: { ok: boolean; error?: string } | null;
  } | null>(null);
  const [showSyncConfig, setShowSyncConfig] = useState(false);
  const [syncConfig, setSyncConfig] = useState({ enabled: true, api_base: '', api_token: '' });
  const undoStack = useRef<UndoEntry[]>([]);
  const dragIndex = useRef<number | null>(null);

  const q = searchParams.get('q') ?? '';
  const category = searchParams.get('category') ?? '';
  const archived = searchParams.get('archived') ?? '';
  const outOfStock = searchParams.get('out_of_stock') ?? '';
  const minPrice = searchParams.get('min_price') ?? '';
  const maxPrice = searchParams.get('max_price') ?? '';

  const load = async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const result = await client.getProducts({
        q: q || undefined,
        category: category || undefined,
        archived: archived === 'true' ? true : archived === 'false' ? false : undefined,
        out_of_stock: outOfStock === 'true' ? true : undefined,
        min_price: minPrice ? Number(minPrice) : undefined,
        max_price: maxPrice ? Number(maxPrice) : undefined,
      });
      setData(result);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [q, category, archived, outOfStock, minPrice, maxPrice]);

  useEffect(() => {
    fetch('/api/v1/sync/status')
      .then((r) => r.json())
      .then((d) => {
        const s = d.sync as {
          enabled: boolean;
          api_base: string;
          poll_interval: number;
          pull_interval: number;
          paused: boolean;
          token_configured: boolean;
          queue: { pending: number; error: number; total: number };
          last_push: { ok: boolean; error?: string } | null;
        };
        setSyncStatus(s);
        setSyncConfig({
          enabled: s.enabled,
          api_base: s.api_base ?? '',
          api_token: '',
        });
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    client
      .getCategories()
      .then((res) => setCategories(res.categories))
      .catch(() => {});
  }, []);

  const sortedItems = useMemo(() => {
    if (!data) return [] as ProductResponse[];
    const items = [...data.items].sort((a, b) => {
      let cmp: number;
      switch (sortField) {
        case 'name':
          cmp = (a.name ?? '').localeCompare(b.name ?? '', 'es-CL');
          break;
        case 'category':
          cmp = (a.category ?? '').localeCompare(b.category ?? '', 'es-CL');
          break;
        case 'price':
          cmp = a.price - b.price;
          break;
        case 'discount':
          cmp = a.discount - b.discount;
          break;
        case 'order':
        default:
          cmp = a.order - b.order;
          break;
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return items;
  }, [data, sortField, sortDir]);

  function setParam(key: string, value: string): void {
    const next = new URLSearchParams(searchParams);
    if (value) {
      next.set(key, value);
    } else {
      next.delete(key);
    }
    setSearchParams(next);
  }

  function handleSort(field: string): void {
    if (sortField === field) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('asc');
    }
  }

  async function handleSave(changes: Record<string, unknown>): Promise<void> {
    if (!editing) return;
    try {
      await client.updateProduct(editing.id!, editing.rev, changes);
      setEditing(null);
      setSelected(null);
      setFeedback('Producto actualizado ✓');
      await load();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function handleCreate(form: Record<string, unknown>): Promise<void> {
    try {
      await client.createProduct({
        name: String(form.name ?? ''),
        price: Number(form.price ?? 0),
        description: String(form.description ?? ''),
        discount: Number(form.discount ?? 0),
        stock: Boolean(form.stock),
        category: String(form.category ?? ''),
        image_path: String(form.image_path ?? ''),
        image_avif_path: String(form.image_avif_path ?? ''),
      });
      setCreating(false);
      setFeedback('Producto creado ✓');
      await load();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function handleDuplicate(product: ProductResponse): Promise<void> {
    const suggested = `${product.name ?? 'Producto'} (copia)`;
    const name = window.prompt('Nombre de la copia:', suggested)?.trim();
    if (!name) return;
    try {
      await client.createProduct({
        name,
        price: product.price,
        description: product.description ?? '',
        discount: product.discount ?? 0,
        stock: Boolean(product.stock),
        category: product.category ?? '',
        image_path: product.image_path ?? '',
        image_avif_path: product.image_avif_path ?? '',
      });
      setFeedback(`Duplicado creado: ${name} ✓`);
      await load();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function handleArchive(id: string, rev: number): Promise<void> {
    const product = data?.items.find((p) => p.id === id);
    if (!window.confirm(`¿Archivar ${product?.name ?? 'producto'}?`)) return;
    try {
      await client.updateProduct(id, rev, { is_archived: true });
      setSelected(null);
      setFeedback('Producto archivado ✓');
      await load();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function handleRestore(id: string, rev: number): Promise<void> {
    const product = data?.items.find((p) => p.id === id);
    if (!window.confirm(`¿Restaurar ${product?.name ?? 'producto'}?`)) return;
    try {
      await client.updateProduct(id, rev, { is_archived: false });
      setSelected(null);
      setFeedback('Producto restaurado ✓');
      await load();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function handleBulkPreview(): Promise<void> {
    if (!data) return;
    const ids = data.items.filter((p) => p.id).map((p) => p.id!);
    if (ids.length === 0) return;
    try {
      const val =
        bulkAction === 'set_stock'
          ? bulkValue === 'true'
          : bulkAction === 'set_category'
            ? bulkValue
            : Number(bulkValue);
      const result = await client.bulkPreview(bulkAction, val, ids);
      setBulkPreview(result.changes);
      setFeedback(`Vista previa: ${result.changes.length} cambios`);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function handleBulkApply(): Promise<void> {
    if (!data) return;
    const ids = data.items.filter((p) => p.id).map((p) => p.id!);
    if (ids.length === 0) return;
    try {
      const val =
        bulkAction === 'set_stock'
          ? bulkValue === 'true'
          : bulkAction === 'set_category'
            ? bulkValue
            : Number(bulkValue);

      const snapshotProducts = data.items
        .filter((p): p is ProductResponse & { id: string } => Boolean(p.id))
        .map((p) => ({
          id: p.id,
          price: p.price,
          discount: p.discount,
          stock: p.stock,
          category: p.category,
        }));
      const entry = buildUndoEntry({
        action: bulkAction,
        value: val,
        productIds: ids,
        products: snapshotProducts,
        preview: bulkPreview,
      });
      undoStack.current.push(entry);

      const result = await client.bulkApply(bulkAction, val, ids);
      setBulkPreview(null);
      setFeedback(`Aplicado: ${result.changed} productos modificados ✓`);
      await load();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function handleReorder(): Promise<void> {
    if (!data) return;
    const ids = data.items.filter((p) => p.id).map((p) => p.id!);
    if (ids.length === 0) return;
    try {
      await client.reorderProducts(ids);
      setFeedback('Productos reordenados ✓');
      await load();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function handleUndo(): Promise<void> {
    const entry = undoStack.current.pop();
    if (!entry || entry.perProductOldValues.length === 0) return;

    try {
      // Fetch fresh revisions right before undoing — data.items may already be
      // stale (a prior undo item in this same entry, or the apply itself).
      const currentProducts = await Promise.all(
        entry.perProductOldValues.map(async (item) => {
          const product = await client.getProduct(item.product_id);
          return { id: item.product_id, rev: product.rev ?? 0 };
        })
      );
      const actions = computeUndoActions(entry, currentProducts);
      for (const action of actions) {
        await client.updateProduct(action.id, action.rev, action.patch);
      }
      setFeedback('Operación deshecha ✓');
      await load();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  function handleDragStart(e: React.DragEvent<HTMLTableRowElement>, index: number): void {
    dragIndex.current = index;
    e.dataTransfer.effectAllowed = 'move';
  }

  function handleDragOver(e: React.DragEvent<HTMLTableRowElement>): void {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }

  function handleDrop(e: React.DragEvent<HTMLTableRowElement>, dropIndex: number): void {
    e.preventDefault();
    if (dragIndex.current === null || dragIndex.current === dropIndex || !data) return;

    const items = [...data.items];
    const [draggedItem] = items.splice(dragIndex.current, 1);
    items.splice(dropIndex, 0, draggedItem);

    setData({ ...data, items });
    dragIndex.current = null;

    const ids = items.filter((p) => p.id).map((p) => p.id!);
    client
      .reorderProducts(ids)
      .then(() => {
        setFeedback('Productos reordenados ✓');
        void load();
      })
      .catch((err) => {
        setError((err as Error).message);
      });
  }

  if (error) {
    return (
      <main role="main" aria-label="Productos">
        <h1>Productos</h1>
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
    <main role="main" aria-label="Productos">
      <h1>Productos{data ? ` (${data.total})` : ''}</h1>

      {syncStatus && (
        <div
          style={{
            background: '#e3f2fd',
            padding: '0.35rem 0.5rem',
            marginBottom: '0.5rem',
            borderRadius: 'var(--radius)',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            fontSize: '0.85rem',
            flexWrap: 'wrap',
          }}
        >
          <span>
            Sync: {syncStatus.enabled ? 'Conectado' : 'Desactivado'} —{' '}
            {syncStatus.api_base || 'No configurado'}
            {syncStatus.enabled && (
              <>
                {' '}
                · cola {syncStatus.queue.pending} pend / {syncStatus.queue.error} err /{' '}
                {syncStatus.queue.total} total
                {syncStatus.paused ? ' · PAUSADO' : ''}
                {syncStatus.last_push?.ok === false && (
                  <span style={{ color: '#c62828' }}> · push falló</span>
                )}
              </>
            )}
          </span>
          <button
            onClick={() => {
              setShowSyncConfig(!showSyncConfig);
            }}
            style={{ padding: '0.15rem 0.5rem', fontSize: '0.8rem' }}
          >
            Configurar
          </button>
          {syncStatus.enabled && (
            <>
              <button
                onClick={() => {
                  const action = syncStatus.paused ? 'resume' : 'pause';
                  fetchWithCredential(`/api/v1/sync/${action}`, { method: 'POST' })
                    .then(() => window.location.reload())
                    .catch(() => setFeedback('Error al cambiar pausa'));
                }}
                style={{ padding: '0.15rem 0.5rem', fontSize: '0.8rem' }}
              >
                {syncStatus.paused ? 'Reanudar' : 'Pausar'}
              </button>
              <button
                onClick={() => {
                  fetchWithCredential('/api/v1/sync/now', { method: 'POST' })
                    .then((r) => r.json())
                    .then((d) =>
                      setFeedback((d as { message?: string }).message ?? 'Sync solicitado')
                    )
                    .catch(() => setFeedback('Error al sincronizar'));
                }}
                style={{ padding: '0.15rem 0.5rem', fontSize: '0.8rem' }}
              >
                Sincronizar ahora
              </button>
            </>
          )}
          {showSyncConfig && (
            <div
              style={{
                display: 'flex',
                gap: '0.5rem',
                alignItems: 'center',
                flexBasis: '100%',
                marginTop: '0.25rem',
              }}
            >
              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.25rem',
                  fontSize: '0.8rem',
                }}
              >
                <input
                  type="checkbox"
                  checked={syncConfig.enabled}
                  onChange={(e) => setSyncConfig({ ...syncConfig, enabled: e.target.checked })}
                />
                Habilitado
              </label>
              <input
                type="text"
                value={syncConfig.api_base}
                onChange={(e) => setSyncConfig({ ...syncConfig, api_base: e.target.value })}
                placeholder="api_base"
                style={{ padding: '0.15rem 0.25rem', fontSize: '0.8rem', width: '150px' }}
              />
              <span style={{ fontSize: '0.75rem', color: '#6c757d' }}>
                Token: {syncStatus.token_configured ? 'configurado (env)' : 'falta SYNC_API_TOKEN'}
              </span>
              <button
                onClick={async () => {
                  try {
                    // The token is never sent over the API (plan 057/064):
                    // it comes only from SYNC_API_TOKEN.
                    const { api_token: _ignored, ...configBody } = syncConfig;
                    void _ignored;
                    const res = await fetchWithCredential('/api/v1/sync/config', {
                      method: 'PUT',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify(configBody),
                    });
                    if (!res.ok) {
                      const err = await res.json().catch(() => ({}));
                      throw new Error(
                        (err as { error?: { message?: string } }).error?.message ??
                          `HTTP ${res.status}`
                      );
                    }
                    await res.json();
                    setShowSyncConfig(false);
                    setFeedback('Configuración de sync guardada ✓');
                    window.setTimeout(() => window.location.reload(), 300);
                  } catch (err) {
                    setError((err as Error).message);
                  }
                }}
                style={{ padding: '0.15rem 0.5rem', fontSize: '0.8rem' }}
              >
                Guardar
              </button>
              <button
                onClick={() => setShowSyncConfig(false)}
                style={{ padding: '0.15rem 0.5rem', fontSize: '0.8rem' }}
              >
                Cerrar
              </button>
            </div>
          )}
        </div>
      )}

      {/* Feedback */}
      {feedback && (
        <div
          role="status"
          aria-live="polite"
          style={{
            background: '#e8f5e9',
            padding: '0.5rem',
            marginBottom: '0.5rem',
            borderRadius: 'var(--radius)',
          }}
        >
          {feedback}
          <button
            onClick={() => setFeedback(null)}
            style={{ marginLeft: '0.5rem', background: 'none', border: 'none', cursor: 'pointer' }}
            aria-label="Cerrar"
          >
            ×
          </button>
        </div>
      )}

      {/* Filters */}
      <nav
        aria-label="Filtros"
        style={{
          display: 'flex',
          gap: '0.5rem',
          marginBottom: '1rem',
          flexWrap: 'wrap',
          alignItems: 'center',
        }}
      >
        <label>
          Buscar:{' '}
          <input
            type="search"
            value={q}
            onChange={(e) => setParam('q', e.target.value)}
            placeholder="Nombre, descripción…"
            style={{ padding: '0.25rem 0.5rem', width: '200px' }}
          />
        </label>
        <label>
          Precio min:{' '}
          <input
            type="number"
            min="0"
            value={minPrice}
            onChange={(e) => setParam('min_price', e.target.value)}
            placeholder="0"
            style={{ padding: '0.25rem 0.5rem', width: '90px' }}
          />
        </label>
        <label>
          Precio max:{' '}
          <input
            type="number"
            min="0"
            value={maxPrice}
            onChange={(e) => setParam('max_price', e.target.value)}
            placeholder="∞"
            style={{ padding: '0.25rem 0.5rem', width: '90px' }}
          />
        </label>
        <label>
          Categoría:{' '}
          <select
            value={category}
            onChange={(e) => setParam('category', e.target.value)}
            style={{ padding: '0.25rem 0.5rem', minWidth: '140px' }}
          >
            <option value="">Todas</option>
            {categories.map((c) => (
              <option key={c.key} value={c.key}>
                {c.display_name?.default ?? c.key}
              </option>
            ))}
          </select>
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
          <input
            type="checkbox"
            checked={outOfStock === 'true'}
            onChange={(e) => setParam('out_of_stock', e.target.checked ? 'true' : '')}
          />
          Sin stock
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
          <select
            value={archived}
            onChange={(e) => setParam('archived', e.target.value)}
            style={{ padding: '0.25rem' }}
          >
            <option value="">Todos</option>
            <option value="false">Activos</option>
            <option value="true">Archivados</option>
          </select>
        </label>
        <button
          onClick={() => {
            fetch('/api/v1/products')
              .then((r) => r.json())
              .then((d) => setFeedback(`Sanity check: ${d.total} productos, sin errores`))
              .catch(() => setFeedback('Error al validar'));
          }}
          style={{ padding: '0.25rem 0.75rem' }}
        >
          ✓ Validar
        </button>
        <button
          onClick={() => setCreating(true)}
          style={{ padding: '0.25rem 0.75rem', marginLeft: 'auto' }}
        >
          + Nuevo
        </button>
        <button
          onClick={() => setViewMode(viewMode === 'table' ? 'gallery' : 'table')}
          style={{ padding: '0.25rem 0.75rem' }}
          aria-label={viewMode === 'table' ? 'Vista galería' : 'Vista tabla'}
        >
          {viewMode === 'table' ? '🖼️' : '📋'}
        </button>
      </nav>

      {/* Bulk operations */}
      <div
        style={{
          display: 'flex',
          gap: '0.5rem',
          marginBottom: '1rem',
          alignItems: 'center',
          flexWrap: 'wrap',
        }}
      >
        <select
          value={bulkAction}
          onChange={(e) => setBulkAction(e.target.value)}
          style={{ padding: '0.25rem' }}
          aria-label="Acción masiva"
        >
          <option value="set_discount_percent">Dto. %</option>
          <option value="set_discount_fixed">Dto. fijo</option>
          <option value="set_price_delta_percent">Precio ±%</option>
          <option value="set_stock">Stock ON/OFF</option>
          <option value="set_category">Categoría</option>
        </select>
        {bulkAction === 'set_stock' ? (
          <select
            value={bulkValue}
            onChange={(e) => setBulkValue(e.target.value)}
            style={{ padding: '0.25rem' }}
          >
            <option value="true">Con stock</option>
            <option value="false">Sin stock</option>
          </select>
        ) : (
          <input
            type={bulkAction === 'set_category' ? 'text' : 'number'}
            value={bulkValue}
            onChange={(e) => setBulkValue(e.target.value)}
            placeholder={bulkAction === 'set_category' ? 'categoría' : 'valor'}
            style={{ padding: '0.25rem 0.5rem', width: '100px' }}
          />
        )}
        <button onClick={() => void handleBulkPreview()} style={{ padding: '0.25rem 0.75rem' }}>
          Vista previa
        </button>
        <button onClick={() => void handleBulkApply()} style={{ padding: '0.25rem 0.75rem' }}>
          Aplicar
        </button>
        <button
          onClick={() => void handleReorder()}
          style={{ padding: '0.25rem 0.75rem', marginLeft: 'auto' }}
          title="Reordenar por orden actual"
        >
          ⇅ Reordenar
        </button>
        {undoStack.current.length > 0 && (
          <button
            onClick={() => void handleUndo()}
            style={{ padding: '0.25rem 0.75rem' }}
            title="Deshacer última operación masiva"
          >
            ↩ Deshacer
          </button>
        )}
      </div>

      {/* Bulk preview results */}
      {bulkPreview && bulkPreview.length > 0 && (
        <div
          style={{
            background: '#fff3e0',
            padding: '0.5rem',
            marginBottom: '0.5rem',
            borderRadius: 'var(--radius)',
            maxHeight: '200px',
            overflowY: 'auto',
          }}
        >
          <strong>Cambios ({bulkPreview.length}):</strong>
          <table style={{ width: '100%', fontSize: '0.85rem' }}>
            <thead>
              <tr>
                <th>Producto</th>
                <th>Campo</th>
                <th>Actual</th>
                <th>Nuevo</th>
              </tr>
            </thead>
            <tbody>
              {bulkPreview.map((c, i) => (
                <tr key={`${c.product_id}-${i}`}>
                  <td>{c.name}</td>
                  <td>{c.field}</td>
                  <td>{String(c.old_value)}</td>
                  <td style={{ fontWeight: 'bold' }}>{String(c.new_value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Loading */}
      {loading && <p aria-live="polite">Cargando…</p>}

      {/* Empty */}
      {!loading && data && data.items.length === 0 && <p>No se encontraron productos.</p>}

      {/* Table or Gallery */}
      {viewMode === 'table' && data && data.items.length > 0 && (
        <table
          aria-label="Lista de productos"
          style={{ width: '100%', borderCollapse: 'collapse' }}
        >
          <thead>
            <tr>
              <th
                scope="col"
                style={{
                  textAlign: 'left',
                  padding: '0.25rem 0.5rem',
                  cursor: 'pointer',
                  userSelect: 'none',
                }}
                onClick={() => handleSort('name')}
              >
                Nombre{sortField === 'name' ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ''}
              </th>
              <th scope="col" style={{ textAlign: 'left', padding: '0.25rem 0.5rem' }}>
                Descripción
              </th>
              <th
                scope="col"
                style={{
                  textAlign: 'left',
                  padding: '0.25rem 0.5rem',
                  cursor: 'pointer',
                  userSelect: 'none',
                }}
                onClick={() => handleSort('category')}
              >
                Cat.{sortField === 'category' ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ''}
              </th>
              <th
                scope="col"
                style={{
                  textAlign: 'right',
                  padding: '0.25rem 0.5rem',
                  cursor: 'pointer',
                  userSelect: 'none',
                }}
                onClick={() => handleSort('price')}
              >
                Precio{sortField === 'price' ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ''}
              </th>
              <th
                scope="col"
                style={{
                  textAlign: 'right',
                  padding: '0.25rem 0.5rem',
                  cursor: 'pointer',
                  userSelect: 'none',
                }}
                onClick={() => handleSort('discount')}
              >
                Dto.{sortField === 'discount' ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ''}
              </th>
              <th scope="col" style={{ textAlign: 'center', padding: '0.25rem 0.5rem' }}>
                Stock
              </th>
              <th scope="col" style={{ padding: '0.25rem 0.5rem' }}>
                Acciones
              </th>
            </tr>
          </thead>
          <tbody>
            {sortedItems.map((product, idx) => (
              <tr
                key={product.id ?? product.sku ?? product.name}
                style={{
                  background: product.is_archived
                    ? '#f5f5f5'
                    : selected?.id === product.id
                      ? '#e3f2fd'
                      : 'transparent',
                  cursor: 'pointer',
                }}
                onClick={() => {
                  setSelected(product);
                  setEditing(null);
                  setBulkPreview(null);
                }}
                onDoubleClick={() => {
                  setEditing(product);
                  setSelected(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    setSelected(product);
                    setEditing(null);
                    setBulkPreview(null);
                  }
                }}
                tabIndex={0}
                role="row"
                draggable
                aria-grabbed="false"
                onDragStart={(e) => handleDragStart(e, idx)}
                onDragOver={handleDragOver}
                onDrop={(e) => handleDrop(e, idx)}
              >
                <td style={{ padding: '0.25rem 0.5rem' }}>
                  {product.name}
                  {product.is_archived ? ' (arch.)' : ''}
                </td>
                <td
                  style={{
                    padding: '0.25rem 0.5rem',
                    maxWidth: '200px',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {product.description || '—'}
                </td>
                <td style={{ padding: '0.25rem 0.5rem' }}>{product.category || '—'}</td>
                <td style={{ padding: '0.25rem 0.5rem', textAlign: 'right' }}>
                  ${product.price.toLocaleString('es-CL')}
                </td>
                <td style={{ padding: '0.25rem 0.5rem', textAlign: 'right' }}>
                  {product.discount > 0 ? `${product.discount_percentage}%` : '—'}
                </td>
                <td style={{ padding: '0.25rem 0.5rem', textAlign: 'center' }}>
                  {product.stock ? '✓' : '✗'}
                </td>
                <td style={{ padding: '0.25rem 0.5rem', whiteSpace: 'nowrap' }}>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditing(product);
                    }}
                    style={{ padding: '0.1rem 0.4rem', fontSize: '0.85rem' }}
                    aria-label={`Editar ${product.name}`}
                  >
                    Editar
                  </button>{' '}
                  {product.is_archived ? (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        void handleRestore(product.id!, product.rev);
                      }}
                      style={{ padding: '0.1rem 0.4rem', fontSize: '0.85rem' }}
                      aria-label={`Restaurar ${product.name}`}
                    >
                      Rest.
                    </button>
                  ) : (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        void handleArchive(product.id!, product.rev);
                      }}
                      style={{ padding: '0.1rem 0.4rem', fontSize: '0.85rem' }}
                      aria-label={`Archivar ${product.name}`}
                    >
                      Arch.
                    </button>
                  )}{' '}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      void handleDuplicate(product);
                    }}
                    style={{ padding: '0.1rem 0.4rem', fontSize: '0.85rem' }}
                    aria-label={`Duplicar ${product.name}`}
                  >
                    Dup.
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* Gallery view */}
      {viewMode === 'gallery' && data && data.items.length > 0 && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
            gap: '0.75rem',
          }}
        >
          {sortedItems.map((product) => (
            <div
              key={product.id ?? product.sku ?? product.name}
              onClick={() => {
                setSelected(product);
                setEditing(null);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  setSelected(product);
                  setEditing(null);
                }
              }}
              tabIndex={0}
              role="button"
              aria-label={`${product.name} — $${product.price}`}
              style={{
                border:
                  selected?.id === product.id
                    ? '2px solid var(--color-primary)'
                    : '1px solid var(--color-border)',
                borderRadius: 'var(--radius)',
                padding: '0.75rem',
                cursor: 'pointer',
                background: product.is_archived ? '#f5f5f5' : 'white',
              }}
            >
              {product.image_path ? (
                <img
                  src={getImageUrl(product.image_path)}
                  alt={product.name}
                  style={{
                    width: '100%',
                    height: '120px',
                    objectFit: 'cover',
                    borderRadius: 'var(--radius)',
                  }}
                />
              ) : (
                <div
                  style={{
                    width: '100%',
                    height: '120px',
                    background: '#eee',
                    borderRadius: 'var(--radius)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#999',
                  }}
                >
                  Sin imagen
                </div>
              )}
              <h3 style={{ margin: '0 0 0.25rem', fontSize: '0.95rem' }}>{product.name}</h3>
              <p style={{ margin: '0.25rem 0', fontSize: '1.1rem', fontWeight: 'bold' }}>
                ${product.price.toLocaleString('es-CL')}
              </p>
              {product.discount > 0 && (
                <span
                  style={{
                    background: '#c8e6c9',
                    padding: '0.1rem 0.3rem',
                    borderRadius: '3px',
                    fontSize: '0.8rem',
                  }}
                >
                  -{product.discount_percentage}%
                </span>
              )}
              <div style={{ marginTop: '0.5rem', fontSize: '0.8rem', color: '#6c757d' }}>
                {product.category || 'Sin categoría'} · {product.stock ? '✓ Stock' : '✗ Agotado'}
                {product.is_archived ? ' · Archivado' : ''}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Inspector panel */}
      {selected && !editing && (
        <aside
          aria-label={`Detalle: ${selected.name}`}
          style={{
            marginTop: '1rem',
            padding: '1rem',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius)',
          }}
        >
          <h2>{selected.name}</h2>
          <dl style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: '0.25rem 0.5rem' }}>
            <dt>ID:</dt>
            <dd>
              <code>{selected.id}</code>
            </dd>
            <dt>Descripción:</dt>
            <dd>{selected.description || '—'}</dd>
            <dt>Precio:</dt>
            <dd>${selected.price.toLocaleString('es-CL')}</dd>
            <dt>Descuento:</dt>
            <dd>
              ${selected.discount.toLocaleString('es-CL')} ({selected.discount_percentage}%)
            </dd>
            <dt>Precio final:</dt>
            <dd>${selected.discounted_price.toLocaleString('es-CL')}</dd>
            <dt>Stock:</dt>
            <dd>{selected.stock ? 'Disponible' : 'Agotado'}</dd>
            <dt>Categoría:</dt>
            <dd>{selected.category || '—'}</dd>
            <dt>Imagen:</dt>
            <dd>{selected.image_path || '—'}</dd>
            <dt>AVIF:</dt>
            <dd>{selected.image_avif_path || '—'}</dd>
            <dt>Orden:</dt>
            <dd>{selected.order}</dd>
            <dt>Rev:</dt>
            <dd>{selected.rev}</dd>
            <dt>Archivado:</dt>
            <dd>{selected.is_archived ? 'Sí' : 'No'}</dd>
          </dl>
          {selected.image_path && (
            <div style={{ marginTop: '0.5rem' }}>
              <img
                src={getImageUrl(selected.image_path)}
                alt={selected.name}
                style={{
                  width: '100%',
                  maxHeight: '200px',
                  objectFit: 'contain',
                  borderRadius: 'var(--radius)',
                }}
              />
              {selected.image_avif_path && (
                <div style={{ marginTop: '0.25rem', fontSize: '0.8rem', color: '#6c757d' }}>
                  AVIF:{' '}
                  <img
                    src={getImageUrl(selected.image_avif_path)}
                    alt={selected.name + ' (AVIF)'}
                    style={{
                      width: '60px',
                      height: '60px',
                      objectFit: 'cover',
                      borderRadius: '3px',
                      verticalAlign: 'middle',
                      marginLeft: '0.25rem',
                    }}
                  />
                </div>
              )}
            </div>
          )}
          <div style={{ marginTop: '0.5rem', display: 'flex', gap: '0.5rem' }}>
            <button onClick={() => setEditing(selected)}>Editar</button>
            <button onClick={() => setSelected(null)}>Cerrar</button>
          </div>
        </aside>
      )}

      {/* Edit form */}
      {editing && (
        <ProductForm product={editing} onSave={handleSave} onCancel={() => setEditing(null)} />
      )}

      {/* Create form */}
      {creating && <ProductForm onSave={handleCreate} onCancel={() => setCreating(false)} />}
    </main>
  );
}

function ProductForm({
  product,
  onSave,
  onCancel,
}: {
  product?: ProductResponse;
  onSave: (data: Record<string, unknown>) => Promise<void>;
  onCancel: () => void;
}): React.ReactElement {
  const [name, setName] = useState(product?.name ?? '');
  const [price, setPrice] = useState(String(product?.price ?? ''));
  const [description, setDescription] = useState(product?.description ?? '');
  const [stock, setStock] = useState(product?.stock ?? false);
  const [category, setCategory] = useState(product?.category ?? '');
  const [discount, setDiscount] = useState(String(product?.discount ?? '0'));
  const [imagePath, setImagePath] = useState(product?.image_path ?? '');
  const [imageAvifPath, setImageAvifPath] = useState(product?.image_avif_path ?? '');
  const [saving, setSaving] = useState(false);
  const [categories, setCategories] = useState<CategoryRecord[]>([]);
  const [mediaItems, setMediaItems] = useState<
    Array<{ path: string; name: string; status: string; productName?: string }>
  >([]);
  const [imageSearch, setImageSearch] = useState('');
  const [showImagePicker, setShowImagePicker] = useState(false);

  useEffect(() => {
    client
      .getCategories()
      .then((res) => {
        setCategories(res.categories);
        // New products must always start with a real category — there is no
        // "Sin categoría" option, so default to the first one available.
        if (!product && res.categories.length > 0) {
          setCategory((current) => current || res.categories[0].key);
        }
      })
      .catch(() => {});
  }, [product]);

  useEffect(() => {
    fetch('/api/v1/media')
      .then((r) => r.json())
      .then((d) =>
        setMediaItems(
          (d.items as Array<{ path: string; name: string; status: string; productName?: string }>)
            .filter((item) => item.status === 'active' || item.status === 'orphan')
            .sort((a, b) => a.name.localeCompare(b.name, 'es-CL'))
        )
      )
      .catch(() => {});
  }, [showImagePicker]);

  async function handleSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setSaving(true);
    try {
      const changes: Record<string, unknown> = {};
      if (!product) {
        changes.name = name;
        changes.price = Number(price);
        changes.description = description;
        changes.stock = stock;
        changes.category = category;
        changes.discount = Number(discount);
        if (imagePath) changes.image_path = imagePath;
        if (imageAvifPath) changes.image_avif_path = imageAvifPath;
      } else {
        if (name !== product.name) changes.name = name;
        if (Number(price) !== product.price) changes.price = Number(price);
        if (description !== product.description) changes.description = description;
        if (stock !== product.stock) changes.stock = stock;
        if (category !== product.category) changes.category = category;
        if (Number(discount) !== product.discount) changes.discount = Number(discount);
        if (imagePath !== (product.image_path ?? '')) changes.image_path = imagePath;
        if (imageAvifPath !== (product.image_avif_path ?? ''))
          changes.image_avif_path = imageAvifPath;
      }
      await onSave(changes);
    } finally {
      setSaving(false);
    }
  }

  const filteredImages = (() => {
    let items = mediaItems;
    if (imageSearch) {
      const q = imageSearch.toLowerCase();
      items = items.filter((i) => i.name.toLowerCase().includes(q));
    }
    return items;
  })();

  return (
    <form
      onSubmit={(e) => {
        void handleSubmit(e);
      }}
      style={{
        marginTop: '1rem',
        padding: '1rem',
        border: '2px solid var(--color-primary)',
        borderRadius: 'var(--radius)',
      }}
    >
      <h2>{product ? `Editar: ${product.name}` : 'Nuevo producto'}</h2>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '0.5rem',
          marginTop: '0.5rem',
        }}
      >
        <label>
          Nombre *<br />
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            style={{ width: '100%', padding: '0.25rem' }}
          />
        </label>
        <label>
          Precio *<br />
          <input
            required
            type="number"
            min="1"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            style={{ width: '100%', padding: '0.25rem' }}
          />
        </label>
        <label style={{ gridColumn: 'span 2' }}>
          Descripción
          <br />
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            style={{ width: '100%', padding: '0.25rem' }}
          />
        </label>
        <label>
          Categoría *<br />
          {categories.length > 0 ? (
            <select
              required
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              style={{ width: '100%', padding: '0.25rem' }}
            >
              {categories.map((c) => (
                <option key={c.id} value={c.key}>
                  {c.display_name?.default ?? c.key}
                </option>
              ))}
            </select>
          ) : (
            <input
              required
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              style={{ width: '100%', padding: '0.25rem' }}
            />
          )}
        </label>
        <label>
          Descuento
          <br />
          <input
            type="number"
            min="0"
            value={discount}
            onChange={(e) => setDiscount(e.target.value)}
            style={{ width: '100%', padding: '0.25rem' }}
          />
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
          <input type="checkbox" checked={stock} onChange={(e) => setStock(e.target.checked)} />
          Stock disponible
        </label>
      </div>

      <div style={{ marginTop: '0.75rem' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <strong>Imagen:</strong>
          <input
            type="text"
            value={imagePath}
            onChange={(e) => setImagePath(e.target.value)}
            placeholder="assets/images/…"
            style={{ flex: 1, padding: '0.25rem', fontSize: '0.85rem' }}
          />
          <button
            type="button"
            onClick={() => setShowImagePicker(!showImagePicker)}
            style={{ padding: '0.25rem 0.5rem', fontSize: '0.8rem' }}
          >
            {showImagePicker ? 'Ocultar' : 'Explorar'}
          </button>
        </label>
        <label
          style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.5rem' }}
        >
          <strong>Imagen AVIF:</strong>
          <input
            type="text"
            value={imageAvifPath}
            onChange={(e) => setImageAvifPath(e.target.value)}
            placeholder="assets/images/… (avif)"
            style={{ flex: 1, padding: '0.25rem', fontSize: '0.85rem' }}
          />
        </label>

        {imagePath && (
          <div style={{ marginTop: '0.25rem' }}>
            <img
              src={getImageUrl(imagePath)}
              alt="Previsualización"
              style={{
                maxWidth: '200px',
                maxHeight: '100px',
                objectFit: 'contain',
                borderRadius: '3px',
                border: '1px solid var(--color-border)',
              }}
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = 'none';
              }}
            />
          </div>
        )}

        {showImagePicker && (
          <div
            style={{
              marginTop: '0.5rem',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius)',
              padding: '0.5rem',
              maxHeight: '250px',
              overflowY: 'auto',
            }}
          >
            <input
              type="search"
              value={imageSearch}
              onChange={(e) => setImageSearch(e.target.value)}
              placeholder="Buscar imagen…"
              style={{
                width: '100%',
                padding: '0.25rem',
                marginBottom: '0.5rem',
                fontSize: '0.85rem',
              }}
            />
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(40px, 1fr))',
                gap: '4px',
              }}
            >
              {filteredImages.map((item) => {
                const fullPath = `assets/images/${item.path}`;
                return (
                  <button
                    key={item.path}
                    type="button"
                    onClick={() => {
                      setImagePath(fullPath);
                    }}
                    title={item.path}
                    style={{
                      border:
                        imagePath === fullPath
                          ? '2px solid var(--color-primary)'
                          : '1px solid #ddd',
                      padding: 0,
                      cursor: 'pointer',
                      borderRadius: '3px',
                      overflow: 'hidden',
                      width: '40px',
                      height: '40px',
                      background: '#f0f0f0',
                    }}
                  >
                    <img
                      src={getImageUrl(fullPath)}
                      alt={item.name}
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      loading="lazy"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = 'none';
                      }}
                    />
                  </button>
                );
              })}
            </div>
            {filteredImages.length === 0 && (
              <p style={{ fontSize: '0.8rem', color: '#6c757d' }}>
                No se encontraron imágenes{imageSearch ? ` para "${imageSearch}"` : ''}.
              </p>
            )}
          </div>
        )}
      </div>

      {product && !showImagePicker && (
        <div style={{ marginTop: '0.5rem' }}>
          <strong>Imagen actual:</strong>{' '}
          {product.image_path ? (
            <img
              src={getImageUrl(product.image_path)}
              alt={product.name}
              style={{
                maxWidth: '200px',
                maxHeight: '120px',
                objectFit: 'contain',
                display: 'block',
                marginTop: '0.25rem',
              }}
            />
          ) : (
            <span>Sin imagen</span>
          )}
        </div>
      )}
      <div style={{ marginTop: '0.75rem', display: 'flex', gap: '0.5rem' }}>
        <button type="submit" disabled={saving}>
          {saving ? 'Guardando…' : product ? 'Guardar cambios' : 'Crear producto'}
        </button>
        <button type="button" onClick={onCancel}>
          Cancelar
        </button>
      </div>
    </form>
  );
}
