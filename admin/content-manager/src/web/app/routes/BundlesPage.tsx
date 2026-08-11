import { useState, useEffect, useCallback } from 'react';
import { fetchWithCredential } from '../credentialStore.ts';

interface ProductRef {
  category: string;
  name: string;
}

interface Bundle {
  id: string;
  title: string;
  description: string;
  items: ProductRef[];
  bundlePrice?: number;
}

interface FeaturedData {
  featuredStaples: ProductRef[];
  primaryCategories: string[];
  secondaryCategories: string[];
}

interface ProductOption {
  id: string;
  name: string;
  category: string;
}

function newBundle(): Bundle {
  return { id: '', title: '', description: '', items: [] };
}

export function BundlesPage(): React.ReactElement {
  const [bundles, setBundles] = useState<Bundle[]>([]);
  const [featured, setFeatured] = useState<FeaturedData>({
    featuredStaples: [],
    primaryCategories: [],
    secondaryCategories: [],
  });
  const [categories, setCategories] = useState<Array<{ key: string }>>([]);
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [search, setSearch] = useState('');
  const [pickerFor, setPickerFor] = useState<{ bundleIndex: number } | 'featured' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [dirty, setDirty] = useState(false);

  const load = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const [bundlesRes, featuredRes, categoriesRes, productsRes] = await Promise.all([
        fetch('/api/v1/storefront/bundles'),
        fetch('/api/v1/storefront/featured'),
        fetch('/api/v1/categories'),
        fetch('/api/v1/products?limit=200'),
      ]);
      const bundlesData = (await bundlesRes.json()) as { bundles: Bundle[] };
      const featuredData = (await featuredRes.json()) as FeaturedData;
      const categoriesData = (await categoriesRes.json()) as { categories: Array<{ key: string }> };
      const productsData = (await productsRes.json()) as { items: ProductOption[] };
      setBundles(bundlesData.bundles);
      setFeatured(featuredData);
      setCategories(categoriesData.categories);
      setProducts(productsData.items);
      setDirty(false);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const saveBundles = async (): Promise<void> => {
    setError(null);
    setFeedback(null);
    try {
      const res = await fetchWithCredential('/api/v1/storefront/bundles', {
        method: 'PUT',
        body: JSON.stringify({ bundles }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(
          (body as { error?: { message?: string } }).error?.message ?? `Error ${res.status}`
        );
        return;
      }
      setFeedback('Bundles guardados ✓');
      setDirty(false);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const saveFeatured = async (): Promise<void> => {
    setError(null);
    setFeedback(null);
    try {
      const res = await fetchWithCredential('/api/v1/storefront/featured', {
        method: 'PUT',
        body: JSON.stringify({
          featuredStaples: featured.featuredStaples,
          primaryCategories: featured.primaryCategories,
          secondaryCategories: featured.secondaryCategories,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(
          (body as { error?: { message?: string } }).error?.message ?? `Error ${res.status}`
        );
        return;
      }
      setFeedback('Destacados guardados ✓');
      setDirty(false);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const updateBundle = (index: number, patch: Partial<Bundle>): void => {
    setBundles((prev) => prev.map((b, i) => (i === index ? { ...b, ...patch } : b)));
    setDirty(true);
  };

  const addItem = (index: number, item: ProductRef): void => {
    updateBundle(index, { items: [...bundles[index].items, item] });
    setPickerFor(null);
  };

  const removeItem = (bundleIndex: number, itemIndex: number): void => {
    updateBundle(bundleIndex, {
      items: bundles[bundleIndex].items.filter((_, i) => i !== itemIndex),
    });
  };

  const moveBundle = (index: number, direction: -1 | 1): void => {
    const target = index + direction;
    if (target < 0 || target >= bundles.length) return;
    setBundles((prev) => {
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
    setDirty(true);
  };

  const moveItem = (bundleIndex: number, itemIndex: number, direction: -1 | 1): void => {
    const target = itemIndex + direction;
    const items = bundles[bundleIndex].items;
    if (target < 0 || target >= items.length) return;
    updateBundle(bundleIndex, {
      items: items.map((item, i) =>
        i === itemIndex ? items[target] : i === target ? items[itemIndex] : item
      ),
    });
  };

  const duplicateBundle = (index: number): void => {
    const source = bundles[index];
    setBundles((prev) => [
      ...prev.slice(0, index + 1),
      {
        ...source,
        id: `${source.id}-copia`,
        title: `${source.title} (copia)`,
        items: [...source.items],
      },
      ...prev.slice(index + 1),
    ]);
    setDirty(true);
  };

  const filteredProducts = products.filter(
    (p) => p.name.toLowerCase().includes(search.toLowerCase()) && !p.name.startsWith('__')
  );

  const addFeaturedStaple = (item: ProductRef): void => {
    setFeatured((prev) => ({
      ...prev,
      featuredStaples: [...prev.featuredStaples, item],
    }));
    setDirty(true);
    setPickerFor(null);
  };

  const moveStaple = (index: number, direction: -1 | 1): void => {
    const target = index + direction;
    const items = featured.featuredStaples;
    if (target < 0 || target >= items.length) return;
    setFeatured((prev) => ({
      ...prev,
      featuredStaples: items.map((item, i) =>
        i === index ? items[target] : i === target ? items[index] : item
      ),
    }));
    setDirty(true);
  };

  const toggleCategory = (key: string, target: 'primary' | 'secondary'): void => {
    setFeatured((prev) => {
      const list = target === 'primary' ? prev.primaryCategories : prev.secondaryCategories;
      const next = list.includes(key) ? list.filter((c) => c !== key) : [...list, key];
      return target === 'primary'
        ? { ...prev, primaryCategories: next }
        : { ...prev, secondaryCategories: next };
    });
    setDirty(true);
  };

  return (
    <main role="main" aria-label="Vitrina">
      <h1>Vitrina</h1>

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

      <section aria-label="Combos" style={{ marginBottom: '1.5rem' }}>
        <h2>Combos ({bundles.length})</h2>
        {bundles.length === 0 && <p style={{ color: '#6c757d' }}>No hay combos.</p>}

        {bundles.map((bundle, index) => (
          <fieldset
            key={index}
            style={{
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius)',
              padding: '0.75rem',
              marginBottom: '0.75rem',
            }}
          >
            <legend>Combo {index + 1}</legend>
            <div
              style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.5rem' }}
            >
              <label>
                ID:{' '}
                <input
                  value={bundle.id}
                  onChange={(e) => updateBundle(index, { id: e.currentTarget.value })}
                  aria-label={`ID del combo ${index + 1}`}
                  style={{ padding: '0.2rem', width: '140px' }}
                />
              </label>
              <label>
                Título:{' '}
                <input
                  value={bundle.title}
                  onChange={(e) => updateBundle(index, { title: e.currentTarget.value })}
                  aria-label={`Título del combo ${index + 1}`}
                  style={{ padding: '0.2rem', width: '180px' }}
                />
              </label>
              <label>
                Descripción:{' '}
                <input
                  value={bundle.description}
                  onChange={(e) => updateBundle(index, { description: e.currentTarget.value })}
                  aria-label={`Descripción del combo ${index + 1}`}
                  style={{ padding: '0.2rem', width: '220px' }}
                />
              </label>
            </div>

            <ul aria-label={`Items del combo ${index + 1}`} style={{ paddingLeft: '1.25rem' }}>
              {bundle.items.map((item, itemIndex) => (
                <li key={`${item.category}-${item.name}`} style={{ marginBottom: '0.25rem' }}>
                  {item.name} <em>({item.category})</em>{' '}
                  <button onClick={() => moveItem(index, itemIndex, -1)} aria-label="Subir item">
                    ↑
                  </button>{' '}
                  <button onClick={() => moveItem(index, itemIndex, 1)} aria-label="Bajar item">
                    ↓
                  </button>{' '}
                  <button
                    onClick={() => removeItem(index, itemIndex)}
                    aria-label={`Quitar ${item.name}`}
                  >
                    Quitar
                  </button>
                </li>
              ))}
            </ul>

            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
              <button onClick={() => setPickerFor({ bundleIndex: index })}>
                + Agregar producto
              </button>
              <button onClick={() => duplicateBundle(index)}>Duplicar</button>
              <button
                onClick={() => moveBundle(index, -1)}
                aria-label={`Subir combo ${index + 1}`}
                disabled={index === 0}
              >
                ↑
              </button>
              <button
                onClick={() => moveBundle(index, 1)}
                aria-label={`Bajar combo ${index + 1}`}
                disabled={index === bundles.length - 1}
              >
                ↓
              </button>
              <button
                onClick={() => {
                  if (!window.confirm('¿Eliminar este combo del bundle?')) return;
                  setBundles((prev) => prev.filter((_, i) => i !== index));
                  setDirty(true);
                }}
                aria-label={`Eliminar combo ${index + 1}`}
              >
                Eliminar
              </button>
            </div>
          </fieldset>
        ))}

        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button onClick={() => setBundles((prev) => [...prev, newBundle()])}>
            + Nuevo combo
          </button>
          <button onClick={() => void saveBundles()} disabled={!dirty}>
            Guardar combos
          </button>
        </div>
      </section>

      {pickerFor && (
        <section aria-label="Buscar producto" style={{ marginBottom: '1.5rem' }}>
          <h3>Buscar producto</h3>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.currentTarget.value)}
            placeholder="Nombre del producto…"
            style={{ padding: '0.25rem', width: '260px' }}
            autoFocus
          />
          <ul style={{ paddingLeft: '1.25rem', maxHeight: '200px', overflowY: 'auto' }}>
            {filteredProducts.slice(0, 30).map((p) => (
              <li key={p.id}>
                <button
                  onClick={() => {
                    const item = { category: p.category, name: p.name };
                    if (pickerFor === 'featured') addFeaturedStaple(item);
                    else addItem(pickerFor.bundleIndex, item);
                  }}
                >
                  {p.name} ({p.category})
                </button>
              </li>
            ))}
          </ul>
          <button onClick={() => setPickerFor(null)}>Cancelar</button>
        </section>
      )}

      <section aria-label="Destacados" style={{ marginBottom: '1.5rem' }}>
        <h2>Destacados</h2>

        <h3>Productos destacados</h3>
        <ul aria-label="Productos destacados" style={{ paddingLeft: '1.25rem' }}>
          {featured.featuredStaples.map((item, index) => (
            <li key={`${item.category}-${item.name}`}>
              {item.name} <em>({item.category})</em>{' '}
              <button onClick={() => moveStaple(index, -1)} aria-label="Subir destacado">
                ↑
              </button>{' '}
              <button onClick={() => moveStaple(index, 1)} aria-label="Bajar destacado">
                ↓
              </button>{' '}
              <button
                onClick={() =>
                  setFeatured((prev) => ({
                    ...prev,
                    featuredStaples: prev.featuredStaples.filter((_, i) => i !== index),
                  }))
                }
                aria-label={`Quitar destacado ${item.name}`}
              >
                Quitar
              </button>
            </li>
          ))}
        </ul>
        <button onClick={() => setPickerFor('featured')}>+ Agregar destacado</button>

        <h3>Categorías destacadas</h3>
        <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap' }}>
          <fieldset style={{ border: '1px solid var(--color-border)', padding: '0.5rem' }}>
            <legend>Primarias</legend>
            {categories.map((c) => (
              <label key={c.key} style={{ display: 'block' }}>
                <input
                  type="checkbox"
                  checked={featured.primaryCategories.includes(c.key)}
                  onChange={() => toggleCategory(c.key, 'primary')}
                />{' '}
                {c.key}
              </label>
            ))}
          </fieldset>
          <fieldset style={{ border: '1px solid var(--color-border)', padding: '0.5rem' }}>
            <legend>Secundarias</legend>
            {categories.map((c) => (
              <label key={c.key} style={{ display: 'block' }}>
                <input
                  type="checkbox"
                  checked={featured.secondaryCategories.includes(c.key)}
                  onChange={() => toggleCategory(c.key, 'secondary')}
                />{' '}
                {c.key}
              </label>
            ))}
          </fieldset>
        </div>

        <div style={{ marginTop: '0.5rem' }}>
          <button onClick={() => void saveFeatured()} disabled={!dirty}>
            Guardar destacados
          </button>
        </div>
      </section>
    </main>
  );
}
