import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ContentManagerClient, type ProductResponse } from '../../api/client.ts';
import { ApiRequestError } from '../../api/requestCore.ts';
import { Feedback, type FeedbackKind } from '../components/Feedback.tsx';
import { normalizeImagePath } from '../components/ProductImage.tsx';
import {
  COMMS_CATEGORIES,
  COMMS_CATEGORY_LABELS,
  COMMS_STATUS_LABELS,
  type CommsActivity,
  type CommsDestination,
  type CommsDocument,
  type CommsTemplate,
} from '../../../shared/schemas/comms.ts';
import {
  KNOWN_VARIABLES,
  buildWhatsAppUrl,
  extractVariables,
  findRecentRepeat,
  formatPhone,
  newId,
  normalizePhone,
  productVariables,
  renderTemplate,
  searchTemplates,
  textHash,
  todayLabel,
  type VariableValues,
} from '../../../shared/comms.ts';
import {
  canCopyImage,
  convertImage,
  copyImage,
  copyText,
  downloadBlob,
  fetchImage,
  openWhatsApp,
  safeFileName,
  shareWithFiles,
  validateOwnImage,
} from '../comms/handoff.ts';
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
  errorMessage,
  loadDraft,
  relativeTime,
  saveDraft,
  stripEmpty,
  type Draft,
  type ImageOption,
  type Kind,
} from '../comms/useCommsWorkspace.ts';

// Plan 217 / ADR 0011: panel operativo de mensajes de WhatsApp. Prepara y
// entrega el mensaje a WhatsApp; el envío final siempre lo hace el operador.

const client = new ContentManagerClient();

