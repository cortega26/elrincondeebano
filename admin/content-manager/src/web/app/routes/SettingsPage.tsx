import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  loadPreferences,
  savePreferences,
  resetPreferences,
  applyPreferences,
  type OperatorPreferences,
} from '../preferences.ts';

export function SettingsPage(): React.ReactElement {
  const [prefs, setPrefs] = useState<OperatorPreferences>(() => loadPreferences());

  useEffect(() => {
    applyPreferences(prefs);
  }, [prefs]);

  const update = (patch: Partial<OperatorPreferences>): void => {
    const next = { ...prefs, ...patch };
    setPrefs(next);
    savePreferences(next);
  };

  const handleReset = (): void => {
    setPrefs(resetPreferences());
  };

  return (
    <main role="main" aria-label="Preferencias">
      <nav
        aria-label="Navegación principal"
        style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}
      >
        <Link to="/products">Productos</Link>
        <Link to="/publish">Publicación</Link>
        <Link to="/settings" aria-current="page">
          Preferencias
        </Link>
      </nav>

      <h1>Preferencias</h1>

      <form
        onSubmit={(e) => e.preventDefault()}
        style={{ display: 'flex', flexDirection: 'column', gap: '1rem', maxWidth: '420px' }}
      >
        <label>
          Tema:{' '}
          <select
            value={prefs.theme}
            onChange={(e) =>
              update({ theme: e.currentTarget.value as OperatorPreferences['theme'] })
            }
          >
            <option value="light">Claro</option>
            <option value="dark">Oscuro</option>
            <option value="system">Sistema</option>
          </select>
        </label>

        <label>
          Escala de fuente ({Math.round(prefs.fontScale * 100)}%):{' '}
          <input
            type="range"
            min="0.8"
            max="1.3"
            step="0.05"
            value={prefs.fontScale}
            onChange={(e) => update({ fontScale: Number(e.currentTarget.value) })}
          />
        </label>

        <label>
          Densidad:{' '}
          <select
            value={prefs.density}
            onChange={(e) =>
              update({ density: e.currentTarget.value as OperatorPreferences['density'] })
            }
          >
            <option value="comfortable">Cómoda</option>
            <option value="compact">Compacta</option>
          </select>
        </label>

        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <input
            type="checkbox"
            checked={prefs.reduceMotion}
            onChange={(e) => update({ reduceMotion: e.currentTarget.checked })}
          />
          Reducir movimiento
        </label>

        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <input
            type="checkbox"
            checked={prefs.highContrast}
            onChange={(e) => update({ highContrast: e.currentTarget.checked })}
          />
          Alto contraste
        </label>

        <div>
          <button type="button" onClick={handleReset}>
            Restablecer preferencias
          </button>
        </div>
      </form>
    </main>
  );
}
