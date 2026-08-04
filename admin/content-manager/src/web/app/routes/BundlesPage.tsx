import { useState, useEffect } from "react";
import { ContentManagerClient } from "../../api/client.ts";
import type { BundlesResponse } from "../../api/client.ts";

const client = new ContentManagerClient();

interface BundleFormData {
  id: string;
  title: string;
  description: string;
  bundlePrice: string;
  items: string;
}

function emptyForm(): BundleFormData {
  return { id: "", title: "", description: "", bundlePrice: "", items: "[]" };
}

export function BundlesPage(): React.ReactElement {
  const [data, setData] = useState<BundlesResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState<BundleFormData>(emptyForm());
  const [feedback, setFeedback] = useState<string | null>(null);

  const load = async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const result = await client.getBundles();
      setData(result);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  async function handleSave(): Promise<void> {
    try {
      const parsedItems = JSON.parse(form.items) as Array<{ category: string; name: string }>;
      const price = Number(form.bundlePrice) || undefined;

      const bundle: Record<string, unknown> = {
        id: form.id,
        title: form.title,
        description: form.description,
        items: parsedItems,
      };
      if (price !== undefined) {
        bundle.bundlePrice = price;
      }

      const bundles = [...(data?.bundles ?? [])];
      if (editing) {
        const idx = bundles.findIndex((b) => b.id === editing);
        if (idx !== -1) {
          bundles[idx] = bundle as typeof bundles[number];
        }
      } else {
        bundles.push(bundle as typeof bundles[number]);
      }

      await client.updateBundles(bundles);
      setEditing(null);
      setAdding(false);
      setForm(emptyForm());
      setFeedback(editing ? "Combo actualizado ✓" : "Combo creado ✓");
      await load();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function handleDelete(id: string): Promise<void> {
    try {
      const bundles = (data?.bundles ?? []).filter((b) => b.id !== id);
      await client.updateBundles(bundles);
      setFeedback("Combo eliminado ✓");
      await load();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  function startEdit(bundle: BundlesResponse["bundles"][number]): void {
    setEditing(bundle.id);
    setForm({
      id: bundle.id,
      title: bundle.title,
      description: bundle.description,
      bundlePrice: bundle.bundlePrice !== undefined ? String(bundle.bundlePrice) : "",
      items: JSON.stringify(bundle.items, null, 2),
    });
    setAdding(false);
  }

  function startAdd(): void {
    setAdding(true);
    setForm(emptyForm());
    setEditing(null);
  }

  if (error) {
    return (
      <main role="main" aria-label="Combos">
        <h1>Combos</h1>
        <p role="alert">{error}</p>
        <button onClick={() => { setError(null); void load(); }}>Reintentar</button>
      </main>
    );
  }

  const bundles = data?.bundles ?? [];

  return (
    <main role="main" aria-label="Combos">
      <h1>Combos ({bundles.length})</h1>

      <nav aria-label="Navegación principal" style={{ display: "flex", gap: "1rem", marginBottom: "1rem" }}>
        <a href="/products">Productos</a>
        <a href="/categories">Categorías</a>
        <a href="/bundles" aria-current="page">Combos</a>
      </nav>

      {feedback && (
        <div role="status" aria-live="polite" style={{ background: "#e8f5e9", padding: "0.5rem", marginBottom: "0.5rem", borderRadius: "var(--radius)" }}>
          {feedback}
          <button onClick={() => setFeedback(null)} style={{ marginLeft: "0.5rem", background: "none", border: "none", cursor: "pointer" }}>×</button>
        </div>
      )}

      {loading && <p>Cargando…</p>}

      <button onClick={startAdd} style={{ marginBottom: "1rem", padding: "0.3rem 0.8rem" }}>+ Añadir combo</button>

      {(adding || editing) && (
        <form
          onSubmit={(e) => { e.preventDefault(); void handleSave(); }}
          style={{ margin: "0.5rem 0 1.5rem", padding: "0.75rem", border: "2px solid var(--color-primary)", borderRadius: "var(--radius)" }}
        >
          <h3 style={{ margin: "0 0 0.5rem" }}>{editing ? "Editar combo" : "Nuevo combo"}</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            <label style={{ fontSize: "0.85rem" }}>
              ID:
              <input
                value={form.id}
                onChange={(e) => setForm((prev) => ({ ...prev, id: e.target.value }))}
                disabled={!!editing}
                style={{ display: "block", width: "100%", padding: "0.15rem 0.3rem", marginTop: "0.15rem" }}
              />
            </label>
            <label style={{ fontSize: "0.85rem" }}>
              Título:
              <input
                value={form.title}
                onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
                style={{ display: "block", width: "100%", padding: "0.15rem 0.3rem", marginTop: "0.15rem" }}
              />
            </label>
            <label style={{ fontSize: "0.85rem" }}>
              Descripción:
              <textarea
                value={form.description}
                onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
                rows={2}
                style={{ display: "block", width: "100%", padding: "0.15rem 0.3rem", marginTop: "0.15rem", resize: "vertical" }}
              />
            </label>
            <label style={{ fontSize: "0.85rem" }}>
              Precio (opcional):
              <input
                type="number"
                value={form.bundlePrice}
                onChange={(e) => setForm((prev) => ({ ...prev, bundlePrice: e.target.value }))}
                style={{ display: "block", width: "100%", padding: "0.15rem 0.3rem", marginTop: "0.15rem" }}
              />
            </label>
            <label style={{ fontSize: "0.85rem" }}>
              Productos (JSON):
              <textarea
                value={form.items}
                onChange={(e) => setForm((prev) => ({ ...prev, items: e.target.value }))}
                rows={4}
                style={{ display: "block", width: "100%", padding: "0.15rem 0.3rem", marginTop: "0.15rem", resize: "vertical", fontFamily: "monospace" }}
                placeholder='[{"category": "cat-1", "name": "Producto Uno"}]'
              />
            </label>
          </div>
          <div style={{ marginTop: "0.5rem", display: "flex", gap: "0.5rem" }}>
            <button type="submit" style={{ padding: "0.2rem 0.6rem" }}>Guardar</button>
            <button type="button" onClick={() => { setAdding(false); setEditing(null); setForm(emptyForm()); }} style={{ padding: "0.2rem 0.6rem" }}>Cancelar</button>
          </div>
        </form>
      )}

      {bundles.length === 0 && !loading && <p>No hay combos</p>}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: "1rem" }}>
        {bundles.map((bundle) => (
          <div
            key={bundle.id}
            style={{ border: "1px solid #ddd", borderRadius: "var(--radius)", padding: "1rem", background: "#fafafa" }}
          >
            <h3 style={{ margin: "0 0 0.25rem" }}>{bundle.title}</h3>
            <code style={{ fontSize: "0.8rem", color: "#666" }}>{bundle.id}</code>
            <p style={{ fontSize: "0.85rem", margin: "0.5rem 0" }}>{bundle.description}</p>
            {bundle.bundlePrice !== undefined && bundle.bundlePrice > 0 && (
              <p style={{ fontSize: "0.9rem", fontWeight: "bold", margin: "0.25rem 0" }}>
                Precio: ${bundle.bundlePrice}
              </p>
            )}
            <details style={{ fontSize: "0.8rem", margin: "0.5rem 0" }}>
              <summary>Productos ({bundle.items.length})</summary>
              <ul style={{ margin: "0.25rem 0", paddingLeft: "1.2rem" }}>
                {bundle.items.map((item, idx) => (
                  <li key={idx}>
                    {item.name} <span style={{ color: "#999" }}>({item.category})</span>
                  </li>
                ))}
              </ul>
            </details>
            <div style={{ marginTop: "0.5rem", display: "flex", gap: "0.5rem" }}>
              <button style={{ fontSize: "0.8rem", padding: "0.15rem 0.5rem" }} onClick={() => startEdit(bundle)}>Editar</button>
              <button style={{ fontSize: "0.8rem", padding: "0.15rem 0.5rem" }} onClick={() => { void handleDelete(bundle.id); }}>Eliminar</button>
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
