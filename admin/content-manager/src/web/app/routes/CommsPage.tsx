import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ContentManagerClient, type ProductResponse } from '../../api/client.ts';
import { ApiRequestError } from '../../api/requestCore.ts';
import { Feedback, type FeedbackKind } from '../components/Feedback.tsx';
import { ProductImage, normalizeImagePath } from '../components/ProductImage.tsx';
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
  buildBackup,
  buildWhatsAppUrl,
  extractVariables,
  findRecentRepeat,
  formatClp,
  formatPhone,
  newId,
  normalizePhone,
  parseBackup,
  productVariables,
  renderTemplate,
  searchTemplates,
  textHash,
  todayLabel,
  type VariableValues,
} from '../../../shared/comms.ts';
import {
  canCopyImage,
  canShareFiles,
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

// Plan 217 / ADR 0011: panel operativo de mensajes de WhatsApp. Prepara y
// entrega el mensaje a WhatsApp; el envío final siempre lo hace el operador.

const client = new ContentManagerClient();
const DRAFT_KEY = 'cm-comms-draft-v1';
const ADHOC_ID = '__adhoc__';

type Kind = CommsTemplate['kind'];

interface ImageOption {
  key: string;
  label: string;
  /** URL para <img> y fetch (ruta del catálogo o blob: de imagen propia). */
  src: string;
  blob?: Blob;
}

interface Draft {
  templateId: string | null;
  destinationId: string | null;
  adhocPhone: string;
  values: VariableValues;
  text: string;
  edited: boolean;
}

const EMPTY_DRAFT: Draft = {
  templateId: null,
  destinationId: null,
  adhocPhone: '',
  values: {},
  text: '',
  edited: false,
};

function loadDraft(): Draft {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    return raw ? { ...EMPTY_DRAFT, ...(JSON.parse(raw) as Partial<Draft>) } : EMPTY_DRAFT;
  } catch {
    return EMPTY_DRAFT;
  }
}

function saveDraft(draft: Draft): void {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  } catch {
    /* sin almacenamiento: el borrador vive solo en memoria */
  }
}

function errorMessage(err: unknown): string {
  if (err instanceof ApiRequestError && err.status === 409) {
    return 'Los datos cambiaron en otra pestaña; se recargaron. Repite la acción.';
  }
  if (err instanceof ApiRequestError && err.status === 401) {
    return 'Falta la credencial de operador para guardar.';
  }
  return err instanceof Error ? err.message : String(err);
}

function relativeTime(iso: string): string {
  return new Intl.DateTimeFormat('es-CL', { dateStyle: 'short', timeStyle: 'short' }).format(
    new Date(iso)
  );
}

export function CommsPage(): React.ReactElement {
  const [doc, setDoc] = useState<CommsDocument | null>(null);
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

  const setDraft = useCallback((update: (prev: Draft) => Draft) => {
    setDraftState((prev) => {
      const next = update(prev);
      saveDraft(next);
      return next;
    });
  }, []);

  const notify = (kindValue: FeedbackKind, text: string): void =>
    setFeedback({ kind: kindValue, text });

  const reload = useCallback(async () => {
    try {
      setDoc(await client.getComms());
      setLoadError(null);
    } catch (err) {
      setLoadError(errorMessage(err));
    }
  }, []);

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
      if (!doc) return null;
      setBusy(true);
      try {
        const saved = await client.saveComms(mutate(doc), doc.rev);
        setDoc(saved);
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
    [doc, reload]
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
  const repeat = doc && destination ? findRecentRepeat(doc.activity, destination.id, hash) : null;

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

  useEffect(() => {
    setRepeatAck(false);
  }, [hash, destination?.id]);

  const chosenImages = imageOptions.filter((o) => selectedImages.includes(o.key));
  const needsStockCheck = Boolean(product);
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
    await logActivity('enviado_manual');
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
              {product && (
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
                        <img src={option.src} alt={option.label} />
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
          await persist(() => ({ ...imported, rev: doc.rev }), 'Respaldo importado.');
        }}
        onError={(text) => notify('error', text)}
      />
    </main>
  );
}

function stripEmpty(values: VariableValues): VariableValues {
  const out: VariableValues = {};
  for (const [key, value] of Object.entries(values)) {
    if (value && value.trim()) out[key] = value;
  }
  return out;
}

