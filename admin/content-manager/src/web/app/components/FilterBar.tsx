import type { CategoryRecord } from '../../../shared/schemas/category.ts';
import { ContentManagerClient } from '../../api/client.ts';

const client = new ContentManagerClient();

// Plan 094: filter bar extracted from ProductsPage.

export function FilterBar({
  q,
  category,
  archived,
  outOfStock,
  minPrice,
  maxPrice,
  discountedOnly,
  minDiscount,
  maxDiscount,
  categories,
  activeFilterCount,
  setFilterParam,
  clearFilters,
  onExport,
  onCreate,
  setFeedback,
  viewMode,
  setViewMode,
}: {
  q: string;
  category: string;
  archived: string;
  outOfStock: string;
  minPrice: string;
  maxPrice: string;
  discountedOnly: string;
  minDiscount: string;
  maxDiscount: string;
  categories: CategoryRecord[];
  activeFilterCount: number;
  setFilterParam: (key: string, value: string) => void;
  clearFilters: () => void;
  onExport: (kind: 'json' | 'csv') => void;
  onCreate: () => void;
  setFeedback: (v: string | null) => void;
  viewMode: 'table' | 'gallery';
  setViewMode: (mode: 'table' | 'gallery') => void;
}): React.ReactElement {
  return (
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
          id="product-search"
          value={q}
          onChange={(e) => setFilterParam('q', e.target.value)}
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
          onChange={(e) => setFilterParam('min_price', e.target.value)}
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
          onChange={(e) => setFilterParam('max_price', e.target.value)}
          placeholder="∞"
          style={{ padding: '0.25rem 0.5rem', width: '90px' }}
        />
      </label>
      <label>
        Categoría:{' '}
        <select
          value={category}
          onChange={(e) => setFilterParam('category', e.target.value)}
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
          onChange={(e) => setFilterParam('out_of_stock', e.target.checked ? 'true' : '')}
        />
        Sin stock
      </label>
      <label style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
        <input
          type="checkbox"
          checked={discountedOnly === 'true'}
          onChange={(e) => setFilterParam('discounted_only', e.target.checked ? 'true' : '')}
        />
        Solo descuento
      </label>
      <label>
        Dto. mín %:{' '}
        <input
          type="number"
          min="0"
          max="100"
          value={minDiscount}
          onChange={(e) => setFilterParam('min_discount', e.target.value)}
          placeholder="0"
          style={{ padding: '0.25rem 0.5rem', width: '70px' }}
        />
      </label>
      <label>
        Dto. máx %:{' '}
        <input
          type="number"
          min="0"
          max="100"
          value={maxDiscount}
          onChange={(e) => setFilterParam('max_discount', e.target.value)}
          placeholder="100"
          style={{ padding: '0.25rem 0.5rem', width: '70px' }}
        />
      </label>
      <label style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
        <select
          value={archived}
          onChange={(e) => setFilterParam('archived', e.target.value)}
          style={{ padding: '0.25rem' }}
        >
          <option value="">Todos</option>
          <option value="false">Activos</option>
          <option value="true">Archivados</option>
        </select>
      </label>
      <button
        onClick={() => {
          client
            .getProducts()
            .then((d) => setFeedback(`Sanity check: ${d.total} productos, sin errores`))
            .catch(() => setFeedback('Error al validar'));
        }}
        style={{ padding: '0.25rem 0.75rem' }}
      >
        ✓ Validar
      </button>
      {activeFilterCount > 0 && (
        <span
          style={{
            background: '#e3f2fd',
            padding: '0.15rem 0.5rem',
            borderRadius: 'var(--radius)',
            fontSize: '0.85rem',
          }}
        >
          Filtros activos: {activeFilterCount}{' '}
          <button
            onClick={clearFilters}
            style={{ padding: '0.05rem 0.4rem', fontSize: '0.8rem', marginLeft: '0.25rem' }}
          >
            Limpiar
          </button>
        </span>
      )}
      <button
        onClick={() => void onExport('json')}
        style={{ padding: '0.25rem 0.75rem' }}
        title="Exportar catálogo completo en JSON"
      >
        ⬇ JSON
      </button>
      <button
        onClick={() => void onExport('csv')}
        style={{ padding: '0.25rem 0.75rem' }}
        title="Exportar productos filtrados en CSV"
      >
        ⬇ CSV
      </button>
      <button onClick={onCreate} style={{ padding: '0.25rem 0.75rem', marginLeft: 'auto' }}>
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
  );
}
