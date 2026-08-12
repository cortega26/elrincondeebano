// Plan 094: product detail inspector extracted from ProductsPage.
import type { ProductResponse } from '../../api/client.ts';
import { ProductImage } from './ProductImage.tsx';

export function ProductInspector({
  selected,
  onEdit,
  onClose,
}: {
  selected: ProductResponse | null;
  onEdit: (p: ProductResponse) => void;
  onClose: () => void;
}): React.ReactElement {
  return (
    <>
      {selected && (
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
              <ProductImage
                mediaPath={selected.image_path}
                alt={selected.name}
                style={{ width: '100%', maxHeight: '200px', borderRadius: 'var(--radius)' }}
              />
              {selected.image_avif_path && (
                <div style={{ marginTop: '0.25rem', fontSize: '0.8rem', color: '#6c757d' }}>
                  AVIF:{' '}
                  <ProductImage
                    mediaPath={selected.image_avif_path}
                    alt={selected.name + ' (AVIF)'}
                    style={{
                      width: '60px',
                      height: '60px',
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
            <button onClick={() => onEdit(selected)}>Editar</button>
            <button onClick={onClose}>Cerrar</button>
          </div>
        </aside>
      )}

      {/* Edit form */}
    </>
  );
}
