// Plan 217 / ADR 0011: lógica pura del módulo de comunicaciones (sin DOM ni
// fs) — compartida por el servidor (validación) y la SPA (composición).
import {
  COMMS_BACKUP_FORMAT,
  COMMS_SCHEMA_VERSION,
  commsBackupSchema,
  commsDocumentSchema,
  type CommsActivity,
  type CommsBackup,
  type CommsDocument,
  type CommsTemplate,
} from './schemas/comms.ts';

export const STOREFRONT_ORIGIN = 'https://www.elrincondeebano.com';

export const KNOWN_VARIABLES = ['nombre', 'producto', 'precio', 'oferta', 'fecha', 'url'] as const;
export type KnownVariable = (typeof KNOWN_VARIABLES)[number];
export type VariableValues = Partial<Record<string, string>>;

const VARIABLE_RE = /\{([a-zA-Z_áéíóúñ]+)\}/g;

/** Variables `{x}` usadas en un texto, sin duplicados y en orden de aparición. */
export function extractVariables(body: string): string[] {
  const seen: string[] = [];
  for (const match of body.matchAll(VARIABLE_RE)) {
    const name = match[1].toLowerCase();
    if (!seen.includes(name)) seen.push(name);
  }
  return seen;
}

export interface RenderResult {
  text: string;
  /** Variables sin valor (o desconocidas): el envío debe bloquearse. */
  missing: string[];
}

/**
 * Sustituye las variables con valor y deja intactas las que faltan, para que
 * la vista previa muestre exactamente qué queda por completar.
 */
export function renderTemplate(body: string, values: VariableValues): RenderResult {
  const missing: string[] = [];
  const text = body.replace(VARIABLE_RE, (whole, rawName: string) => {
    const name = rawName.toLowerCase();
    const value = values[name]?.trim();
    if (!value) {
      if (!missing.includes(name)) missing.push(name);
      return whole;
    }
    return value;
  });
  return { text, missing };
}

/**
 * Normaliza un número a dígitos internacionales (formato wa.me). Acepta
 * formatos chilenos habituales: "+56 9 1234 5678", "9 1234 5678",
 * "912345678". Devuelve null si no es un número plausible.
 *
 * Endurecido (plan 230): con "+" se exige largo internacional (10–15
 * dígitos) y sin "+" solo se aceptan las formas chilenas conocidas —
 * móvil de 9 dígitos (9XXXXXXXX) o el código 56 con largo 11. Un fijo
 * de 8 dígitos ya no pasa: wa.me lo rechazaría.
 */
export function normalizePhone(input: string): string | null {
  const trimmed = input.trim();
  let digits = trimmed.replace(/[^0-9]/g, '');
  if (!digits) return null;
  if (trimmed.startsWith('00')) digits = digits.slice(2);
  if (trimmed.startsWith('+')) {
    // Internacional explícito: largo E.164 plausible (10–15 dígitos).
    if (!/^\d{10,15}$/.test(digits)) return null;
  } else if (/^9\d{8}$/.test(digits)) {
    // Móvil chileno sin código de país (9 dígitos que empiezan con 9).
    digits = `56${digits}`;
  } else if (!/^56\d{9}$/.test(digits)) {
    // Sin "+": solo las formas chilenas conocidas (56 + 9 dígitos).
    return null;
  }
  if (digits.startsWith('56') && digits.length !== 11) return null;
  if (!/^[1-9][0-9]{7,14}$/.test(digits)) return null;
  return digits;
}

/** Muestra un número de forma legible: 56912345678 → +56 9 1234 5678. */
export function formatPhone(digits: string): string {
  if (/^569\d{8}$/.test(digits)) {
    return `+56 9 ${digits.slice(3, 7)} ${digits.slice(7)}`;
  }
  return `+${digits}`;
}

/**
 * Enlace Click to Chat. Con número abre ese chat con el texto prellenado;
 * sin número abre el selector de chats de WhatsApp (camino para el grupo).
 * En ningún caso envía: el operador pulsa Enviar en WhatsApp.
 */
export function buildWhatsAppUrl(text: string, phone?: string | null): string {
  const encoded = encodeURIComponent(text);
  return phone ? `https://wa.me/${phone}?text=${encoded}` : `https://wa.me/?text=${encoded}`;
}

const CLP = new Intl.NumberFormat('es-CL', {
  style: 'currency',
  currency: 'CLP',
  maximumFractionDigits: 0,
});

export function formatClp(amount: number): string {
  return CLP.format(amount);
}

export interface CommsProductInput {
  name: string;
  description?: string;
  price: number;
  discount?: number;
  stock?: boolean;
  is_archived?: boolean;
  category?: string;
  sku?: string;
  id?: string;
}

