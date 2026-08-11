import { useState } from 'react';

// Plan 091: single image component for product media — broken/missing
// images render a placeholder instead of the browser's broken-image glyph,
// and paths outside assets/images/ are normalized (never served as HTML by
// the SPA fallback).

const PLACEHOLDER_STYLE: React.CSSProperties = {
  width: '100%',
  height: '100%',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: '#e9ecef',
  color: '#767676',
  fontSize: '0.8rem',
  minHeight: '2rem',
  borderRadius: '3px',
};

// Normalizes legacy prefixes (images/…) to the canonical assets/images/ and
// rejects anything else so callers fall back to the placeholder.
export function normalizeImagePath(mediaPath: string | undefined | null): string | null {
  const raw = String(mediaPath ?? '').trim();
  if (!raw) return null;
  if (raw.startsWith('assets/images/')) return raw;
  if (raw.startsWith('images/')) return `assets/${raw}`;
  return null;
}

export function ProductImage({
  mediaPath,
  alt = '',
  style,
}: {
  mediaPath: string | undefined | null;
  alt?: string;
  style?: React.CSSProperties;
}): React.ReactElement {
  const [failed, setFailed] = useState(false);
  const normalized = normalizeImagePath(mediaPath);

  if (!normalized || failed) {
    return (
      <div style={{ ...PLACEHOLDER_STYLE, ...style }} role="img" aria-label={alt || 'Sin imagen'}>
        Sin imagen
      </div>
    );
  }

  return (
    <img
      src={`/${normalized}`}
      alt={alt}
      style={{ ...style, objectFit: 'cover' }}
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
}
