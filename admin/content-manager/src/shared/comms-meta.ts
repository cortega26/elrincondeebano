// Plan 241: constantes de datos del módulo de comunicaciones SIN zod.
// Los paneles del cliente las importan en el navegador (no arrastran el
// validador al bundle); schemas/comms.ts las re-exporta para el servidor.
// Fuente única: cualquier cambio de estos datos se hace aquí.

export const COMMS_CATEGORIES = [
  'promociones',
  'novedades',
  'disponibilidad',
  'reposicion',
  'horarios',
  'entregas',
  'pagos',
  'pedidos',
  'seguimiento',
  'agradecimientos',
] as const;

export const COMMS_CATEGORY_LABELS: Record<(typeof COMMS_CATEGORIES)[number], string> = {
  promociones: 'Promociones',
  novedades: 'Novedades',
  disponibilidad: 'Disponibilidad',
  reposicion: 'Reposición de stock',
  horarios: 'Horarios',
  entregas: 'Entregas',
  pagos: 'Medios de pago',
  pedidos: 'Pedidos',
  seguimiento: 'Seguimiento',
  agradecimientos: 'Agradecimientos',
};

// Estados honestos: ninguno significa "entregado" ni "leído".
export const COMMS_STATUSES = [
  'preparado',
  'chat_abierto',
  'compartir_iniciado',
  'enviado_manual',
] as const;

export const COMMS_STATUS_LABELS: Record<(typeof COMMS_STATUSES)[number], string> = {
  preparado: 'Preparado (copiado)',
  chat_abierto: 'Chat abierto',
  compartir_iniciado: 'Compartir iniciado',
  enviado_manual: 'Envío confirmado manualmente',
};

// Máximo de entradas de actividad conservadas en el documento.
export const MAX_ACTIVITY = 500;