// Réplica de astro-poc/src/lib/product-identity.ts (paridad cubierta por test).
export function productSku(product: CommsProductInput): string {
  const sku = product.sku?.trim();
  if (sku) return sku;
  const id = product.id?.trim();
  if (id) return id;
  const base = `${product.name || ''}-${product.category || ''}`.toLowerCase();
  let hash = 0;
  for (let index = 0; index < base.length; index += 1) {
    hash = (hash << 5) - hash + base.charCodeAt(index);
    hash |= 0;
  }
  return `pid-${Math.abs(hash)}`;
}

/**
 * URL pública del producto. Solo existe /p/<sku>/ para productos activos y
 * con stock; si no, se enlaza el inicio para no publicar un 404.
 */
export function productUrl(product: CommsProductInput): string {
  if (product.is_archived || product.stock === false) return `${STOREFRONT_ORIGIN}/`;
  return `${STOREFRONT_ORIGIN}/p/${encodeURIComponent(productSku(product))}/`;
}

/** Variables derivadas del catálogo real; nunca se inventan valores. */
export function productVariables(product: CommsProductInput): VariableValues {
  const discount = product.discount ?? 0;
  const values: VariableValues = {
    producto: product.description ? `${product.name} (${product.description})` : product.name,
    precio: formatClp(product.price),
    url: productUrl(product),
  };
  if (discount > 0 && discount < product.price) {
    values.oferta = formatClp(product.price - discount);
  }
  return values;
}

