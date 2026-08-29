/* eslint-disable max-lines-per-function, complexity, sonarjs/cognitive-complexity, sonarjs/no-duplicate-string -- plan 154 small form, zod wrapper */
import { useState, useEffect } from 'react';
import { ContentManagerClient } from '../../api/client.ts';
const client = new ContentManagerClient();
import type { ProductResponse } from '../../api/client.ts';
import type { CategoryRecord } from '../../../shared/schemas/category.ts';
import { ProductImage } from './ProductImage.tsx';
import { productSchema } from '../../../shared/schemas/product.ts';

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
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
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
    client
      .getMedia()
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
    setFieldErrors({});
    // Plan 154: client-side zod parse on submit — surface .issues as field errors
    // using the shared canonical schema (leaf zod only, no server code).
    const priceNum = Number(price);
    const discountNum = Number(discount);
    const probeBase = product ?? {
      order: 0,
      is_archived: false,
      rev: 0,
      field_last_modified: {} as Record<string, unknown>,
    };
    const probe = {
      ...probeBase,
      name,
      description,
      price: priceNum,
      discount: discountNum,
      stock,
      category,
      image_path: imagePath,
      image_avif_path: imageAvifPath,
    };
    const parsed = productSchema.safeParse(probe);
    if (!parsed.success) {
      const mapped: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const field = String(issue.path[0] ?? 'form');
        if (!mapped[field]) mapped[field] = issue.message;
      }
      setFieldErrors(mapped);
      return;
    }
    setSaving(true);
    try {
      const changes: Record<string, unknown> = {};
      if (!product) {
        changes.name = name;
        changes.price = priceNum;
        changes.description = description;
        changes.stock = stock;
        changes.category = category;
        changes.discount = discountNum;
        if (imagePath) changes.image_path = imagePath;
        if (imageAvifPath) changes.image_avif_path = imageAvifPath;
      } else {
        if (name !== product.name) changes.name = name;
        if (priceNum !== product.price) changes.price = priceNum;
        if (description !== product.description) changes.description = description;
        if (stock !== product.stock) changes.stock = stock;
        if (category !== product.category) changes.category = category;
        if (discountNum !== product.discount) changes.discount = discountNum;
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
            onChange={(e) => {
              setName(e.target.value);
              if (fieldErrors.name) setFieldErrors((prev) => ({ ...prev, name: '' }));
            }}
            style={{ width: '100%', padding: '0.25rem' }}
          />
          {fieldErrors.name && (
            <span style={{ color: 'var(--color-danger, #c00)', fontSize: '0.8rem' }}>
              {fieldErrors.name}
            </span>
          )}
        </label>
        <label>
          Precio *<br />
          <input
            required
            type="number"
            min="1"
            value={price}
            onChange={(e) => {
              setPrice(e.target.value);
              if (fieldErrors.price || fieldErrors.discount)
                setFieldErrors((prev) => ({ ...prev, price: '', discount: '' }));
            }}
            style={{ width: '100%', padding: '0.25rem' }}
          />
          {fieldErrors.price && (
            <span style={{ color: 'var(--color-danger, #c00)', fontSize: '0.8rem' }}>
              {fieldErrors.price}
            </span>
          )}
        </label>
        <label style={{ gridColumn: 'span 2' }}>
          Descripción
          <br />
          <textarea
            value={description}
            onChange={(e) => {
              setDescription(e.target.value);
              if (fieldErrors.description) setFieldErrors((prev) => ({ ...prev, description: '' }));
            }}
            rows={2}
            style={{ width: '100%', padding: '0.25rem' }}
          />
          {fieldErrors.description && (
            <span style={{ color: 'var(--color-danger, #c00)', fontSize: '0.8rem' }}>
              {fieldErrors.description}
            </span>
          )}
        </label>
        <label>
          Categoría *<br />
          {categories.length > 0 ? (
            <select
              required
              value={category}
              onChange={(e) => {
                setCategory(e.target.value);
                if (fieldErrors.category) setFieldErrors((prev) => ({ ...prev, category: '' }));
              }}
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
              onChange={(e) => {
                setCategory(e.target.value);
                if (fieldErrors.category) setFieldErrors((prev) => ({ ...prev, category: '' }));
              }}
              style={{ width: '100%', padding: '0.25rem' }}
            />
          )}
          {fieldErrors.category && (
            <span style={{ color: 'var(--color-danger, #c00)', fontSize: '0.8rem' }}>
              {fieldErrors.category}
            </span>
          )}
        </label>
        <label>
          Descuento
          <br />
          <input
            type="number"
            min="0"
            value={discount}
            onChange={(e) => {
              setDiscount(e.target.value);
              if (fieldErrors.discount || fieldErrors.price)
                setFieldErrors((prev) => ({ ...prev, discount: '', price: '' }));
            }}
            style={{ width: '100%', padding: '0.25rem' }}
          />
          {fieldErrors.discount && (
            <span style={{ color: 'var(--color-danger, #c00)', fontSize: '0.8rem' }}>
              {fieldErrors.discount}
            </span>
          )}
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
            onChange={(e) => {
              setImagePath(e.target.value);
              if (fieldErrors.image_path) setFieldErrors((prev) => ({ ...prev, image_path: '' }));
            }}
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
        {fieldErrors.image_path && (
          <span
            style={{
              color: 'var(--color-danger, #c00)',
              fontSize: '0.8rem',
              display: 'block',
              marginTop: '0.25rem',
            }}
          >
            {fieldErrors.image_path}
          </span>
        )}
        <label
          style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.5rem' }}
        >
          <strong>Imagen AVIF:</strong>
          <input
            type="text"
            value={imageAvifPath}
            onChange={(e) => {
              setImageAvifPath(e.target.value);
              if (fieldErrors.image_avif_path)
                setFieldErrors((prev) => ({ ...prev, image_avif_path: '' }));
            }}
            placeholder="assets/images/… (avif)"
            style={{ flex: 1, padding: '0.25rem', fontSize: '0.85rem' }}
          />
        </label>
        {fieldErrors.image_avif_path && (
          <span
            style={{
              color: 'var(--color-danger, #c00)',
              fontSize: '0.8rem',
              display: 'block',
              marginTop: '0.25rem',
            }}
          >
            {fieldErrors.image_avif_path}
          </span>
        )}

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
      {Object.keys(fieldErrors).some((k) => fieldErrors[k]) && (
        <div
          role="alert"
          style={{
            marginTop: '0.5rem',
            padding: '0.5rem',
            border: '1px solid var(--color-danger, #c00)',
            borderRadius: 'var(--radius)',
            background: '#fff5f5',
            fontSize: '0.85rem',
          }}
        >
          {Object.entries(fieldErrors)
            .filter(([, msg]) => msg)
            .map(([field, msg]) => (
              <div key={field}>
                <strong>{field}:</strong> {msg}
              </div>
            ))}
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
