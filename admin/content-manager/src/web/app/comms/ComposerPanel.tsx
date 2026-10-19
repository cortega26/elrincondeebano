import { canCopyImage } from './handoff.ts';
import { ProductPicker } from './ProductPicker.tsx';
import { ShareButton } from './ShareButton.tsx';
import { ADHOC_ID, relativeTime, type CommsWorkspace } from './useCommsWorkspace.ts';
import { KNOWN_VARIABLES, formatPhone, normalizePhone } from '../../../shared/comms.ts';
import {
  COMMS_STATUS_LABELS,
  type CommsDestination,
} from '../../../shared/schemas/comms.ts';

export function ComposerPanel({
  ws,
  destinations,
}: {
  ws: CommsWorkspace;
  destinations: CommsDestination[];
}): React.ReactElement {
  const {
    template,
    draft,
    setDraft,
    product,
    setProduct,
    stockChecked,
    setStockChecked,
    needsStockCheck,
    variables,
    autoValues,
    rendered,
    imageOptions,
    selectedImages,
    setSelectedImages,
    chosenImages,
    destination,
    repeat,
    repeatAck,
    setRepeatAck,
    blockers,
    ready,
    busy,
    blockedUrl,
    pendingConfirm,
    setPendingConfirm,
    handleOpenChat,
    handleShare,
    handleCopyText,
    handleCopyImage,
    handleDownloadImage,
    handleConfirmSent,
    handleOwnImage,
    removeOwnImage,
  } = ws;

  return (
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
              {destinations.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.kind === 'grupo' ? `👥 ${d.alias}` : `${d.alias} · ${formatPhone(d.phone)}`}
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
                    {!(KNOWN_VARIABLES as readonly string[]).includes(name) && ' (personalizada)'}
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
              onChange={(e) => setDraft((prev) => ({ ...prev, text: e.target.value, edited: true }))}
            />
            {draft.edited && (
              <button
                type="button"
                onClick={() => setDraft((prev) => ({ ...prev, text: template.body, edited: false }))}
              >
                Volver al texto de la plantilla
              </button>
            )}
          </details>

          <div className="comms-images">
            <span>Imágenes</span>
            {imageOptions.length === 0 && (
              <p className="comms-hint">Sin imágenes: elige un producto o adjunta una propia.</p>
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
            <button type="button" disabled={!ready || busy} onClick={() => void handleCopyText()}>
              Copiar mensaje
            </button>
          </div>
          {chosenImages.length > 0 && destination?.kind === 'contacto' && (
            <p className="comms-hint">
              Texto + imagen en escritorio: «Copiar imagen», luego «Abrir chat con mensaje» y pega
              la imagen (Ctrl+V) antes de Enviar.
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
  );
}