export function CommsPage(): React.ReactElement {
  const [doc, setDoc] = useState<CommsDocument | null>(null);
  // Espejo síncrono del documento: persist rebasa sobre el último estado
  // guardado y no sobre el de un render viejo (plan 230).
  const docRef = useRef<CommsDocument | null>(null);
  const applyDoc = useCallback((next: CommsDocument | null): void => {
    docRef.current = next;
    setDoc(next);
  }, []);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ kind: FeedbackKind; text: string } | null>(null);
  const [kind, setKind] = useState<Kind>('mensaje');
  const [query, setQuery] = useState('');
  const [draft, setDraftState] = useState<Draft>(loadDraft);
  const [product, setProduct] = useState<ProductResponse | null>(null);
  const [stockChecked, setStockChecked] = useState(false);
  const [ownImages, setOwnImages] = useState<ImageOption[]>([]);
  const [selectedImages, setSelectedImages] = useState<string[]>([]);
  const [repeatAck, setRepeatAck] = useState(false);
  const [pendingConfirm, setPendingConfirm] = useState<CommsActivity | null>(null);
  const [blockedUrl, setBlockedUrl] = useState<string | null>(null);
  const [editing, setEditing] = useState<CommsTemplate | null>(null);
  const [busy, setBusy] = useState(false);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const ownImagesRef = useRef<ImageOption[]>([]);

  const setDraft = useCallback((update: (prev: Draft) => Draft) => {
    setDraftState((prev) => {
      const next = update(prev);
      saveDraft(next);
      return next;
    });
  }, []);

  const notify = useCallback(
    (kindValue: FeedbackKind, text: string): void => setFeedback({ kind: kindValue, text }),
    []
  );

  const reload = useCallback(async () => {
    try {
      applyDoc(await client.getComms());
      setLoadError(null);
    } catch (err) {
      setLoadError(errorMessage(err));
    }
  }, [applyDoc]);

  useEffect(() => {
    void reload();
  }, [reload]);

  // Atajo: "/" enfoca el buscador (fuera de campos de texto).
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      const target = event.target as HTMLElement | null;
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;
      if (event.key === '/') {
        event.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  /** Aplica un cambio al documento y lo guarda (concurrencia optimista). */
  const persist = useCallback(
    async (mutate: (current: CommsDocument) => CommsDocument, success?: string) => {
      const current = docRef.current;
      if (!current) return null;
      setBusy(true);
      try {
        const saved = await client.saveComms(mutate(current), current.rev);
        applyDoc(saved);
        if (success) notify('success', success);
        return saved;
      } catch (err) {
        notify('error', errorMessage(err));
        if (err instanceof ApiRequestError && err.status === 409) await reload();
        return null;
      } finally {
        setBusy(false);
      }
    },
    [applyDoc, reload, notify]
  );

  const template = doc?.templates.find((t) => t.id === draft.templateId) ?? null;
  const destination: CommsDestination | null = useMemo(() => {
    if (!doc) return null;
    if (draft.destinationId === ADHOC_ID) {
      const phone = normalizePhone(draft.adhocPhone);
      return phone
        ? { id: ADHOC_ID, kind: 'contacto', alias: formatPhone(phone), name: '', phone }
        : null;
    }
    return doc.destinations.find((d) => d.id === draft.destinationId) ?? null;
  }, [doc, draft.destinationId, draft.adhocPhone]);

  const variables = template ? extractVariables(draft.edited ? draft.text : template.body) : [];
  const autoValues: VariableValues = useMemo(() => {
    const values: VariableValues = { fecha: todayLabel() };
    if (product) Object.assign(values, productVariables(product));
    if (destination?.kind === 'contacto' && destination.name) {
      values.nombre = destination.name.split(' ')[0];
    }
    return values;
  }, [product, destination]);
  const values: VariableValues = { ...autoValues, ...stripEmpty(draft.values) };
  const rendered = template
    ? renderTemplate(draft.edited ? draft.text : template.body, values)
    : { text: '', missing: [] };
  const finalText = rendered.text.trim();
  const hash = textHash(finalText);
  // Los números pegados (ad-hoc) se guardan sin id: se buscan como destino
  // null para que el aviso de repetición también cubra ese caso (plan 230).
  const repeatDestinationId = destination && destination.id !== ADHOC_ID ? destination.id : null;
  const repeat =
    doc && destination ? findRecentRepeat(doc.activity, repeatDestinationId, hash) : null;

  const imageOptions: ImageOption[] = useMemo(() => {
    const options: ImageOption[] = [];
    const seen = new Set<string>();
    const addCatalog = (path: string | undefined, label: string): void => {
      const normalized = normalizeImagePath(path);
      if (!normalized || seen.has(normalized)) return;
      seen.add(normalized);
      options.push({ key: normalized, label, src: `/${normalized}` });
    };
    if (product) addCatalog(product.image_path, product.name);
    template?.images.forEach((path) => addCatalog(path, 'Imagen de la plantilla'));
    return [...options, ...ownImages];
  }, [product, template, ownImages]);

  // Selección por defecto: todas las imágenes reales disponibles.
  useEffect(() => {
    setSelectedImages(imageOptions.map((o) => o.key));
  }, [imageOptions]);

  // Plan 230: los object URL de imágenes propias se revocan al quitarlas
  // (handler) y al desmontar la página; el ref guarda la lista más reciente.
  useEffect(() => {
    ownImagesRef.current = ownImages;
  }, [ownImages]);
  useEffect(
    () => () => {
      for (const image of ownImagesRef.current) URL.revokeObjectURL(image.src);
    },
    []
  );

  useEffect(() => {
    setRepeatAck(false);
  }, [hash, destination?.id]);

  const chosenImages = imageOptions.filter((o) => selectedImages.includes(o.key));
  // Solo la difusión exige verificar stock (una respuesta «no disponible» no).
  const needsStockCheck = Boolean(product) && template?.kind === 'mensaje';
  const blockers: string[] = [];
  if (!template) blockers.push('Elige un mensaje');
  if (!destination) blockers.push('Elige el destino');
  if (rendered.missing.length) {
    blockers.push(`Completa: ${rendered.missing.map((v) => `{${v}}`).join(', ')}`);
  }
  if (needsStockCheck && !stockChecked) blockers.push('Confirma que el producto está disponible');
  if (repeat && !repeatAck) blockers.push('Confirma el reenvío de un mensaje repetido');
  const ready = blockers.length === 0;

  const selectTemplate = (t: CommsTemplate): void => {
    setDraft((prev) => ({ ...prev, templateId: t.id, text: t.body, edited: false, values: {} }));
    setPendingConfirm(null);
    setBlockedUrl(null);
    if (t.kind !== kind) setKind(t.kind);
  };

  const logActivity = async (status: CommsActivity['status']): Promise<CommsActivity | null> => {
    if (!template || !destination) return null;
    const entry: CommsActivity = {
      id: newId('act'),
      at: new Date().toISOString(),
      template_id: template.id,
      template_title: template.title,
      // Los números pegados al momento no se guardan en el historial.
      destination_id: destination.id === ADHOC_ID ? null : destination.id,
      destination_alias: destination.id === ADHOC_ID ? 'Número pegado' : destination.alias,
      status,
      text_hash: hash,
    };
    const saved = await persist((current) => ({
      ...current,
      activity: [entry, ...current.activity].slice(0, 500),
      templates: current.templates.map((t) =>
        t.id === template.id ? { ...t, last_used_at: entry.at } : t
      ),
    }));
    return saved ? entry : null;
  };

  const buildFiles = async (type: 'image/jpeg' | 'image/png'): Promise<File[]> => {
    const files: File[] = [];
    for (const option of chosenImages) {
      const source = option.blob ?? (await fetchImage(option.src));
      const converted = await convertImage(source, type);
      const ext = type === 'image/png' ? 'png' : 'jpg';
      files.push(new File([converted], safeFileName(option.label, ext), { type }));
    }
    return files;
  };

  const handleOpenChat = async (): Promise<void> => {
    if (!ready || !destination) return;
    const url = buildWhatsAppUrl(
      finalText,
      destination.kind === 'contacto' ? destination.phone : null
    );
    const opened = openWhatsApp(url);
    if (!opened) {
      setBlockedUrl(url);
      notify('error', 'El navegador bloqueó la ventana. Usa el enlace «Abrir WhatsApp» de abajo.');
      return;
    }
    setBlockedUrl(null);
    const entry = await logActivity('chat_abierto');
    setPendingConfirm(entry);
    notify(
      'info',
      destination.kind === 'grupo'
        ? 'WhatsApp abierto: elige el grupo, revisa el texto y pulsa Enviar.'
        : 'Chat abierto con el texto listo: revísalo y pulsa Enviar en WhatsApp.'
    );
  };

  const handleShare = async (): Promise<void> => {
    if (!ready) return;
    setBusy(true);
    try {
      const files = await buildFiles('image/jpeg');
      const outcome = await shareWithFiles(finalText, files);
      if (outcome === 'compartir_iniciado') {
        const entry = await logActivity('compartir_iniciado');
        setPendingConfirm(entry);
        notify('info', 'Compartir iniciado. Confirma abajo solo cuando lo hayas enviado.');
      } else if (outcome === 'cancelado') {
        notify('info', 'Compartir cancelado; no se registró nada.');
      } else {
        notify(
          'error',
          'Este navegador no puede compartir imágenes. Usa «Copiar imagen» o «Descargar imagen» y «Abrir chat».'
        );
      }
    } catch (err) {
      notify('error', errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const handleCopyText = async (): Promise<void> => {
    if (!ready) return;
    if (await copyText(finalText)) {
      await logActivity('preparado');
      notify('success', 'Mensaje copiado. Pégalo en WhatsApp.');
    } else {
      notify('error', 'No se pudo copiar; selecciona el texto de la vista previa y cópialo.');
    }
  };

  const handleCopyImage = async (option: ImageOption): Promise<void> => {
    try {
      const png = await convertImage(option.blob ?? (await fetchImage(option.src)), 'image/png');
      if (await copyImage(png)) {
        notify('success', 'Imagen copiada. Pégala en el chat de WhatsApp (Ctrl+V).');
      } else {
        notify('error', 'El navegador no permite copiar imágenes; usa «Descargar».');
      }
    } catch (err) {
      notify('error', errorMessage(err));
    }
  };

  const handleDownloadImage = async (option: ImageOption): Promise<void> => {
    try {
      const jpg = await convertImage(option.blob ?? (await fetchImage(option.src)), 'image/jpeg');
      downloadBlob(jpg, safeFileName(option.label, 'jpg'));
    } catch (err) {
      notify('error', errorMessage(err));
    }
  };

  const handleConfirmSent = async (): Promise<void> => {
    if (!pendingConfirm || !template || !destination) return;
    const saved = await logActivity('enviado_manual');
    if (!saved) {
      // El registro falló: no prometer que quedó guardado y dejar
      // pendienteConfirm para reintentar (plan 230).
      notify('error', 'No se pudo registrar el envío. Inténtalo de nuevo.');
      return;
    }
    setPendingConfirm(null);
    notify('success', 'Registrado como enviado (confirmación manual).');
  };

  const handleOwnImage = (event: React.ChangeEvent<HTMLInputElement>): void => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = '';
    for (const file of files) {
      const problem = validateOwnImage(file);
      if (problem) {
        notify('error', `${file.name}: ${problem}`);
        continue;
      }
      const src = URL.createObjectURL(file);
      setOwnImages((prev) => [
        ...prev,
        { key: `own-${newId('img')}`, label: file.name.replace(/\.[^.]+$/, ''), src, blob: file },
      ]);
    }
  };

  /** Quita una imagen propia y libera su object URL (plan 230). */
  const removeOwnImage = (option: ImageOption): void => {
    setOwnImages((prev) => prev.filter((image) => image.key !== option.key));
    setSelectedImages((prev) => prev.filter((key) => key !== option.key));
    URL.revokeObjectURL(option.src);
  };

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

  const list = searchTemplates(
    doc.templates.filter((t) => t.kind === kind),
    query
  );

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

