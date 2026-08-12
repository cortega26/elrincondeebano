import { useState, useEffect } from 'react';
import { ContentManagerClient } from '../../api/client.ts';
const client = new ContentManagerClient();
import type { ProductResponse } from '../../api/client.ts';
import type { CategoryRecord } from '../../../shared/schemas/category.ts';
import { ProductImage } from './ProductImage.tsx';

export function ProductForm({
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
            <ProductImage
              mediaPath={imagePath}
              alt="Previsualización"
              style={{
                maxWidth: '200px',
                maxHeight: '100px',
                borderRadius: '3px',
                border: '1px solid var(--color-border)',
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
                      src={`/${fullPath}`}
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
            <ProductImage
              mediaPath={product.image_path}
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