function ShareButton({
  disabled,
  onShare,
  count,
}: {
  disabled: boolean;
  onShare: () => void;
  count: number;
}): React.ReactElement | null {
  // Detección por capacidad (nunca por user agent): un archivo de prueba.
  const supported = useMemo(
    () => canShareFiles([new File(['x'], 'prueba.jpg', { type: 'image/jpeg' })]),
    []
  );
  if (!supported) {
    return (
      <span className="comms-hint">
        Este navegador no puede compartir imágenes directamente (usa Copiar/Descargar).
      </span>
    );
  }
  return (
    <button type="button" disabled={disabled} onClick={onShare}>
      Compartir texto + {count === 1 ? 'imagen' : `${count} imágenes`}
    </button>
  );
}

function ProductPicker({
  product,
  onChange,
}: {
  product: ProductResponse | null;
  onChange: (p: ProductResponse | null) => void;
}): React.ReactElement {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<ProductResponse[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) {
      setResults([]);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      client
        .getProducts({ q: term, limit: 8, archived: false })
        .then((res) => {
          if (!cancelled) {
            setResults(res.items);
            setError(null);
          }
        })
        .catch((err) => !cancelled && setError(errorMessage(err)));
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [q]);

  if (product) {
    return (
      <div className="comms-product is-chosen">
        <ProductImage mediaPath={product.image_path} alt="" style={{ width: 48, height: 48 }} />
        <div>
          <strong>{product.name}</strong>
          <div className="comms-hint">
            {formatClp(product.price)}
            {product.discount > 0 && ` → ${formatClp(product.price - product.discount)}`}
            {product.stock ? ' · con stock' : ' · SIN STOCK en catálogo'}
          </div>
        </div>
        <button type="button" onClick={() => onChange(null)}>
          Quitar
        </button>
      </div>
    );
  }
  return (
    <div className="comms-product">
      <label className="comms-field">
        <span>Producto del catálogo (opcional)</span>
        <input
          type="search"
          value={q}
          placeholder="Buscar producto…"
          onChange={(e) => setQ(e.target.value)}
        />
      </label>
      {error && <p className="comms-hint">{error}</p>}
      {results.length > 0 && (
        <ul className="comms-product-results" aria-label="Productos encontrados">
          {results.map((p) => (
            <li key={`${p.name}-${p.category}`}>
              <button
                type="button"
                onClick={() => {
                  onChange(p);
                  setQ('');
                }}
              >
                <ProductImage mediaPath={p.image_path} alt="" style={{ width: 36, height: 36 }} />
                <span>
                  {p.name} · {formatClp(p.price - (p.discount || 0))}
                  {!p.stock && ' · sin stock'}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function TemplateEditor({
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

function Destinations({
  destinations,
  busy,
  onAdd,
  onRemove,
}: {
  destinations: CommsDestination[];
  busy: boolean;
  onAdd: (d: CommsDestination) => void;
  onRemove: (id: string) => void;
}): React.ReactElement {
  const [alias, setAlias] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [isGroup, setIsGroup] = useState(false);
  const normalized = normalizePhone(phone);
  const valid = alias.trim() && (isGroup || normalized);

  return (
    <details className="comms-panel">
      <summary>Destinos ({destinations.length})</summary>
      <ul>
        {destinations.map((d) => (
          <li key={d.id}>
            {d.kind === 'grupo' ? `👥 ${d.alias}` : `${d.alias} · ${formatPhone(d.phone)}`}
            {d.name && ` (${d.name})`}{' '}
            <button
              type="button"
              aria-label={`Eliminar destino ${d.alias}`}
              disabled={busy}
              onClick={() => onRemove(d.id)}
            >
              Eliminar
            </button>
          </li>
        ))}
      </ul>
      <form
        className="comms-row"
        onSubmit={(e) => {
          e.preventDefault();
          if (!valid) return;
          const id = newId(isGroup ? 'grp' : 'ct');
          onAdd(
            isGroup
              ? { id, kind: 'grupo', alias: alias.trim(), name: name.trim() }
              : { id, kind: 'contacto', alias: alias.trim(), name: name.trim(), phone: normalized! }
          );
          setAlias('');
          setName('');
          setPhone('');
        }}
      >
        <label className="comms-field">
          <span>Alias</span>
          <input
            value={alias}
            onChange={(e) => setAlias(e.target.value)}
            placeholder="Depto 1203"
          />
        </label>
        <label className="comms-field">
          <span>Nombre (opcional)</span>
          <input value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="comms-check">
          <input type="checkbox" checked={isGroup} onChange={(e) => setIsGroup(e.target.checked)} />
          Es un grupo
        </label>
        {!isGroup && (
          <label className="comms-field">
            <span>Número</span>
            <input
              type="tel"
              value={phone}
              aria-invalid={Boolean(phone) && !normalized}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+56 9 1234 5678"
            />
          </label>
        )}
        <button type="submit" disabled={!valid || busy}>
          Agregar destino
        </button>
      </form>
      <p className="comms-hint">
        Los grupos no tienen número: WhatsApp no permite abrir un grupo con texto desde un enlace,
        así que se abre el selector de chats y eliges el grupo ahí. Si tu WhatsApp no lista el
        grupo, usa «Copiar mensaje» y pégalo en el grupo.
      </p>
    </details>
  );
}

function ArchivedTemplates({
  templates,
  onRestore,
}: {
  templates: CommsTemplate[];
  onRestore: (id: string) => void;
}): React.ReactElement | null {
  if (templates.length === 0) return null;
  return (
    <details className="comms-panel">
      <summary>Archivadas ({templates.length})</summary>
      <ul>
        {templates.map((t) => (
          <li key={t.id}>
            {t.title}{' '}
            <button type="button" onClick={() => onRestore(t.id)}>
              Restaurar
            </button>
          </li>
        ))}
      </ul>
    </details>
  );
}

function ActivityLog({ activity }: { activity: CommsActivity[] }): React.ReactElement {
  return (
    <details className="comms-panel">
      <summary>Historial ({activity.length})</summary>
      <p className="comms-hint">
        Solo registra acciones en esta app. WhatsApp no informa entregas ni lecturas.
      </p>
      <table>
        <thead>
          <tr>
            <th>Fecha</th>
            <th>Mensaje</th>
            <th>Destino</th>
            <th>Estado</th>
          </tr>
        </thead>
        <tbody>
          {activity.slice(0, 50).map((a) => (
            <tr key={a.id}>
              <td>{relativeTime(a.at)}</td>
              <td>{a.template_title}</td>
              <td>{a.destination_alias}</td>
              <td>{COMMS_STATUS_LABELS[a.status]}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}

function BackupPanel({
  doc,
  busy,
  onImport,
  onError,
}: {
  doc: CommsDocument;
  busy: boolean;
  onImport: (doc: CommsDocument) => Promise<void>;
  onError: (text: string) => void;
}): React.ReactElement {
  const [pending, setPending] = useState<CommsDocument | null>(null);
  return (
    <details className="comms-panel">
      <summary>Respaldo</summary>
      <p className="comms-hint">
        El respaldo incluye teléfonos de vecinos: guárdalo en un lugar privado, nunca en el repo.
      </p>
      <div className="comms-actions">
        <button
          type="button"
          onClick={() => {
            const blob = new Blob([JSON.stringify(buildBackup(doc), null, 2)], {
              type: 'application/json',
            });
            downloadBlob(blob, `rincon-mensajes-${new Date().toISOString().slice(0, 10)}.json`);
          }}
        >
          Exportar respaldo
        </button>
        <label className="comms-upload">
          Importar respaldo
          <input
            type="file"
            accept="application/json,.json"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (!file) return;
              const result = parseBackup(await file.text());
              if (!result.ok) {
                onError(`Respaldo inválido: ${result.errors.slice(0, 3).join('; ')}`);
                return;
              }
              setPending(result.value);
            }}
          />
        </label>
      </div>
      {pending && (
        <div className="comms-confirm">
          <span>
            Reemplazar todo por el respaldo ({pending.templates.length} plantillas,{' '}
            {pending.destinations.length} destinos)?
          </span>
          <button
            type="button"
            className="btn--danger"
            disabled={busy}
            onClick={async () => {
              await onImport(pending);
              setPending(null);
            }}
          >
            Reemplazar
          </button>
          <button type="button" onClick={() => setPending(null)}>
            Cancelar
          </button>
        </div>
      )}
    </details>
  );
}
