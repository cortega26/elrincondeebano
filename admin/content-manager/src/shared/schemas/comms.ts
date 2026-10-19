// Plan 217 / ADR 0011: contrato del módulo privado de comunicaciones.
// Los datos viven en data/.comms/comms.json (gitignored): plantillas,
// destinos (pueden incluir teléfonos de vecinos) y el registro de actividad.
// Nunca se publican ni se sincronizan al storefront.
import { z } from 'zod';

// Plan 241: las constantes sin zod viven en comms-meta.ts (importable por el
// bundle del navegador) y se re-exportan aquí para conservar la API del
// servidor. Fuente única: no duplicar estos datos.
import { COMMS_CATEGORIES, COMMS_STATUSES, MAX_ACTIVITY } from '../comms-meta.ts';
export {
  COMMS_CATEGORIES,
  COMMS_CATEGORY_LABELS,
  COMMS_STATUSES,
  COMMS_STATUS_LABELS,
  MAX_ACTIVITY,
} from '../comms-meta.ts';

export const COMMS_SCHEMA_VERSION = 1 as const;

const idSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9-]+$/, 'id inválido');

// Solo rutas del catálogo real (assets/images/…); las imágenes propias que
// se adjuntan al momento no se persisten (ver ADR 0011).
const catalogImageSchema = z
  .string()
  .max(300)
  .regex(/^assets\/images\/.+\.(?:webp|jpg|jpeg|png|avif|gif)$/i, 'imagen fuera del catálogo');

export const commsTemplateSchema = z.object({
  id: idSchema,
  kind: z.enum(['mensaje', 'respuesta']),
  title: z.string().trim().min(1, 'El título es obligatorio').max(120),
  body: z.string().trim().min(1, 'El texto es obligatorio').max(4000),
  category: z.enum(COMMS_CATEGORIES),
  tags: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
  images: z.array(catalogImageSchema).max(10).default([]),
  favorite: z.boolean().default(false),
  archived: z.boolean().default(false),
  updated_at: z.iso.datetime(),
  last_used_at: z.iso.datetime().optional(),
});
export type CommsTemplate = z.infer<typeof commsTemplateSchema>;

// Número internacional sin '+' ni separadores (formato que exige wa.me).
export const phoneDigitsSchema = z
  .string()
  .regex(/^[1-9][0-9]{7,14}$/, 'Número internacional inválido (solo dígitos, con código de país)');

export const commsDestinationSchema = z.discriminatedUnion('kind', [
  z.object({
    id: idSchema,
    kind: z.literal('contacto'),
    alias: z.string().trim().min(1).max(60),
    name: z.string().trim().max(80).default(''),
    phone: phoneDigitsSchema,
  }),
  // Un grupo NO tiene número ni API: el flujo abre el selector de chats de
  // WhatsApp con el texto y el operador elige el grupo.
  z.object({
    id: idSchema,
    kind: z.literal('grupo'),
    alias: z.string().trim().min(1).max(60),
    name: z.string().trim().max(80).default(''),
  }),
]);
export type CommsDestination = z.infer<typeof commsDestinationSchema>;

export const commsActivitySchema = z.object({
  id: idSchema,
  at: z.iso.datetime(),
  template_id: z.string().max(64).nullable(),
  template_title: z.string().max(120),
  destination_id: z.string().max(64).nullable(),
  destination_alias: z.string().max(60),
  status: z.enum(COMMS_STATUSES),
  // Huella del texto para detectar campañas repetidas sin guardar el texto.
  text_hash: z.string().max(32),
});
export type CommsActivity = z.infer<typeof commsActivitySchema>;

export const commsDocumentSchema = z.object({
  schema_version: z.literal(COMMS_SCHEMA_VERSION),
  rev: z.number().int().nonnegative(),
  updated_at: z.iso.datetime(),
  templates: z.array(commsTemplateSchema).max(500),
  destinations: z.array(commsDestinationSchema).max(500),
  activity: z.array(commsActivitySchema).max(MAX_ACTIVITY),
});
export type CommsDocument = z.infer<typeof commsDocumentSchema>;

// Formato de respaldo (exportación/importación) versionado.
export const COMMS_BACKUP_FORMAT = 'rincon-comms-backup' as const;
export const commsBackupSchema = z.object({
  format: z.literal(COMMS_BACKUP_FORMAT),
  exported_at: z.iso.datetime(),
  data: commsDocumentSchema,
});
export type CommsBackup = z.infer<typeof commsBackupSchema>;
