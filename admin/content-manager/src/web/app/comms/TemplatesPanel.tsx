import { newId } from '../../../shared/comms.ts';
import { COMMS_CATEGORY_LABELS } from '../../../shared/schemas/comms.ts';
import type { CommsWorkspace } from './useCommsWorkspace.ts';

export function TemplatesPanel({ ws }: { ws: CommsWorkspace }): React.ReactElement {
  const { searchRef, query, setQuery, list, kind, draft, setEditing, selectTemplate, persist } =
    ws;

  return (
    <section aria-label="Plantillas" className="comms-library">
      <div className="comms-search">
        <input
          ref={searchRef}
          type="search"
          placeholder="Buscar (atajo: /)"
          aria-label="Buscar plantillas"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && list[0]) selectTemplate(list[0]);
          }}
        />
        <button
          type="button"
          onClick={() =>
            setEditing({
              id: newId('tpl'),
              kind,
              title: '',
              body: '',
              category: kind === 'mensaje' ? 'promociones' : 'disponibilidad',
              tags: [],
              images: [],
              favorite: false,
              archived: false,
              updated_at: new Date().toISOString(),
            })
          }
        >
          + Nueva
        </button>
      </div>
      <ul className="comms-cards" aria-label="Lista de plantillas">
        {list.length === 0 && <li className="comms-empty">Sin resultados.</li>}
        {list.map((t) => (
          <li
            key={t.id}
            className={t.id === draft.templateId ? 'comms-card is-selected' : 'comms-card'}
          >
            <div className="comms-card-head">
              <strong>{t.title}</strong>
              <span className="comms-chip">{COMMS_CATEGORY_LABELS[t.category]}</span>
            </div>
            <p className="comms-card-body">{t.body}</p>
            <div className="comms-card-actions">
              <button type="button" className="btn--primary" onClick={() => selectTemplate(t)}>
                Usar
              </button>
              <button
                type="button"
                aria-label={
                  t.favorite
                    ? `Quitar ${t.title} de favoritos`
                    : `Marcar ${t.title} como favorito`
                }
                aria-pressed={t.favorite}
                onClick={() =>
                  void persist((c) => ({
                    ...c,
                    templates: c.templates.map((x) =>
                      x.id === t.id ? { ...x, favorite: !x.favorite } : x
                    ),
                  }))
                }
              >
                {t.favorite ? '★' : '☆'}
              </button>
              <button type="button" onClick={() => setEditing(t)}>
                Editar
              </button>
              <button
                type="button"
                onClick={() =>
                  setEditing({
                    ...t,
                    id: newId('tpl'),
                    title: `${t.title} (copia)`,
                    favorite: false,
                    last_used_at: undefined,
                  })
                }
              >
                Duplicar
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
