import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ChangeEvent, Dispatch, RefObject, SetStateAction } from 'react';
import { ContentManagerClient, type ProductResponse } from '../../api/client.ts';
import { ApiRequestError } from '../../api/requestCore.ts';
import type { FeedbackKind } from '../components/Feedback.tsx';
import { normalizeImagePath } from '../components/ProductImage.tsx';
import type {
  CommsActivity,
  CommsDestination,
  CommsDocument,
  CommsTemplate,
} from '../../../shared/schemas/comms.ts';
import {
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
  type RenderResult,
  type VariableValues,
} from '../../../shared/comms.ts';
import {
  convertImage,
  copyImage,
  copyText,
  downloadBlob,
  fetchImage,
  openWhatsApp,
  safeFileName,
  shareWithFiles,
  validateOwnImage,
} from './handoff.ts';

// Plan 240: shared module for the comms route. It owns the workspace hook
// (useCommsWorkspace) plus the helpers/types the route, the panels and the
// sub-components consume. Pure move from CommsPage.tsx — no behavior change.

const client = new ContentManagerClient();

export const DRAFT_KEY = 'cm-comms-draft-v1';
export const ADHOC_ID = '__adhoc__';

export type Kind = CommsTemplate['kind'];

export interface ImageOption {
  key: string;
  label: string;
  /** URL para <img> y fetch (ruta del catálogo o blob: de imagen propia). */
  src: string;
  blob?: Blob;
}

export interface Draft {
  templateId: string | null;
  destinationId: string | null;
  adhocPhone: string;
  values: VariableValues;
  text: string;
  edited: boolean;
}

export const EMPTY_DRAFT: Draft = {
  templateId: null,
  destinationId: null,
  adhocPhone: '',
  values: {},
  text: '',
  edited: false,
};

export function loadDraft(): Draft {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    return raw ? { ...EMPTY_DRAFT, ...(JSON.parse(raw) as Partial<Draft>) } : EMPTY_DRAFT;
  } catch {
    return EMPTY_DRAFT;
  }
}

export function saveDraft(draft: Draft): void {
  try {
    // Datos personales fuera del borrador: el número pegado y {nombre}
    // solo viven en memoria.
    const { nombre: _nombre, ...values } = draft.values;
    void _nombre;
    localStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({
        ...draft,
        adhocPhone: '',
        destinationId: draft.destinationId === ADHOC_ID ? null : draft.destinationId,
        values,
      })
    );
  } catch {
    /* sin almacenamiento: el borrador vive solo en memoria */
  }
}

export function stripEmpty(values: VariableValues): VariableValues {
  const out: VariableValues = {};
  for (const [key, value] of Object.entries(values)) {
    if (value && value.trim()) out[key] = value;
  }
  return out;
}

export function errorMessage(err: unknown): string {
  if (err instanceof ApiRequestError && err.status === 409) {
    return 'Los datos cambiaron en otra pestaña; se recargaron. Repite la acción.';
  }
  if (err instanceof ApiRequestError && err.status === 401) {
    return 'Falta la credencial de operador para guardar.';
  }
  return err instanceof Error ? err.message : String(err);
}

export function relativeTime(iso: string): string {
  return new Intl.DateTimeFormat('es-CL', { dateStyle: 'short', timeStyle: 'short' }).format(
    new Date(iso)
  );
}

/** Todo lo que el panel operativo comparte entre la ruta y sus paneles. */
export interface CommsWorkspace {
  doc: CommsDocument | null;
  loadError: string | null;
  reload: () => Promise<void>;
  persist: (
    mutate: (current: CommsDocument) => CommsDocument,
    success?: string
  ) => Promise<CommsDocument | null>;
  notify: (kindValue: FeedbackKind, text: string) => void;
  feedback: { kind: FeedbackKind; text: string } | null;
  setFeedback: Dispatch<SetStateAction<{ kind: FeedbackKind; text: string } | null>>;
  busy: boolean;
  kind: Kind;
  setKind: Dispatch<SetStateAction<Kind>>;
  query: string;
  setQuery: Dispatch<SetStateAction<string>>;
  searchRef: RefObject<HTMLInputElement | null>;
  draft: Draft;
  setDraft: (update: (prev: Draft) => Draft) => void;
  template: CommsTemplate | null;
  destination: CommsDestination | null;
  product: ProductResponse | null;
  setProduct: Dispatch<SetStateAction<ProductResponse | null>>;
  stockChecked: boolean;
  setStockChecked: Dispatch<SetStateAction<boolean>>;
  selectedImages: string[];
  setSelectedImages: Dispatch<SetStateAction<string[]>>;
  repeatAck: boolean;
  setRepeatAck: Dispatch<SetStateAction<boolean>>;
  pendingConfirm: CommsActivity | null;
  setPendingConfirm: Dispatch<SetStateAction<CommsActivity | null>>;
  blockedUrl: string | null;
  editing: CommsTemplate | null;
  setEditing: Dispatch<SetStateAction<CommsTemplate | null>>;
  list: CommsTemplate[];
  variables: string[];
  autoValues: VariableValues;
  rendered: RenderResult;
  imageOptions: ImageOption[];
  chosenImages: ImageOption[];
  needsStockCheck: boolean;
  blockers: string[];
  ready: boolean;
  repeat: CommsActivity | null;
  selectTemplate: (t: CommsTemplate) => void;
  handleOpenChat: () => Promise<void>;
  handleShare: () => Promise<void>;
  handleCopyText: () => Promise<void>;
  handleCopyImage: (option: ImageOption) => Promise<void>;
  handleDownloadImage: (option: ImageOption) => Promise<void>;
  handleConfirmSent: () => Promise<void>;
  handleOwnImage: (event: ChangeEvent<HTMLInputElement>) => void;
  removeOwnImage: (option: ImageOption) => void;
}

export function useCommsWorkspace(): CommsWorkspace {
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

  const handleOwnImage = (event: ChangeEvent<HTMLInputElement>): void => {
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

  const list = doc ? searchTemplates(doc.templates.filter((t) => t.kind === kind), query) : [];

  return {
    doc,
    loadError,
    reload,
    persist,
    notify,
    feedback,
    setFeedback,
    busy,
    kind,
    setKind,
    query,
    setQuery,
    searchRef,
    draft,
    setDraft,
    template,
    destination,
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
    list,
    variables,
    autoValues,
    rendered,
    imageOptions,
    chosenImages,
    needsStockCheck,
    blockers,
    ready,
    repeat,
    selectTemplate,
    handleOpenChat,
    handleShare,
    handleCopyText,
    handleCopyImage,
    handleDownloadImage,
    handleConfirmSent,
    handleOwnImage,
    removeOwnImage,
  };
}
