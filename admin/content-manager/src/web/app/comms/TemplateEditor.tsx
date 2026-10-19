import { useState } from 'react';
import { ProductImage, normalizeImagePath } from '../components/ProductImage.tsx';
import { COMMS_CATEGORIES, COMMS_CATEGORY_LABELS } from '../../../shared/comms-meta.ts';
import type { CommsTemplate } from '../../../shared/schemas/comms.ts';
import { KNOWN_VARIABLES } from '../../../shared/comms.ts';
import { ProductPicker } from './ProductPicker.tsx';
import type { Kind } from './useCommsWorkspace.ts';

export function TemplateEditor({
  template,
  isNew,
  busy,
  onCancel,
  onSave,
  onArchive,
  onDelete,
}: {
  template: CommsTemplate;
  isNew: boolean;
  busy: boolean;
  onCancel: () => void;
  onSave: (t: CommsTemplate) => Promise<void>;
  onArchive: () => Promise<void>;
  onDelete: () => Promise<void>;
}): React.ReactElement {
  const [form, setForm] = useState(template);
  const [tags, setTags] = useState(template.tags.join(', '));
  const [confirmDelete, setConfirmDelete] = useState(false);
  const invalid = !form.title.trim() || !form.body.trim();

  return (
    <section className="comms-editor" aria-label={isNew ? 'Nueva plantilla' : 'Editar plantilla'}>
      <h2>{isNew ? 'Nueva plantilla' : 'Editar plantilla'}</h2>
      <label className="comms-field">
        <span>Título</span>
        <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
      </label>
      <div className="comms-row">
        <label className="comms-field">
          <span>Tipo</span>
          <select
            value={form.kind}
            onChange={(e) => setForm({ ...form, kind: e.target.value as Kind })}
          >
            <option value="mensaje">Mensaje (difusión)</option>
            <option value="respuesta">Respuesta a vecino</option>
          </select>
        </label>
        <label className="comms-field">
          <span>Categoría</span>
          <select
            value={form.category}
            onChange={(e) =>
              setForm({ ...form, category: e.target.value as CommsTemplate['category'] })
            }
          >
            {COMMS_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {COMMS_CATEGORY_LABELS[c]}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="comms-field">
        <span>Texto — variables: {KNOWN_VARIABLES.map((v) => `{${v}}`).join(' ')}</span>
        <textarea
          rows={5}
          value={form.body}
          onChange={(e) => setForm({ ...form, body: e.target.value })}
        />
      </label>
      <label className="comms-field">
        <span>Etiquetas (separadas por coma)</span>
        <input value={tags} onChange={(e) => setTags(e.target.value)} />
      </label>
      {form.images.length > 0 && (
        <ul className="comms-editor-images" aria-label="Imágenes de la plantilla">
          {form.images.map((path) => (
            <li key={path}>
              <ProductImage mediaPath={path} alt="" style={{ width: 48, height: 48 }} />
              <button
                type="button"
                onClick={() => setForm({ ...form, images: form.images.filter((p) => p !== path) })}
              >
                Quitar
              </button>
            </li>
          ))}
        </ul>
      )}
      <ProductPicker
        product={null}
        onChange={(p) => {
          const path = normalizeImagePath(p?.image_path);
          if (path && !form.images.includes(path)) {
            setForm({ ...form, images: [...form.images, path] });
          }
        }}
      />
      <p className="comms-hint">Elegir un producto aquí asocia su foto real a la plantilla.</p>
      <div className="comms-actions">
        <button
          type="button"
          className="btn--primary"
          disabled={invalid || busy}
          onClick={() =>
            void onSave({
              ...form,
              title: form.title.trim(),
              body: form.body.trim(),
              tags: tags
                .split(',')
                .map((t) => t.trim())
                .filter(Boolean)
                .slice(0, 20),
              updated_at: new Date().toISOString(),
            })
          }
        >
          Guardar
        </button>
        <button type="button" onClick={onCancel}>
          Cancelar
        </button>
        {!isNew && !form.archived && (
          <button type="button" disabled={busy} onClick={() => void onArchive()}>
            Archivar
          </button>
        )}
        {!isNew &&
          (confirmDelete ? (
            <>
              <button type="button" className="btn--danger" onClick={() => void onDelete()}>
                Confirmar eliminación
              </button>
              <button type="button" onClick={() => setConfirmDelete(false)}>
                No eliminar
              </button>
            </>
          ) : (
            <button type="button" className="btn--danger" onClick={() => setConfirmDelete(true)}>
              Eliminar
            </button>
          ))}
      </div>
    </section>
  );
}