export function todayLabel(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('es-CL', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(now);
}

/** Huella FNV-1a (32 bits, hex) del texto final. */
export function textHash(text: string): string {
  let hash = 0x811c9dc5;
  const normalized = text.trim().replace(/\s+/g, ' ');
  for (let i = 0; i < normalized.length; i += 1) {
    hash ^= normalized.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export const REPEAT_WINDOW_DAYS = 7;

// Solo un envío confirmado (o un compartir iniciado) cuenta como repetición:
// abrir el chat o copiar no prueban que el mensaje salió, y bloquearlos
// impediría reintentar o usar el fallback de copiar.
const REPEAT_STATUSES: ReadonlySet<CommsActivity['status']> = new Set([
  'enviado_manual',
  'compartir_iniciado',
]);

/** Último envío del mismo texto al mismo destino dentro de la ventana. */
export function findRecentRepeat(
  activity: CommsActivity[],
  destinationId: string | null,
  hash: string,
  now: Date = new Date(),
  days: number = REPEAT_WINDOW_DAYS
): CommsActivity | null {
  const cutoff = now.getTime() - days * 24 * 60 * 60 * 1000;
  for (const entry of activity) {
    if (
      REPEAT_STATUSES.has(entry.status) &&
      entry.text_hash === hash &&
      entry.destination_id === destinationId &&
      Date.parse(entry.at) >= cutoff
    ) {
      return entry;
    }
  }
  return null;
}

export function newId(prefix: string): string {
  const random = Math.random().toString(36).slice(2, 8);
  return `${prefix}-${Date.now().toString(36)}-${random}`;
}

export function searchTemplates(templates: CommsTemplate[], query: string): CommsTemplate[] {
  const terms = normalizeText(query).split(' ').filter(Boolean);
  const visible = templates.filter((t) => !t.archived);
  const filtered = terms.length
    ? visible.filter((t) => {
        const haystack = normalizeText(`${t.title} ${t.body} ${t.category} ${t.tags.join(' ')}`);
        return terms.every((term) => haystack.includes(term));
      })
    : visible;
  // Favoritos primero, luego los usados más recientemente.
  return [...filtered].sort((a, b) => {
    if (a.favorite !== b.favorite) return a.favorite ? -1 : 1;
    return (b.last_used_at ?? '').localeCompare(a.last_used_at ?? '');
  });
}

function normalizeText(value: string): string {
  return value.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
}

/** Errores de integridad que el schema no cubre (ids duplicados). */
export function integrityErrors(doc: CommsDocument): string[] {
  const errors: string[] = [];
  const check = (label: string, ids: string[]): void => {
    const seen = new Set<string>();
    for (const id of ids) {
      if (seen.has(id)) errors.push(`${label} duplicado: ${id}`);
      seen.add(id);
    }
  };
  check(
    'Plantilla',
    doc.templates.map((t) => t.id)
  );
  check(
    'Destino',
    doc.destinations.map((d) => d.id)
  );
  return errors;
}

export type ParseResult<T> = { ok: true; value: T } | { ok: false; errors: string[] };

export function parseCommsDocument(input: unknown): ParseResult<CommsDocument> {
  const result = commsDocumentSchema.safeParse(input);
  if (!result.success) {
    return {
      ok: false,
      errors: result.error.issues.map((i) => `${i.path.join('.') || '(raíz)'}: ${i.message}`),
    };
  }
  const errors = integrityErrors(result.data);
  return errors.length ? { ok: false, errors } : { ok: true, value: result.data };
}

export function buildBackup(doc: CommsDocument, now: Date = new Date()): CommsBackup {
  return { format: COMMS_BACKUP_FORMAT, exported_at: now.toISOString(), data: doc };
}

export function parseBackup(raw: string): ParseResult<CommsDocument> {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return { ok: false, errors: ['El archivo no es JSON válido'] };
  }
  const envelope = commsBackupSchema.safeParse(json);
  if (!envelope.success) {
    return {
      ok: false,
      errors: envelope.error.issues.map((i) => `${i.path.join('.') || '(raíz)'}: ${i.message}`),
    };
  }
  return parseCommsDocument(envelope.data.data);
}

/**
 * Documento inicial: plantillas de ejemplo útiles y un destino de grupo sin
 * datos personales. No incluye números de vecinos.
 */
export function seedDocument(now: Date = new Date()): CommsDocument {
  const at = now.toISOString();
  const t = (
    id: string,
    kind: CommsTemplate['kind'],
    category: CommsTemplate['category'],
    title: string,
    body: string,
    tags: string[] = [],
    favorite = false
  ): CommsTemplate => ({
    id,
    kind,
    category,
    title,
    body,
    tags,
    images: [],
    favorite,
    archived: false,
    updated_at: at,
  });
  return {
    schema_version: COMMS_SCHEMA_VERSION,
    rev: 0,
    updated_at: at,
    destinations: [{ id: 'grupo-vecinos', kind: 'grupo', alias: 'Grupo vecinos Ébano', name: '' }],
    activity: [],
    templates: [
      t(
        'promo-producto',
        'mensaje',
        'promociones',
        'Promoción de producto',
        'Hola vecinos 👋 Esta semana tenemos {producto} a {oferta} (precio normal {precio}). Pueden pedirlo por aquí o en {url}',
        ['oferta'],
        true
      ),
      t(
        'producto-repuesto',
        'mensaje',
        'reposicion',
        'Producto repuesto',
        'Hola vecinos, ya tenemos de nuevo {producto} a {precio}. Pedidos por aquí o en {url}',
        ['stock'],
        true
      ),
      t(
        'novedad',
        'mensaje',
        'novedades',
        'Producto nuevo',
        'Hola vecinos, llegó {producto} a {precio}. Lo pueden ver en {url}',
        ['nuevo']
      ),
      t(
        'abrimos',
        'mensaje',
        'horarios',
        'Abrimos',
        'Buenos días vecinos ☀️ Ya estamos atendiendo. Pedidos por aquí o en https://www.elrincondeebano.com/',
        ['apertura']
      ),
      t(
        'ultimos-pedidos',
        'mensaje',
        'horarios',
        'Últimos pedidos del día',
        'Vecinos, hoy recibimos pedidos hasta las {hora}. ¡Gracias!',
        ['cierre']
      ),
      t(
        'resp-disponible',
        'respuesta',
        'disponibilidad',
        'Sí hay disponible',
        'Hola {nombre}, sí tenemos {producto} a {precio}. ¿Te lo llevo?',
        ['stock', 'si'],
        true
      ),
      t(
        'resp-no-disponible',
        'respuesta',
        'disponibilidad',
        'No disponible + alternativa',
        'Hola {nombre}, por ahora no nos queda {producto}. Como alternativa tenemos {alternativa}. ¿Te sirve?',
        ['stock', 'no', 'alternativa']
      ),
      t(
        'resp-precio',
        'respuesta',
        'disponibilidad',
        'Precio de producto',
        'Hola {nombre}, {producto} está a {precio}. Lo puedes ver aquí: {url}',
        ['precio']
      ),
      t(
        'resp-delivery',
        'respuesta',
        'entregas',
        'Entrega en el edificio',
        'Hola {nombre}, sí, te lo llevamos a tu departamento dentro del edificio. ¿A qué depto?',
        ['delivery', 'despacho']
      ),
      t(
        'resp-pago',
        'respuesta',
        'pagos',
        'Medios de pago',
        'Hola {nombre}, puedes pagar en efectivo o transferencia, y con tarjeta en compras desde $30.000.',
        ['transferencia', 'efectivo']
      ),
      t(
        'pedido-confirmado',
        'respuesta',
        'pedidos',
        'Pedido confirmado',
        'Hola {nombre}, tu pedido está confirmado ✅ Te avisamos cuando esté listo.',
        ['confirmado'],
        true
      ),
      t(
        'pedido-listo',
        'respuesta',
        'seguimiento',
        'Pedido listo',
        'Hola {nombre}, tu pedido ya está listo. ¿Te lo llevamos ahora?',
        ['listo']
      ),
      t(
        'gracias',
        'respuesta',
        'agradecimientos',
        'Gracias por la compra',
        '¡Gracias {nombre}! Cualquier cosa, nos escribes por aquí 😊',
        ['gracias']
      ),
    ],
  };
}
