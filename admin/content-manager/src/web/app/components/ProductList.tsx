// Plan 094: table + gallery views extracted from ProductsPage.
import type { PaginatedResponse, ProductResponse } from '../../api/client.ts';
import { ProductImage } from './ProductImage.tsx';

export function ProductList({
  data,
  viewMode,
  sortField,
  sortDir,
  onSort,
  canReorder,
  onDragStart,
  onDragOver,
  onDrop,
  selected,
  onSelect,
  onEdit,
  onDuplicate,
  onArchive,
  onRestore,
  onClearPreview,
}: {
  data: PaginatedResponse<ProductResponse> | null;
  viewMode: 'table' | 'gallery';
  sortField: string;
  sortDir: 'asc' | 'desc';
  onSort: (field: string) => void;
  canReorder: boolean;
  onDragStart: (e: React.DragEvent<HTMLTableRowElement>, index: number) => void;
  onDragOver: (e: React.DragEvent<HTMLTableRowElement>) => void;
  onDrop: (e: React.DragEvent<HTMLTableRowElement>, index: number) => void;
  selected: ProductResponse | null;
  onSelect: (p: ProductResponse | null) => void;
  onEdit: (p: ProductResponse) => void;
  onDuplicate: (p: ProductResponse) => void;
  onArchive: (id: string, rev: number) => void;
  onRestore: (id: string, rev: number) => void;
  onClearPreview: () => void;
}): React.ReactElement {
  const sortedItems = [...(data?.items ?? [])].sort((a, b) => {
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
        cmp = (a.discount_percentage ?? 0) - (b.discount_percentage ?? 0);
        break;
      case 'order':
      default:
        cmp = a.order - b.order;
        break;
    }
    return sortDir === 'asc' ? cmp : -cmp;
  });
  return (
    <>
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
                aria-sort={
                  sortField === 'name' ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'
                }
                onClick={() => onSort('name')}
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
                aria-sort={
                  sortField === 'category'
                    ? sortDir === 'asc'
                      ? 'ascending'
                      : 'descending'
                    : 'none'
                }
                onClick={() => onSort('category')}
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
                aria-sort={
                  sortField === 'price' ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'
                }
                onClick={() => onSort('price')}
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
                aria-sort={
                  sortField === 'discount'
                    ? sortDir === 'asc'
                      ? 'ascending'
                      : 'descending'
                    : 'none'
                }
                onClick={() => onSort('discount')}
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
                  onSelect(product);
                  onEdit(null as unknown as ProductResponse);
                  onClearPreview();
                }}
                onDoubleClick={() => {
                  onEdit(product);
                  onSelect(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    onSelect(product);
                    onEdit(null as unknown as ProductResponse);
                    onClearPreview();
                  }
                }}
                tabIndex={0}
                role="row"
                draggable={canReorder}
                aria-grabbed="false"
                onDragStart={(e) => onDragStart(e, idx)}
                onDragOver={onDragOver}
                onDrop={(e) => onDrop(e, idx)}
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
                      onEdit(product);
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
                        void onRestore(product.id!, product.rev);
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
                        void onArchive(product.id!, product.rev);
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
                      void onDuplicate(product);
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
                onSelect(product);
                onEdit(null as unknown as ProductResponse);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  onSelect(product);
                  onEdit(null as unknown as ProductResponse);
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
                <ProductImage
                  mediaPath={product.image_path}
                  alt={product.name}
                  style={{
                    width: '100%',
                    height: '120px',
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
    </>
  );
}
