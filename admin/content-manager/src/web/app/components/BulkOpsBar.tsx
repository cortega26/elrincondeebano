// Plan 094: bulk operations bar + preview results extracted from
// ProductsPage.
import type { PaginatedResponse, ProductResponse } from '../../api/client.ts';

export interface BulkChange {
  product_id: string;
  name: string;
  field: string;
  old_value: number | boolean | string;
  new_value: number | boolean | string;
}

export function BulkOpsBar({
  data,
  bulkAction,
  setBulkAction,
  bulkValue,
  setBulkValue,
  bulkScope,
  setBulkScope,
  bulkPreview,
  canReorder,
  undoCount,
  onPreview,
  onApply,
  onReorder,
  onUndo,
}: {
  data: PaginatedResponse<ProductResponse> | null;
  bulkAction: string;
  setBulkAction: (v: string) => void;
  bulkValue: string;
  setBulkValue: (v: string) => void;
  bulkScope: 'page' | 'all';
  setBulkScope: (v: 'page' | 'all') => void;
  bulkPreview: BulkChange[] | null;
  canReorder: boolean;
  undoCount: number;
  onPreview: () => void;
  onApply: () => void;
  onReorder: () => void;
  onUndo: () => void;
}): React.ReactElement {
  return (
    <>
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
          onChange={(e) => {
            // Plan 088: the value control changes shape with the action —
            // reset it so a stale value (e.g. a price '10' becoming the
            // stock toggle) can never silently flip semantics.
            setBulkAction(e.target.value);
            if (e.target.value === 'set_stock') setBulkValue('true');
            else if (e.target.value === 'set_category') setBulkValue('');
            else setBulkValue('10');
          }}
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
            aria-label="Valor de stock"
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
        {/* Plan 088: bulk scope is explicit when the view is a subset */}
        {data && data.total > data.items.length && (
          <label
            style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.85rem' }}
          >
            Ámbito:
            <select
              value={bulkScope}
              onChange={(e) => setBulkScope(e.target.value as 'page' | 'all')}
              style={{ padding: '0.25rem' }}
              aria-label="Ámbito de la operación masiva"
            >
              <option value="page">Página ({data.items.length})</option>
              <option value="all">Todos los que coinciden ({data.total})</option>
            </select>
          </label>
        )}
        <button onClick={() => void onPreview()} style={{ padding: '0.25rem 0.75rem' }}>
          Vista previa
        </button>
        <button onClick={() => void onApply()} style={{ padding: '0.25rem 0.75rem' }}>
          Aplicar
        </button>
        <button
          onClick={() => void onReorder()}
          disabled={!canReorder}
          style={{ padding: '0.25rem 0.75rem', marginLeft: 'auto', opacity: canReorder ? 1 : 0.5 }}
          title={
            canReorder
              ? 'Reordenar por orden actual'
              : 'Reorder requiere catálogo completo sin filtros y orden por defecto'
          }
        >
          ⇅ Reordenar
        </button>
        {undoCount > 0 && (
          <button
            onClick={() => void onUndo()}
            style={{ padding: '0.25rem 0.75rem' }}
            title="Deshacer última operación masiva"
          >
            ↩ Deshacer
          </button>
        )}
      </div>

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
    </>
  );
}
