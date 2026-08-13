import { useState, useEffect, useRef } from 'react';
import { ContentManagerClient } from '../../api/client.ts';
import type { ProductResponse } from '../../api/client.ts';
import type { CategoryRecord } from '../../../shared/schemas/category.ts';
import {
  buildUndoEntry,
  computeUndoActions,
  loadStack,
  saveStack,
  moveEntryOnSuccess,
} from './undo.ts';
import { ProductForm } from '../components/ProductForm.tsx';
import { useProductsQuery } from '../components/useProductsQuery.ts';
import { SyncStatusPanel } from '../components/SyncStatusPanel.tsx';
import { FilterBar } from '../components/FilterBar.tsx';
import { BulkOpsBar } from '../components/BulkOpsBar.tsx';
import { ProductList } from '../components/ProductList.tsx';
import { ProductInspector } from '../components/ProductInspector.tsx';
import { Feedback } from '../components/Feedback.tsx';
import type { UndoEntry } from './undo.ts';

const client = new ContentManagerClient();

interface BulkChange {
  product_id: string;
  name: string;
  field: string;
  old_value: number | boolean | string;
  new_value: number | boolean | string;
}

export function ProductsPage(): React.ReactElement {
  const {
    data,
    loading,
    loadError,
    reload,
    q,
    category,
    archived,
    outOfStock,
    minPrice,
    maxPrice,
    discountedOnly,
    minDiscount,
    maxDiscount,
    page,
    filters,
    activeFilterCount,
    setFilterParam,
    clearFilters,
  } = useProductsQuery();
  // Plan 093: operation errors render inline (never destroy the page/form);
  // `loadError` (from the query hook) is reserved for initial-load failures.
  const [opError, setOpError] = useState<string | null>(null);
  const [selected, setSelected] = useState<ProductResponse | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<ProductResponse | null>(null);
  const [creating, setCreating] = useState(false);
  const [bulkPreview, setBulkPreview] = useState<BulkChange[] | null>(null);
  const [bulkAction, setBulkAction] = useState<string>('set_discount_percent');
  const [bulkValue, setBulkValue] = useState<string>('10');
  const [bulkScope, setBulkScope] = useState<'page' | 'all' | 'selection'>('page');
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
  const undoStack = useRef<UndoEntry[]>(loadStack('cm-undo-stack'));
  const redoStack = useRef<UndoEntry[]>(loadStack('cm-redo-stack'));
  const dragIndex = useRef<number | null>(null);
  const selectedRef = useRef<ProductResponse | null>(null);
  selectedRef.current = selected;

  useEffect(() => {
    const refresh = (): void => {
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
    };
    refresh();
    // Plan 127 F3.4: subscribe to the sync SSE stream when available; the
    // 30s polling stays as the fallback (EventSource errors, unsupported).
    let source: EventSource | null = null;
    try {
      source = new EventSource('/api/v1/sync/events');
      source.addEventListener('message', (event) => {
        const d = JSON.parse(event.data) as {
          sync: {
            enabled: boolean;
            api_base: string;
            poll_interval: number;
            pull_interval: number;
            paused: boolean;
            token_configured: boolean;
            queue: { pending: number; error: number; total: number };
            last_push: { ok: boolean; error?: string } | null;
          };
        };
        setSyncStatus(d.sync);
        setSyncConfig({ enabled: d.sync.enabled, api_base: d.sync.api_base ?? '', api_token: '' });
      });
      source.onerror = () => {
        source?.close();
        source = null;
      };
    } catch {
      // EventSource unavailable — polling fallback below covers it.
    }
    const timer = setInterval(refresh, 30_000);
    return () => {
      clearInterval(timer);
      source?.close();
    };
  }, []);

  useEffect(() => {
    client
      .getCategories()
      .then((res) => setCategories(res.categories))
      .catch(() => {});
  }, []);

  // Plan 097: shortcut-driven actions (Ctrl+E/D, Del, Ctrl+F) + ?new=1.
  const openNew = new URLSearchParams(window.location.search).get('new');
  useEffect(() => {
    if (openNew === '1') {
      setCreating(true);
      // replaceState keeps the URL clean without a remount.
      const url = new URL(window.location.href);
      url.searchParams.delete('new');
      window.history.replaceState({}, '', url.toString());
    }
  }, [openNew]);

  useEffect(() => {
    const onEdit = (): void => {
      if (selectedRef.current) setEditing(selectedRef.current);
    };
    const onDuplicate = (): void => {
      if (selectedRef.current) void handleDuplicate(selectedRef.current);
    };
    const onArchive = (): void => {
      if (selectedRef.current) void handleArchive(selectedRef.current.id!, selectedRef.current.rev);
    };
    const onFocusSearch = (): void => {
      document.getElementById('product-search')?.focus();
    };
    window.addEventListener('cm-edit-selected', onEdit);
    window.addEventListener('cm-duplicate-selected', onDuplicate);
    window.addEventListener('cm-archive-selected', onArchive);
    window.addEventListener('cm-focus-search', onFocusSearch);
    return () => {
      window.removeEventListener('cm-edit-selected', onEdit);
      window.removeEventListener('cm-duplicate-selected', onDuplicate);
      window.removeEventListener('cm-archive-selected', onArchive);
      window.removeEventListener('cm-focus-search', onFocusSearch);
    };
  }, []);

  const filtersActive = Boolean(
    q ||
    category ||
    outOfStock ||
    minPrice ||
    maxPrice ||
    archived ||
    // Plan 101: discount filters also gate reorder — the server requires
    // the FULL catalog (409 REORDER_SCOPE_AMBIGUOUS otherwise).
    discountedOnly === 'true' ||
    minDiscount !== '' ||
    maxDiscount !== ''
  );
  const canReorder =
    !!data &&
    !filtersActive &&
    data.total <= data.items.length &&
    sortField === 'order' &&
    sortDir === 'asc';
  const pageStart = data ? (data.page - 1) * data.limit + 1 : 0;
  const pageEnd = data ? Math.min(data.page * data.limit, data.total) : 0;

  // Plan 091: export the current filtered view as JSON or CSV.
  function handleExport(kind: 'json' | 'csv'): void {
    if (!data) return;
    const stamp = new Date().toISOString().slice(0, 10);
    if (kind === 'json') {
      void client.exportJson().then((catalog) => {
        const blob = new Blob([JSON.stringify(catalog, null, 2)], {
          type: 'application/json',
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `productos-${stamp}.json`;
        a.click();
        URL.revokeObjectURL(url);
        setFeedback('Export JSON descargado ✓');
      });
    } else {
      void client
        .exportCsv({
          q: q || undefined,
          category: category || undefined,
          archived: archived === 'true' ? 'true' : archived === 'false' ? 'false' : undefined,
          out_of_stock: outOfStock === 'true' ? 'true' : undefined,
          discounted_only: discountedOnly === 'true' ? 'true' : undefined,
          min_discount: minDiscount || undefined,
          max_discount: maxDiscount || undefined,
        })
        .then(async (res) => {
          if (!res.ok) throw new Error(`Export falló (${res.status})`);
          const blob = await res.blob();
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `productos-${stamp}.csv`;
          a.click();
          URL.revokeObjectURL(url);
          setFeedback('Export CSV descargado ✓');
        })
        .catch((err) => setOpError((err as Error).message));
    }
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
      await reload();
    } catch (err) {
      setOpError((err as Error).message);
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
      await reload();
    } catch (err) {
      setOpError((err as Error).message);
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
      await reload();
    } catch (err) {
      setOpError((err as Error).message);
    }
  }

  async function handleArchive(id: string, rev: number): Promise<void> {
    const product = data?.items.find((p) => p.id === id);
    if (!window.confirm(`¿Archivar ${product?.name ?? 'producto'}?`)) return;
    try {
      await client.updateProduct(id, rev, { is_archived: true });
      setSelected(null);
      setFeedback('Producto archivado ✓');
      await reload();
    } catch (err) {
      setOpError((err as Error).message);
    }
  }

  async function handleInlineSave(
    id: string,
    rev: number,
    field: 'price' | 'discount' | 'stock',
    value: number | boolean
  ): Promise<void> {
    try {
      await client.updateProduct(id, rev, { [field]: value });
      setFeedback(field === 'stock' ? 'Stock actualizado ✓' : `${field} actualizado ✓`);
      await reload();
    } catch (err) {
      setOpError((err as Error).message);
      await reload();
    }
  }

  async function handlePurge(id: string, rev: number): Promise<void> {
    try {
      await client.deleteProduct(id, rev);
      setSelected(null);
      setFeedback('Producto eliminado definitivamente ✓');
      await reload();
    } catch (err) {
      setOpError((err as Error).message);
    }
  }

  async function handleRestore(id: string, rev: number): Promise<void> {
    const product = data?.items.find((p) => p.id === id);
    if (!window.confirm(`¿Restaurar ${product?.name ?? 'producto'}?`)) return;
    try {
      await client.updateProduct(id, rev, { is_archived: false });
      setSelected(null);
      setFeedback('Producto restaurado ✓');
      await reload();
    } catch (err) {
      setOpError((err as Error).message);
    }
  }

  async function handleBulkPreview(): Promise<void> {
    if (!data) return;
    const ids =
      bulkScope === 'selection'
        ? [...selectedIds]
        : data.items.filter((p) => p.id).map((p) => p.id!);
    if (ids.length === 0) return;
    try {
      const val =
        bulkAction === 'set_stock'
          ? bulkValue === 'true'
          : bulkAction === 'set_category'
            ? bulkValue
            : Number(bulkValue);
      const result = await client.bulkPreview(
        bulkAction,
        val,
        ids,
        bulkScope === 'all' ? { scope: 'all', filters } : undefined
      );
      setBulkPreview(result.changes);
      setFeedback(`Vista previa: ${result.changes.length} cambios`);
    } catch (err) {
      setOpError((err as Error).message);
    }
  }

  async function handleBulkApply(): Promise<void> {
    if (!data) return;
    const ids =
      bulkScope === 'selection'
        ? [...selectedIds]
        : data.items.filter((p) => p.id).map((p) => p.id!);
    if (ids.length === 0) return;
    try {
      const val =
        bulkAction === 'set_stock'
          ? bulkValue === 'true'
          : bulkAction === 'set_category'
            ? bulkValue
            : Number(bulkValue);

      // Plan 088/097: with filters/pagination active the visible page is a
      // subset — ask the operator explicitly before touching anything.
      // A checkbox selection (scope=selection) applies to exactly those ids.
      let scope: 'page' | 'all' | 'selection' = bulkScope === 'selection' ? 'selection' : 'page';
      if (scope === 'selection') {
        if (!window.confirm(`Aplicar ${bulkAction} a los ${ids.length} productos seleccionados?`)) {
          return;
        }
      } else if (data.total > data.items.length) {
        const applyAll = window.confirm(
          `Hay ${data.total} productos que coinciden y solo se muestran ${data.items.length}.\n\nAceptar = aplicar a TODOS (${data.total}).\nCancelar = aplicar solo a la página visible (${data.items.length}).`
        );
        scope = applyAll ? 'all' : 'page';
        if (scope === 'page' && bulkPreview === null) {
          // Safety: without a preview the operator never sees the blast radius.
          if (
            !window.confirm(
              `Aplicar ${bulkAction} a los ${data.items.length} productos visibles de esta página?`
            )
          ) {
            return;
          }
        }
      } else if (bulkPreview === null) {
        if (!window.confirm(`Aplicar ${bulkAction} a los ${data.items.length} productos?`)) {
          return;
        }
      }

      const result = await client.bulkApply(
        bulkAction,
        val,
        ids,
        scope === 'all' ? { scope: 'all', filters } : undefined
      );

      // Plan 088: the undo entry is recorded ONLY after a successful apply.
      // For scope=all the server's changes array carries the exact old
      // values of every mutated product — the honest snapshot.
      const affectedIds = scope === 'all' ? result.changes.map((c) => c.product_id) : ids;
      const entry =
        scope === 'all'
          ? buildUndoEntry({
              action: bulkAction,
              value: val,
              productIds: affectedIds,
              products: [],
              preview: result.changes,
            })
          : buildUndoEntry({
              action: bulkAction,
              value: val,
              productIds: ids,
              products: data.items
                .filter((p): p is ProductResponse & { id: string } => Boolean(p.id))
                .map((p) => ({
                  id: p.id,
                  price: p.price,
                  discount: p.discount,
                  stock: p.stock,
                  category: p.category,
                })),
              preview: bulkPreview,
            });
      undoStack.current.push(entry);
      redoStack.current = [];
      saveStack('cm-undo-stack', undoStack.current);
      saveStack('cm-redo-stack', redoStack.current);

      setBulkPreview(null);
      if (scope === 'selection') setSelectedIds(new Set());
      setFeedback(`Aplicado: ${result.changed} productos modificados ✓`);
      await reload();
    } catch (err) {
      setOpError((err as Error).message);
    }
  }

  async function handleRedo(): Promise<void> {
    try {
      // Plan 099: the entry moves stacks only after the operation succeeds —
      // a failed redo must stay in the redo stack for retry.
      await moveEntryOnSuccess(redoStack, undoStack, async (entry) => {
        // Plan 097: redo re-applies the original bulk action to the recorded
        // product ids with fresh revisions.
        const result = await client.bulkApply(entry.action, entry.value, entry.product_ids);
        setBulkPreview(null);
        setFeedback(`Rehecho: ${result.changed} productos modificados ✓`);
        await reload();
      });
      saveStack('cm-undo-stack', undoStack.current);
      saveStack('cm-redo-stack', redoStack.current);
    } catch (err) {
      saveStack('cm-undo-stack', undoStack.current);
      saveStack('cm-redo-stack', redoStack.current);
      setOpError((err as Error).message);
    }
  }

  async function handleReorder(): Promise<void> {
    if (!data || !canReorder) return;
    const ids = data.items.filter((p) => p.id).map((p) => p.id!);
    if (ids.length === 0) return;
    try {
      await client.reorderProducts(ids);
      setFeedback('Productos reordenados ✓');
      await reload();
    } catch (err) {
      setOpError((err as Error).message);
    }
  }

  async function handleUndo(): Promise<void> {
    try {
      // Plan 099: the entry moves stacks only after the operation succeeds —
      // a failed undo (404/409/network) must stay in the undo stack for
      // retry; re-applying the action from the redo stack would be the
      // OPPOSITE of what the operator asked for.
      await moveEntryOnSuccess(undoStack, redoStack, async (entry) => {
        // Fetch fresh revisions right before undoing — data.items may already
        // be stale (a prior undo item in this same entry, or the apply).
        const currentProducts = await Promise.all(
          entry.perProductOldValues.map(async (item) => {
            const product = await client.getProduct(item.product_id);
            return { id: item.product_id, rev: product.rev ?? 0 };
          })
        );
        const actions = computeUndoActions(entry, currentProducts);
        // Plan 121: one batch call = one catalog write (was N sequential
        // full-catalog rewrites). All-or-nothing with a single rev guard.
        await client.batchUpdateProducts(actions);
        setFeedback('Operación deshecha ✓');
        await reload();
      });
      saveStack('cm-undo-stack', undoStack.current);
      saveStack('cm-redo-stack', redoStack.current);
    } catch (err) {
      saveStack('cm-undo-stack', undoStack.current);
      saveStack('cm-redo-stack', redoStack.current);
      setOpError((err as Error).message);
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
    if (!canReorder) return;
    if (dragIndex.current === null || dragIndex.current === dropIndex || !data) return;

    const items = [...data.items];
    const [draggedItem] = items.splice(dragIndex.current, 1);
    items.splice(dropIndex, 0, draggedItem);
    dragIndex.current = null;

    // Plan 094: no optimistic splice (the hook owns data) — the reorder API
    // is localhost-fast; reload reflects the new order.
    const ids = items.filter((p) => p.id).map((p) => p.id!);
    client
      .reorderProducts(ids)
      .then(() => {
        setFeedback('Productos reordenados ✓');
        void reload();
      })
      .catch((err) => {
        setOpError((err as Error).message);
        void reload();
      });
  }

  if (loadError) {
    return (
      <main role="main" aria-label="Productos">
        <h1>Productos</h1>
        <p role="alert">{loadError}</p>
        <button onClick={reload}>Reintentar</button>
      </main>
    );
  }

  return (
    <main role="main" aria-label="Productos">
      <h1>Productos{data ? ` (${data.total})` : ''}</h1>

      {/* Plan 088: visible pagination scope — the operator always knows how
          much of the catalog the current view covers. */}
      {data && data.total > 0 && (
        <p style={{ margin: '0 0 0.5rem', fontSize: '0.85rem', color: '#495057' }}>
          Mostrando {pageStart}–{pageEnd} de {data.total}{' '}
          {data.total > data.items.length && (
            <button
              onClick={() => setFilterParam('page', '1')}
              style={{ padding: '0.1rem 0.5rem', fontSize: '0.8rem', marginLeft: '0.5rem' }}
            >
              Primera página
            </button>
          )}
        </p>
      )}

      {syncStatus && (
        <SyncStatusPanel
          syncStatus={syncStatus}
          showSyncConfig={showSyncConfig}
          setShowSyncConfig={setShowSyncConfig}
          syncConfig={syncConfig}
          setSyncConfig={setSyncConfig}
          setFeedback={setFeedback}
          setOpError={setOpError}
        />
      )}

      {/* Feedback */}
      {opError && (
        <Feedback kind="error" onDismiss={() => setOpError(null)}>
          {opError}
        </Feedback>
      )}
      {feedback && (
        <Feedback kind="success" onDismiss={() => setFeedback(null)}>
          {feedback}
        </Feedback>
      )}

      <FilterBar
        q={q}
        category={category}
        archived={archived}
        outOfStock={outOfStock}
        minPrice={minPrice}
        maxPrice={maxPrice}
        discountedOnly={discountedOnly}
        minDiscount={minDiscount}
        maxDiscount={maxDiscount}
        categories={categories}
        activeFilterCount={activeFilterCount}
        setFilterParam={setFilterParam}
        clearFilters={clearFilters}
        onExport={handleExport}
        onCreate={() => setCreating(true)}
        setFeedback={setFeedback}
        viewMode={viewMode}
        setViewMode={setViewMode}
      />

      <BulkOpsBar
        data={data}
        bulkAction={bulkAction}
        setBulkAction={setBulkAction}
        bulkValue={bulkValue}
        setBulkValue={setBulkValue}
        bulkScope={bulkScope}
        setBulkScope={setBulkScope}
        bulkPreview={bulkPreview}
        canReorder={canReorder}
        undoCount={undoStack.current.length}
        redoCount={redoStack.current.length}
        selectionCount={selectedIds.size}
        onPreview={handleBulkPreview}
        onApply={handleBulkApply}
        onReorder={handleReorder}
        onUndo={handleUndo}
        onRedo={handleRedo}
      />

      {/* Loading */}
      {loading && <p aria-live="polite">Cargando…</p>}

      {/* Empty */}
      {!loading && data && data.items.length === 0 && <p>No se encontraron productos.</p>}

      <ProductList
        data={data}
        viewMode={viewMode}
        sortField={sortField}
        sortDir={sortDir}
        onSort={handleSort}
        canReorder={canReorder}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        selected={selected}
        selectedIds={selectedIds}
        onToggleSelect={(id, checked) => {
          setSelectedIds((prev) => {
            const next = new Set(prev);
            if (checked) next.add(id);
            else next.delete(id);
            return next;
          });
        }}
        onSelectPage={(checked) => {
          setSelectedIds(
            checked ? new Set((data?.items ?? []).filter((p) => p.id).map((p) => p.id!)) : new Set()
          );
        }}
        onSelect={setSelected}
        onEdit={setEditing}
        onDuplicate={handleDuplicate}
        onArchive={handleArchive}
        onRestore={handleRestore}
        onPurge={handlePurge}
        onInlineSave={handleInlineSave}
        onClearPreview={() => setBulkPreview(null)}
      />

      {/* Plan 088: pagination controls */}
      {data && data.total > data.items.length && (
        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem', alignItems: 'center' }}>
          <button
            onClick={() => setFilterParam('page', String(page - 1))}
            disabled={page <= 1}
            style={{ padding: '0.25rem 0.75rem' }}
          >
            ← Anterior
          </button>
          <span style={{ fontSize: '0.85rem' }}>
            Página {page} de {Math.max(1, Math.ceil(data.total / data.limit))}
          </span>
          <button
            onClick={() => setFilterParam('page', String(page + 1))}
            disabled={pageEnd >= data.total}
            style={{ padding: '0.25rem 0.75rem' }}
          >
            Siguiente →
          </button>
        </div>
      )}

      <ProductInspector selected={selected} onEdit={setEditing} onClose={() => setSelected(null)} />

      {editing && (
        <ProductForm product={editing} onSave={handleSave} onCancel={() => setEditing(null)} />
      )}

      {/* Create form */}
      {creating && <ProductForm onSave={handleCreate} onCancel={() => setCreating(false)} />}
    </main>
  );
}
