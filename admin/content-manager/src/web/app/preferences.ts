// Persisted operator preferences (plan 061 step 4). Schema-versioned,
// localStorage-backed, with graceful fallback to defaults when stored values
// are invalid (tampered or from an older version). No server-side storage.

export interface OperatorPreferences {
  version: 1;
  theme: 'light' | 'dark' | 'system';
  fontScale: number;
  density: 'comfortable' | 'compact';
  reduceMotion: boolean;
  highContrast: boolean;
}

export const DEFAULT_PREFERENCES: OperatorPreferences = {
  version: 1,
  theme: 'light',
  fontScale: 1,
  density: 'comfortable',
  reduceMotion: false,
  highContrast: false,
};

const STORAGE_KEY = 'cm-operator-preferences';

function isPreferences(value: unknown): value is OperatorPreferences {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  if (v.version !== 1) return false;
  if (v.theme !== 'light' && v.theme !== 'dark' && v.theme !== 'system') return false;
  if (typeof v.fontScale !== 'number' || v.fontScale < 0.8 || v.fontScale > 1.3) return false;
  if (v.density !== 'comfortable' && v.density !== 'compact') return false;
  if (typeof v.reduceMotion !== 'boolean') return false;
  if (typeof v.highContrast !== 'boolean') return false;
  return true;
}

export function loadPreferences(): OperatorPreferences {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_PREFERENCES };
    const parsed: unknown = JSON.parse(raw);
    return isPreferences(parsed) ? parsed : { ...DEFAULT_PREFERENCES };
  } catch {
    return { ...DEFAULT_PREFERENCES };
  }
}

export function savePreferences(prefs: OperatorPreferences): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
}

export function resetPreferences(): OperatorPreferences {
  const defaults = { ...DEFAULT_PREFERENCES };
  savePreferences(defaults);
  return defaults;
}

export function resolvedTheme(prefs: OperatorPreferences): 'light' | 'dark' {
  if (prefs.theme !== 'system') return prefs.theme;
  const dark = window.matchMedia?.('(prefers-color-scheme: dark)')?.matches ?? false;
  return dark ? 'dark' : 'light';
}

export function applyPreferences(prefs: OperatorPreferences): void {
  const root = document.documentElement;
  root.dataset.theme = resolvedTheme(prefs);
  root.dataset.density = prefs.density;
  root.dataset.highContrast = String(prefs.highContrast);
  root.dataset.reduceMotion = String(prefs.reduceMotion);
  root.style.fontSize = `${16 * prefs.fontScale}px`;
}
