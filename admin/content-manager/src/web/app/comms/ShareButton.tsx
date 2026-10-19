import { useMemo } from 'react';
import { canShareFiles } from './handoff.ts';

export function ShareButton({
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
