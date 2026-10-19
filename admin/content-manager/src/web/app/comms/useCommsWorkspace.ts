import { ApiRequestError } from '../../api/requestCore.ts';
import type { CommsTemplate } from '../../../shared/schemas/comms.ts';
import type { VariableValues } from '../../../shared/comms.ts';

// Plan 240: shared module for the comms route. It owns the workspace hook
// (useCommsWorkspace) plus the helpers/types the route, the panels and the
// sub-components consume. Pure move from CommsPage.tsx — no behavior change.

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
