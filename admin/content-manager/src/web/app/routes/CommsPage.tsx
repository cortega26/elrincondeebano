import { Feedback } from '../components/Feedback.tsx';
import { ActivityLog } from '../comms/ActivityLog.tsx';
import { ArchivedTemplates } from '../comms/ArchivedTemplates.tsx';
import { BackupPanel } from '../comms/BackupPanel.tsx';
import { ComposerPanel } from '../comms/ComposerPanel.tsx';
import { Destinations } from '../comms/Destinations.tsx';
import { TemplateEditor } from '../comms/TemplateEditor.tsx';
import { TemplatesPanel } from '../comms/TemplatesPanel.tsx';
import { EMPTY_DRAFT, useCommsWorkspace } from '../comms/useCommsWorkspace.ts';

// Plan 217 / ADR 0011: panel operativo de mensajes de WhatsApp. Prepara y
// entrega el mensaje a WhatsApp; el envío final siempre lo hace el operador.

export function CommsPage(): React.ReactElement {
  const ws = useCommsWorkspace();
  const {
    doc,
    loadError,
    reload,
    feedback,
    setFeedback,
    kind,
    setKind,
    draft,
    setDraft,
    editing,
    setEditing,
    busy,
    persist,
    notify,
  } = ws;

  if (loadError) {
    return (
      <main role="main" aria-label="Mensajes">
        <h1>Mensajes</h1>
        <Feedback kind="error">{`No se pudieron cargar los mensajes: ${loadError}`}</Feedback>
        <button type="button" onClick={() => void reload()}>
          Reintentar
        </button>
      </main>
    );
  }
  if (!doc) {
    return (
      <main role="main" aria-label="Mensajes">
        <p aria-live="polite">Cargando…</p>
      </main>
    );
  }

  return (
    <main role="main" aria-label="Mensajes" className="comms">
      <h1>Mensajes de WhatsApp</h1>
      <div aria-live="polite">
        {feedback && (
          <Feedback kind={feedback.kind} onDismiss={() => setFeedback(null)}>
            {feedback.text}
          </Feedback>
        )}
      </div>

      <div className="comms-modes" role="tablist" aria-label="Tipo de mensaje">
        <button
          type="button"
          role="tab"
          aria-selected={kind === 'mensaje'}
          onClick={() => setKind('mensaje')}
        >
          Mensaje nuevo
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={kind === 'respuesta'}
          onClick={() => setKind('respuesta')}
        >
          Responder a vecino
        </button>
      </div>

      <div className="comms-layout">
        <TemplatesPanel ws={ws} />
        <ComposerPanel ws={ws} destinations={doc.destinations} />
      </div>

      {editing && (
        <TemplateEditor
          template={editing}
          isNew={!doc.templates.some((t) => t.id === editing.id)}
          busy={busy}
          onCancel={() => setEditing(null)}
          onSave={async (next) => {
            const saved = await persist(
              (c) => ({
                ...c,
                templates: c.templates.some((t) => t.id === next.id)
                  ? c.templates.map((t) => (t.id === next.id ? next : t))
                  : [next, ...c.templates],
              }),
              'Plantilla guardada.'
            );
            if (saved) setEditing(null);
          }}
          onArchive={async () => {
            const saved = await persist(
              (c) => ({
                ...c,
                templates: c.templates.map((t) =>
                  t.id === editing.id ? { ...t, archived: true, favorite: false } : t
                ),
              }),
              'Plantilla archivada.'
            );
            if (saved) setEditing(null);
          }}
          onDelete={async () => {
            const saved = await persist(
              (c) => ({ ...c, templates: c.templates.filter((t) => t.id !== editing.id) }),
              'Plantilla eliminada.'
            );
            if (saved) {
              setEditing(null);
              if (draft.templateId === editing.id) setDraft(() => EMPTY_DRAFT);
            }
          }}
        />
      )}

      <Destinations
        destinations={doc.destinations}
        busy={busy}
        onAdd={(d) =>
          void persist((c) => ({ ...c, destinations: [...c.destinations, d] }), 'Destino agregado.')
        }
        onRemove={(id) =>
          void persist(
            (c) => ({ ...c, destinations: c.destinations.filter((d) => d.id !== id) }),
            'Destino eliminado.'
          )
        }
      />

      <ArchivedTemplates
        templates={doc.templates.filter((t) => t.archived)}
        onRestore={(id) =>
          void persist(
            (c) => ({
              ...c,
              templates: c.templates.map((t) => (t.id === id ? { ...t, archived: false } : t)),
            }),
            'Plantilla restaurada.'
          )
        }
      />

      <ActivityLog activity={doc.activity} />

      <BackupPanel
        doc={doc}
        busy={busy}
        onImport={async (imported) => {
          await persist((current) => ({ ...imported, rev: current.rev }), 'Respaldo importado.');
        }}
        onError={(text) => notify('error', text)}
      />
    </main>
  );
}

