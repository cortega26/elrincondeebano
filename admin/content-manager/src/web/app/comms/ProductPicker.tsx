import { useEffect, useState } from 'react';
import { ContentManagerClient, type ProductResponse } from '../../api/client.ts';
import { ProductImage } from '../components/ProductImage.tsx';
import { formatClp } from '../../../shared/comms.ts';
import { errorMessage } from './useCommsWorkspace.ts';

const client = new ContentManagerClient();

export function ProductPicker({
  product,
  onChange,
}: {
  product: ProductResponse | null;
  onChange: (p: ProductResponse | null) => void;
}): React.ReactElement {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<ProductResponse[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) {
      setResults([]);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      client
        .getProducts({ q: term, limit: 8, archived: false })
        .then((res) => {
          if (!cancelled) {
            setResults(res.items);
            setError(null);
          }
        })
        .catch((err) => !cancelled && setError(errorMessage(err)));
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [q]);

  if (product) {
    return (
      <div className="comms-product is-chosen">
        <ProductImage mediaPath={product.image_path} alt="" style={{ width: 48, height: 48 }} />
        <div>
          <strong>{product.name}</strong>
          <div className="comms-hint">
            {formatClp(product.price)}
            {product.discount > 0 && ` → ${formatClp(product.price - product.discount)}`}
            {product.stock ? ' · con stock' : ' · SIN STOCK en catálogo'}
          </div>
        </div>
        <button type="button" onClick={() => onChange(null)}>
          Quitar
        </button>
      </div>
    );
  }
  return (
    <div className="comms-product">
      <label className="comms-field">
        <span>Producto del catálogo (opcional)</span>
        <input
          type="search"
          value={q}
          placeholder="Buscar producto…"
          onChange={(e) => setQ(e.target.value)}
        />
      </label>
      {error && <p className="comms-hint">{error}</p>}
      {results.length > 0 && (
        <ul className="comms-product-results" aria-label="Productos encontrados">
          {results.map((p) => (
            <li key={`${p.name}-${p.category}`}>
              <button
                type="button"
                onClick={() => {
                  onChange(p);
                  setQ('');
                }}
              >
                <ProductImage mediaPath={p.image_path} alt="" style={{ width: 36, height: 36 }} />
                <span>
                  {p.name} · {formatClp(p.price - (p.discount || 0))}
                  {!p.stock && ' · sin stock'}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
