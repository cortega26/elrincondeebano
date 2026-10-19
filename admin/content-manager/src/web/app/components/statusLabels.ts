// Plan 242: one status→label map per domain, so pages stop re-declaring
// them. Strings are byte-identical to the pages' former local copies; the
// old local `STATUS_LABEL` in MediaPage was an exact subset of the media
// map, and DiagnosticsPage keeps its own domain (doctor checks).

/** Media inventory statuses plus media-intent lifecycle statuses. */
export const MEDIA_STATUS_LABEL: Record<string, string> = {
  active: 'Activo',
  orphan: 'Huérfano',
  generated: 'Generado',
  staged: 'Staging',
  missing: 'Faltante',
  pending: 'Pendiente',
  running: 'Ejecutando',
  succeeded: 'Listo',
  failed: 'Falló',
  cancelled: 'Cancelado',
  applied: 'Aplicado',
};

/** Doctor check statuses (DiagnosticsPage). */
export const DIAGNOSTIC_STATUS_LABEL: Record<'ok' | 'warn' | 'error', string> = {
  ok: '✓',
  warn: '⚠',
  error: '✗',
};
