// @vitest-environment jsdom
import { test, expect } from 'vitest';
import {
  DEFAULT_PREFERENCES,
  loadPreferences,
  savePreferences,
  resetPreferences,
  applyPreferences,
  resolvedTheme,
} from '../../src/web/app/preferences.ts';

test('loadPreferences returns defaults when nothing is stored', () => {
  localStorage.clear();
  expect(loadPreferences()).toEqual(DEFAULT_PREFERENCES);
});

test('preferences persist and round-trip', () => {
  localStorage.clear();
  savePreferences({ ...DEFAULT_PREFERENCES, theme: 'dark', fontScale: 1.2, density: 'compact' });
  const loaded = loadPreferences();
  expect(loaded.theme).toBe('dark');
  expect(loaded.fontScale).toBe(1.2);
  expect(loaded.density).toBe('compact');
});

test('invalid stored preferences fall back to defaults', () => {
  localStorage.clear();
  localStorage.setItem('cm-operator-preferences', JSON.stringify({ version: 1, theme: 'neon' }));
  expect(loadPreferences()).toEqual(DEFAULT_PREFERENCES);

  localStorage.setItem('cm-operator-preferences', 'not-json{');
  expect(loadPreferences()).toEqual(DEFAULT_PREFERENCES);

  localStorage.setItem(
    'cm-operator-preferences',
    JSON.stringify({ ...DEFAULT_PREFERENCES, version: 99 })
  );
  expect(loadPreferences()).toEqual(DEFAULT_PREFERENCES);
});

test('resetPreferences clears to defaults and persists them', () => {
  localStorage.clear();
  savePreferences({ ...DEFAULT_PREFERENCES, theme: 'dark' });
  const defaults = resetPreferences();
  expect(defaults).toEqual(DEFAULT_PREFERENCES);
  expect(loadPreferences()).toEqual(DEFAULT_PREFERENCES);
});

test('applyPreferences sets dataset and font size on the root', () => {
  applyPreferences({ ...DEFAULT_PREFERENCES, theme: 'dark', fontScale: 1.25, highContrast: true });
  expect(document.documentElement.dataset.theme).toBe('dark');
  expect(document.documentElement.dataset.highContrast).toBe('true');
  expect(document.documentElement.style.fontSize).toBe('20px');

  applyPreferences(DEFAULT_PREFERENCES);
  expect(document.documentElement.dataset.theme).toBe('light');
  expect(document.documentElement.style.fontSize).toBe('16px');
});

test('system theme resolves from the media query', () => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string): { matches: boolean } => ({
      matches: query.includes('dark'),
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }),
  });
  expect(resolvedTheme({ ...DEFAULT_PREFERENCES, theme: 'system' })).toBe('dark');
});
