import { Feedback } from '../components/Feedback.tsx';
import { COMMS_CATEGORY_LABELS, COMMS_STATUS_LABELS } from '../../../shared/schemas/comms.ts';
import { KNOWN_VARIABLES, formatPhone, newId, normalizePhone } from '../../../shared/comms.ts';
import { canCopyImage } from '../comms/handoff.ts';
import { ActivityLog } from '../comms/ActivityLog.tsx';
import { ArchivedTemplates } from '../comms/ArchivedTemplates.tsx';
import { BackupPanel } from '../comms/BackupPanel.tsx';
import { Destinations } from '../comms/Destinations.tsx';
import { ProductPicker } from '../comms/ProductPicker.tsx';
import { ShareButton } from '../comms/ShareButton.tsx';
import { TemplateEditor } from '../comms/TemplateEditor.tsx';
import {
  ADHOC_ID,
  EMPTY_DRAFT,
  relativeTime,
  useCommsWorkspace,
} from '../comms/useCommsWorkspace.ts';

// Plan 217 / ADR 0011: panel operativo de mensajes de WhatsApp. Prepara y
// entrega el mensaje a WhatsApp; el envío final siempre lo hace el operador.

export function CommsPage(): React.ReactElement {
  const {
    doc,
    loadError,
    reload,
    feedback,
    setFeedback,
    kind,
    setKind,
    query,
    setQuery,
    searchRef,
    draft,
    setDraft,
    product,
    setProduct,
    stockChecked,
    setStockChecked,
    selectedImages,
    setSelectedImages,
    repeatAck,
    setRepeatAck,
    pendingConfirm,
    setPendingConfirm,
    blockedUrl,
    editing,
    setEditing,
    busy,
    template,
    destination,
    autoValues,
    rendered,
    variables,
    imageOptions,
    chosenImages,
    needsStockCheck,
    blockers,
    ready,
    repeat,
    list,
    selectTemplate,
    persist,
    notify,
    handleOpenChat,
    handleShare,
    handleCopyText,
    handleCopyImage,
    handleDownloadImage,
    handleConfirmSent,
    handleOwnImage,
    removeOwnImage,
  } = useCommsWorkspace();

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

        <section aria-label="Preparar mensaje" className="comms-composer">
          {!template ? (
            <p className="comms-empty">Elige un mensaje de la lista para prepararlo.</p>
          ) : (
            <>
              <h2>{template.title}</h2>

              <label className="comms-field">
                <span>Destino</span>
                <select
                  aria-label="Destino"
                  value={draft.destinationId ?? ''}
                  onChange={(e) =>
                    setDraft((prev) => ({ ...prev, destinationId: e.target.value || null }))
                  }
                >
                  <option value="">— Elige destino —</option>
                  {doc.destinations.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.kind === 'grupo'
                        ? `👥 ${d.alias}`
                        : `${d.alias} · ${formatPhone(d.phone)}`}
                    </option>
                  ))}
                  <option value={ADHOC_ID}>Pegar un número…</option>
                </select>
              </label>
              {draft.destinationId === ADHOC_ID && (
                <label className="comms-field">
                  <span>Número (ej. +56 9 1234 5678)</span>
                  <input
                    type="tel"
                    inputMode="tel"
                    value={draft.adhocPhone}
                    aria-invalid={Boolean(draft.adhocPhone) && !normalizePhone(draft.adhocPhone)}
                    onChange={(e) => setDraft((prev) => ({ ...prev, adhocPhone: e.target.value }))}
                  />
                </label>
              )}

              <ProductPicker
                product={product}
                onChange={(p) => {
                  setProduct(p);
                  setStockChecked(false);
                }}
              />
              {product && needsStockCheck && (
                <label className="comms-check">
                  <input
                    type="checkbox"
                    checked={stockChecked}
                    onChange={(e) => setStockChecked(e.target.checked)}
                  />
                  Revisé que hay stock real de «{product.name}»
                  {product.stock ? '' : ' (el catálogo lo marca sin stock)'}
                </label>
              )}

              {variables.length > 0 && (
                <fieldset className="comms-vars">
                  <legend>Variables</legend>
                  {variables.map((name) => (
                    <label key={name} className="comms-field">
                      <span>
                        {`{${name}}`}
                        {!(KNOWN_VARIABLES as readonly string[]).includes(name) &&
                          ' (personalizada)'}
                      </span>
                      <input
                        type="text"
                        value={draft.values[name] ?? ''}
                        placeholder={autoValues[name] ?? ''}
                        aria-invalid={rendered.missing.includes(name)}
                        onChange={(e) =>
                          setDraft((prev) => ({
                            ...prev,
                            values: { ...prev.values, [name]: e.target.value },
                          }))
                        }
                      />
                    </label>
                  ))}
                </fieldset>
              )}

              <details className="comms-edit" open={draft.edited}>
                <summary>Editar antes de enviar</summary>
                <textarea
                  aria-label="Texto del mensaje"
                  rows={5}
                  value={draft.edited ? draft.text : template.body}
                  onChange={(e) =>
                    setDraft((prev) => ({ ...prev, text: e.target.value, edited: true }))
                  }
                />
                {draft.edited && (
                  <button
                    type="button"
                    onClick={() =>
                      setDraft((prev) => ({ ...prev, text: template.body, edited: false }))
                    }
                  >
                    Volver al texto de la plantilla
                  </button>
                )}
              </details>

              <div className="comms-images">
                <span>Imágenes</span>
                {imageOptions.length === 0 && (
                  <p className="comms-hint">
                    Sin imágenes: elige un producto o adjunta una propia.
                  </p>
                )}
                <ul>
                  {imageOptions.map((option) => (
                    <li key={option.key}>
                      <label>
                        <input
                          type="checkbox"
                          checked={selectedImages.includes(option.key)}
                          onChange={(e) =>
                            setSelectedImages((prev) =>
                              e.target.checked
                                ? [...prev, option.key]
                                : prev.filter((k) => k !== option.key)
                            )
                          }
                        />
                        <img src={option.src} alt={option.label} width={96} height={96} />
                      </label>
                      <div>
                        {canCopyImage() && (
                          <button type="button" onClick={() => void handleCopyImage(option)}>
                            Copiar imagen
                          </button>
                        )}
                        <button type="button" onClick={() => void handleDownloadImage(option)}>
                          Descargar
                        </button>
                        {option.blob && (
                          <button type="button" onClick={() => removeOwnImage(option)}>
                            Quitar
                          </button>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
                <label className="comms-upload">
                  Adjuntar imagen propia
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    multiple
                    onChange={handleOwnImage}
                  />
                </label>
              </div>

              <div className="comms-preview" aria-label="Vista previa">
                <div className="comms-preview-dest">
                  Para:{' '}
                  <strong data-testid="comms-destination">
                    {destination
                      ? destination.kind === 'grupo'
                        ? `${destination.alias} (lo eliges en WhatsApp)`
                        : `${destination.alias} · ${formatPhone(destination.phone)}`
                      : 'sin destino'}
                  </strong>
                </div>
                <pre data-testid="comms-preview-text">{rendered.text}</pre>
                {chosenImages.length > 0 && (
                  <p className="comms-hint">
                    + {chosenImages.length} imagen(es). El enlace de chat no adjunta imágenes.
                  </p>
                )}
              </div>

              {repeat && (
                <label className="comms-check comms-warn">
                  <input
                    type="checkbox"
                    checked={repeatAck}
                    onChange={(e) => setRepeatAck(e.target.checked)}
                  />
                  Este mismo texto ya fue a este destino el {relativeTime(repeat.at)} (
                  {COMMS_STATUS_LABELS[repeat.status]}). Enviar de todos modos.
                </label>
              )}

              {blockers.length > 0 && (
                <ul className="comms-blockers" role="alert">
                  {blockers.map((b) => (
                    <li key={b}>{b}</li>
                  ))}
                </ul>
              )}

              <div className="comms-actions">
                <button
                  type="button"
                  className="btn--primary"
                  disabled={!ready || busy}
                  onClick={() => void handleOpenChat()}
                >
                  {destination?.kind === 'grupo'
                    ? 'Abrir WhatsApp y elegir el grupo'
                    : 'Abrir chat con mensaje'}
                </button>
                {chosenImages.length > 0 && (
                  <ShareButton
                    disabled={!ready || busy}
                    onShare={() => void handleShare()}
                    count={chosenImages.length}
                  />
                )}
                <button
                  type="button"
                  disabled={!ready || busy}
                  onClick={() => void handleCopyText()}
                >
                  Copiar mensaje
                </button>
              </div>
              {chosenImages.length > 0 && destination?.kind === 'contacto' && (
                <p className="comms-hint">
                  Texto + imagen en escritorio: «Copiar imagen», luego «Abrir chat con mensaje» y
                  pega la imagen (Ctrl+V) antes de Enviar.
                </p>
              )}
              {blockedUrl && (
                <p>
                  <a href={blockedUrl} target="_blank" rel="noopener noreferrer">
                    Abrir WhatsApp
                  </a>
                </p>
              )}
              {pendingConfirm && (
                <div className="comms-confirm">
                  <span>¿Ya lo enviaste en WhatsApp?</span>
                  <button
                    type="button"
                    className="btn--primary"
                    onClick={() => void handleConfirmSent()}
                  >
                    Sí, marcar como enviado
                  </button>
                  <button type="button" onClick={() => setPendingConfirm(null)}>
                    No
                  </button>
                </div>
              )}
            </>
          )}
        </section>
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

