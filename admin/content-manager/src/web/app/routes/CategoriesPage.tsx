import React, { useState, useEffect } from 'react';
import { ContentManagerClient, ApiRequestError } from '../../api/client.ts';
import type { CategoryResponse } from '../../api/client.ts';
import type { CategoryRecord, Subcategory } from '../../../shared/schemas/category.ts';

const client = new ContentManagerClient();

export function CategoriesPage(): React.ReactElement {
  const [data, setData] = useState<CategoryResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<CategoryRecord | null>(null);
  const [adding, setAdding] = useState(false);
  const [addingGroup, setAddingGroup] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [addingSub, setAddingSub] = useState<string | null>(null);
  const [editingSub, setEditingSub] = useState<{
    categoryId: string;
    subcategory: Subcategory;
  } | null>(null);

  const load = async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const result = await client.getCategories();
      setData(result);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  async function handleMutationError(err: unknown): Promise<void> {
    if (err instanceof ApiRequestError && err.status === 409) {
      await load();
      setError('La categoría cambió; recarga y reintenta');
    } else {
      setError((err as Error).message);
    }
  }

  async function handleDelete(id: string): Promise<void> {
    try {
      await client.deleteCategory(id, data?.rev ?? 0);
      setFeedback('Categoría eliminada ✓');
      await load();
    } catch (err) {
      await handleMutationError(err);
    }
  }

  async function handleDeleteGroup(id: string): Promise<void> {
    try {
      await client.deleteNavGroup(id, data?.rev ?? 0);
      setFeedback('Grupo eliminado ✓');
      await load();
    } catch (err) {
      await handleMutationError(err);
    }
  }

  async function handleSave(form: Record<string, unknown>): Promise<void> {
    try {
      if (editing) {
        await client.updateCategory(editing.id, form, data?.rev ?? 0);
      } else {
        await client.createCategory(
          form as { id: string; key: string; slug: string },
          data?.rev ?? 0
        );
      }
      setEditing(null);
      setAdding(false);
      setFeedback(editing ? 'Categoría actualizada ✓' : 'Categoría creada ✓');
      await load();
    } catch (err) {
      await handleMutationError(err);
    }
  }

  async function handleSaveGroup(form: Record<string, unknown>): Promise<void> {
    try {
      await client.createNavGroup(
        form as { id: string; display_name?: { default?: string } },
        data?.rev ?? 0
      );
      setAddingGroup(false);
      setFeedback('Grupo creado ✓');
      await load();
    } catch (err) {
      await handleMutationError(err);
    }
  }

  async function handleCreateSub(categoryId: string, form: Record<string, unknown>): Promise<void> {
    try {
      await client.createSubcategory(
        categoryId,
        form as { id: string; title: string; product_key: string; slug: string },
        data?.rev ?? 0
      );
      setAddingSub(null);
      setFeedback('Subcategoría creada ✓');
      await load();
    } catch (err) {
      await handleMutationError(err);
    }
  }

  async function handleUpdateSub(
    categoryId: string,
    subId: string,
    changes: Record<string, unknown>
  ): Promise<void> {
    try {
      await client.updateSubcategory(categoryId, subId, changes, data?.rev ?? 0);
      setEditingSub(null);
      setFeedback('Subcategoría actualizada ✓');
      await load();
    } catch (err) {
      await handleMutationError(err);
    }
  }

  async function handleDeleteSub(categoryId: string, subId: string): Promise<void> {
    try {
      await client.deleteSubcategory(categoryId, subId, data?.rev ?? 0);
      setFeedback('Subcategoría eliminada ✓');
      await load();
    } catch (err) {
      await handleMutationError(err);
    }
  }

  function toggleExpand(catId: string): void {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(catId)) {
        next.delete(catId);
      } else {
        next.add(catId);
      }
      return next;
    });
  }

  if (error) {
    return (
      <main role="main" aria-label="Categorías">
        <h1>Categorías</h1>
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

  const categories = data?.categories ?? [];
  const groups = data?.nav_groups ?? [];

  return (
    <main role="main" aria-label="Categorías">
      <h1>Categorías ({categories.length})</h1>

      {/* Navigation */}
      <nav
        aria-label="Navegación principal"
        style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}
      >
        <a href="/products">Productos</a>
        <a href="/categories" aria-current="page">
          Categorías
        </a>
      </nav>

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
          >
            ×
          </button>
        </div>
      )}

      {loading && <p>Cargando…</p>}

      {/* Nav Groups */}
      <section aria-label="Grupos de navegación" style={{ marginBottom: '1.5rem' }}>
        <h2>
          Grupos ({groups.length})
          <button
            onClick={() => setAddingGroup(true)}
            style={{ marginLeft: '0.5rem', fontSize: '0.9rem', padding: '0.1rem 0.5rem' }}
          >
            + Añadir
          </button>
        </h2>
        {addingGroup && (
          <CategoryForm
            fields={['id', 'display_name']}
            onSave={(form) => {
              void handleSaveGroup(form);
            }}
            onCancel={() => setAddingGroup(false)}
          />
        )}
        {groups.length > 0 && (
          <table
            aria-label="Grupos"
            style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}
          >
            <thead>
              <tr>
                <th style={{ textAlign: 'left', padding: '0.25rem' }}>ID</th>
                <th style={{ textAlign: 'left', padding: '0.25rem' }}>Nombre</th>
                <th style={{ padding: '0.25rem' }}>Activo</th>
                <th style={{ padding: '0.25rem' }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => (
                <tr key={g.id}>
                  <td style={{ padding: '0.25rem' }}>
                    <code>{g.id}</code>
                  </td>
                  <td style={{ padding: '0.25rem' }}>{g.display_name?.default ?? g.id}</td>
                  <td style={{ padding: '0.25rem', textAlign: 'center' }}>
                    {g.active !== false ? '✓' : '✗'}
                  </td>
                  <td style={{ padding: '0.25rem' }}>
                    <button
                      style={{ fontSize: '0.8rem', padding: '0.1rem 0.3rem' }}
                      onClick={() => {
                        void handleDeleteGroup(g.id);
                      }}
                    >
                      Eliminar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* Categories */}
      <section aria-label="Categorías">
        <h2>
          Categorías
          <button
            onClick={() => setAdding(true)}
            style={{ marginLeft: '0.5rem', fontSize: '0.9rem', padding: '0.1rem 0.5rem' }}
          >
            + Añadir
          </button>
        </h2>
        {adding && (
          <CategoryForm
            fields={['id', 'key', 'slug', 'display_name', 'nav_group', 'sort_order']}
            onSave={(form) => {
              void handleSave(form);
            }}
            onCancel={() => setAdding(false)}
          />
        )}
        {editing && (
          <CategoryForm
            product={editing}
            fields={['key', 'slug', 'display_name', 'nav_group', 'sort_order', 'active']}
            onSave={(form) => {
              void handleSave(form);
            }}
            onCancel={() => setEditing(null)}
          />
        )}
        {categories.length === 0 && <p>No hay categorías</p>}
        {categories.length > 0 && (
          <table aria-label="Categorías" style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left', padding: '0.25rem', width: '30px' }}></th>
                <th style={{ textAlign: 'left', padding: '0.25rem' }}>Key</th>
                <th style={{ textAlign: 'left', padding: '0.25rem' }}>Nombre</th>
                <th style={{ textAlign: 'left', padding: '0.25rem' }}>Slug</th>
                <th style={{ padding: '0.25rem' }}>Grupo</th>
                <th style={{ padding: '0.25rem' }}>Orden</th>
                <th style={{ padding: '0.25rem' }}>Activa</th>
                <th style={{ padding: '0.25rem' }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {categories.map((cat) => (
                <React.Fragment key={cat.id}>
                  <tr key={cat.id}>
                    <td style={{ padding: '0.25rem' }}>
                      <button
                        style={{ fontSize: '0.8rem', padding: '0.1rem 0.3rem' }}
                        onClick={() => toggleExpand(cat.id)}
                        aria-label={
                          expandedCategories.has(cat.id)
                            ? 'Colapsar subcategorías'
                            : 'Expandir subcategorías'
                        }
                      >
                        {expandedCategories.has(cat.id) ? '▼' : '▶'}
                      </button>
                    </td>
                    <td style={{ padding: '0.25rem' }}>
                      <code>{cat.key}</code>
                    </td>
                    <td style={{ padding: '0.25rem' }}>{cat.display_name?.default ?? cat.id}</td>
                    <td style={{ padding: '0.25rem' }}>{cat.slug}</td>
                    <td style={{ padding: '0.25rem' }}>{cat.nav_group ?? '—'}</td>
                    <td style={{ padding: '0.25rem' }}>{cat.sort_order}</td>
                    <td style={{ padding: '0.25rem', textAlign: 'center' }}>
                      {cat.active !== false ? '✓' : '✗'}
                    </td>
                    <td style={{ padding: '0.25rem', whiteSpace: 'nowrap' }}>
                      <button
                        style={{ fontSize: '0.8rem', padding: '0.1rem 0.3rem' }}
                        onClick={() => setEditing(cat)}
                      >
                        Editar
                      </button>{' '}
                      <button
                        style={{ fontSize: '0.8rem', padding: '0.1rem 0.3rem' }}
                        onClick={() => {
                          void handleDelete(cat.id);
                        }}
                      >
                        Eliminar
                      </button>
                    </td>
                  </tr>
                  {expandedCategories.has(cat.id) && (
                    <tr key={`${cat.id}-sub`}>
                      <td colSpan={8} style={{ padding: '0.5rem 1rem', background: '#fafafa' }}>
                        <div
                          style={{
                            marginBottom: '0.5rem',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.5rem',
                          }}
                        >
                          <strong>Subcategorías ({(cat.subcategories ?? []).length})</strong>
                          <button
                            style={{ fontSize: '0.8rem', padding: '0.1rem 0.5rem' }}
                            onClick={() => setAddingSub(cat.id)}
                          >
                            + Añadir Subcategoría
                          </button>
                        </div>
                        {addingSub === cat.id && (
                          <SubcategoryForm
                            categoryId={cat.id}
                            onSave={(form) => {
                              void handleCreateSub(cat.id, form);
                            }}
                            onCancel={() => setAddingSub(null)}
                          />
                        )}
                        {editingSub && editingSub.categoryId === cat.id && (
                          <SubcategoryForm
                            categoryId={cat.id}
                            initial={editingSub.subcategory}
                            onSave={(form) => {
                              void handleUpdateSub(cat.id, editingSub.subcategory.id, form);
                            }}
                            onCancel={() => setEditingSub(null)}
                          />
                        )}
                        {(cat.subcategories ?? []).length > 0 ? (
                          <table
                            style={{
                              width: '100%',
                              borderCollapse: 'collapse',
                              fontSize: '0.85rem',
                            }}
                          >
                            <thead>
                              <tr>
                                <th style={{ textAlign: 'left', padding: '0.15rem 0.25rem' }}>
                                  ID
                                </th>
                                <th style={{ textAlign: 'left', padding: '0.15rem 0.25rem' }}>
                                  Title
                                </th>
                                <th style={{ textAlign: 'left', padding: '0.15rem 0.25rem' }}>
                                  Key
                                </th>
                                <th style={{ textAlign: 'left', padding: '0.15rem 0.25rem' }}>
                                  Slug
                                </th>
                                <th style={{ padding: '0.15rem 0.25rem' }}>Orden</th>
                                <th style={{ padding: '0.15rem 0.25rem' }}>Activa</th>
                                <th style={{ padding: '0.15rem 0.25rem' }}>Acciones</th>
                              </tr>
                            </thead>
                            <tbody>
                              {(cat.subcategories ?? []).map((sub) => (
                                <tr key={sub.id}>
                                  <td style={{ padding: '0.15rem 0.25rem' }}>
                                    <code>{sub.id}</code>
                                  </td>
                                  <td style={{ padding: '0.15rem 0.25rem' }}>{sub.title}</td>
                                  <td style={{ padding: '0.15rem 0.25rem' }}>{sub.product_key}</td>
                                  <td style={{ padding: '0.15rem 0.25rem' }}>{sub.slug}</td>
                                  <td style={{ padding: '0.15rem 0.25rem' }}>{sub.order}</td>
                                  <td style={{ padding: '0.15rem 0.25rem', textAlign: 'center' }}>
                                    {sub.enabled ? '✓' : '✗'}
                                  </td>
                                  <td style={{ padding: '0.15rem 0.25rem', whiteSpace: 'nowrap' }}>
                                    <button
                                      style={{ fontSize: '0.7rem', padding: '0.05rem 0.25rem' }}
                                      onClick={() =>
                                        setEditingSub({ categoryId: cat.id, subcategory: sub })
                                      }
                                    >
                                      Editar
                                    </button>{' '}
                                    <button
                                      style={{ fontSize: '0.7rem', padding: '0.05rem 0.25rem' }}
                                      onClick={() => {
                                        void handleDeleteSub(cat.id, sub.id);
                                      }}
                                    >
                                      Eliminar
                                    </button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        ) : (
                          <p style={{ fontSize: '0.85rem', color: '#6c757d' }}>
                            No hay subcategorías
                          </p>
                        )}
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </main>
  );
}

function CategoryForm({
  product,
  fields,
  onSave,
  onCancel,
}: {
  product?: CategoryRecord;
  fields: string[];
  onSave: (data: Record<string, unknown>) => void;
  onCancel: () => void;
}): React.ReactElement {
  const [form, setForm] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const f of fields) {
      if (f === 'id') initial.id = product?.id ?? '';
      if (f === 'key') initial.key = product?.key ?? '';
      if (f === 'slug') initial.slug = product?.slug ?? '';
      if (f === 'display_name') initial.display_name = product?.display_name?.default ?? '';
      if (f === 'nav_group') initial.nav_group = product?.nav_group ?? '';
      if (f === 'sort_order') initial.sort_order = String(product?.sort_order ?? '');
      if (f === 'active') initial.active = product?.active !== false ? 'true' : 'false';
    }
    return initial;
  });

  function handleSubmit(e: React.FormEvent): void {
    e.preventDefault();
    const output: Record<string, unknown> = {};
    for (const f of fields) {
      if (f === 'id') output.id = form.id;
      if (f === 'key') output.key = form.key;
      if (f === 'slug') output.slug = form.slug;
      if (f === 'display_name')
        output.display_name = form.display_name ? { default: form.display_name } : undefined;
      if (f === 'nav_group') output.nav_group = form.nav_group || undefined;
      if (f === 'sort_order') output.sort_order = Number(form.sort_order) || undefined;
      if (f === 'active') output.active = form.active === 'true';
    }
    onSave(output);
  }

  return (
    <form
      onSubmit={handleSubmit}
      style={{
        margin: '0.5rem 0',
        padding: '0.5rem',
        border: '2px solid var(--color-primary)',
        borderRadius: 'var(--radius)',
        display: 'flex',
        gap: '0.5rem',
        flexWrap: 'wrap',
        alignItems: 'center',
      }}
    >
      {fields.map((f) => (
        <label
          key={f}
          style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.85rem' }}
        >
          {f}:
          {f === 'active' ? (
            <select
              value={form.active}
              onChange={(e) => setForm((prev) => ({ ...prev, active: e.target.value }))}
              style={{ padding: '0.15rem' }}
            >
              <option value="true">Sí</option>
              <option value="false">No</option>
            </select>
          ) : (
            <input
              value={form[f] ?? ''}
              onChange={(e) => setForm((prev) => ({ ...prev, [f]: e.target.value }))}
              style={{ padding: '0.15rem 0.3rem', width: f === 'display_name' ? '180px' : '100px' }}
            />
          )}
        </label>
      ))}
      <button type="submit" style={{ padding: '0.15rem 0.5rem', fontSize: '0.85rem' }}>
        Guardar
      </button>
      <button
        type="button"
        onClick={onCancel}
        style={{ padding: '0.15rem 0.5rem', fontSize: '0.85rem' }}
      >
        Cancelar
      </button>
    </form>
  );
}

function SubcategoryForm({
  initial,
  onSave,
  onCancel,
}: {
  categoryId: string;
  initial?: Subcategory;
  onSave: (data: Record<string, unknown>) => void;
  onCancel: () => void;
}): React.ReactElement {
  const [id, setId] = useState(initial?.id ?? '');
  const [title, setTitle] = useState(initial?.title ?? '');
  const [productKey, setProductKey] = useState(initial?.product_key ?? '');
  const [slug, setSlug] = useState(initial?.slug ?? '');
  const [order, setOrder] = useState(String(initial?.order ?? ''));
  const [enabled, setEnabled] = useState(initial?.enabled ?? true);

  function handleSubmit(e: React.FormEvent): void {
    e.preventDefault();
    onSave({
      id,
      title,
      product_key: productKey,
      slug,
      order: Number(order) || 0,
      enabled,
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      style={{
        margin: '0.5rem 0',
        padding: '0.5rem',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius)',
        display: 'flex',
        gap: '0.5rem',
        flexWrap: 'wrap',
        alignItems: 'center',
        fontSize: '0.85rem',
      }}
    >
      <label style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
        ID:
        <input
          required
          value={id}
          onChange={(e) => setId(e.target.value)}
          style={{ padding: '0.15rem 0.3rem', width: '100px' }}
          disabled={!!initial}
        />
      </label>
      <label style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
        Title:
        <input
          required
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          style={{ padding: '0.15rem 0.3rem', width: '120px' }}
        />
      </label>
      <label style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
        Key:
        <input
          required
          value={productKey}
          onChange={(e) => setProductKey(e.target.value)}
          style={{ padding: '0.15rem 0.3rem', width: '100px' }}
        />
      </label>
      <label style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
        Slug:
        <input
          required
          value={slug}
          onChange={(e) => setSlug(e.target.value)}
          style={{ padding: '0.15rem 0.3rem', width: '120px' }}
        />
      </label>
      <label style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
        Orden:
        <input
          type="number"
          value={order}
          onChange={(e) => setOrder(e.target.value)}
          style={{ padding: '0.15rem 0.3rem', width: '60px' }}
        />
      </label>
      <label style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
        Activa:
        <select
          value={enabled ? 'true' : 'false'}
          onChange={(e) => setEnabled(e.target.value === 'true')}
          style={{ padding: '0.15rem' }}
        >
          <option value="true">Sí</option>
          <option value="false">No</option>
        </select>
      </label>
      <button type="submit" style={{ padding: '0.15rem 0.5rem', fontSize: '0.85rem' }}>
        {initial ? 'Actualizar' : 'Crear'}
      </button>
      <button
        type="button"
        onClick={onCancel}
        style={{ padding: '0.15rem 0.5rem', fontSize: '0.85rem' }}
      >
        Cancelar
      </button>
    </form>
  );
}
