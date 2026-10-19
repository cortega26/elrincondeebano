// @vitest-environment jsdom
// Plan 231: handoff.ts is the browser-side bridge to WhatsApp/the clipboard.
// These tests pin the three pure predicates the UI trusts: type/size gate,
// filename sanitization and the Web Share capability probe. The async Blob
// paths (convertImage/copyImage/...) need a real canvas/clipboard and stay
// covered by the e2e spec instead.
import { afterEach, describe, expect, test, vi } from 'vitest';
import {
  OWN_IMAGE_MAX_BYTES,
  canShareFiles,
  safeFileName,
  validateOwnImage,
} from '../../src/web/app/comms/handoff.ts';

describe('validateOwnImage', () => {
  test('rejects unsupported types before looking at the size', () => {
    expect(validateOwnImage({ type: 'application/pdf', size: 1024 })).toBe(
      'Formato no admitido (usa JPG, PNG o WebP)'
    );
    expect(validateOwnImage({ type: '', size: 1024 })).toBe(
      'Formato no admitido (usa JPG, PNG o WebP)'
    );
    // Precedence: an unsupported type does not report the size problem.
    expect(validateOwnImage({ type: 'text/plain', size: OWN_IMAGE_MAX_BYTES + 1 })).toBe(
      'Formato no admitido (usa JPG, PNG o WebP)'
    );
  });

  test('rejects empty files', () => {
    expect(validateOwnImage({ type: 'image/png', size: 0 })).toBe('La imagen está vacía');
    expect(validateOwnImage({ type: 'image/jpeg', size: 0 })).toBe('La imagen está vacía');
  });

  test('rejects files over 10 MB (boundary is inclusive)', () => {
    expect(validateOwnImage({ type: 'image/webp', size: OWN_IMAGE_MAX_BYTES + 1 })).toBe(
      'La imagen supera 10 MB'
    );
    expect(validateOwnImage({ type: 'image/webp', size: OWN_IMAGE_MAX_BYTES })).toBeNull();
  });

  test('accepts the three admitted types', () => {
    for (const type of ['image/jpeg', 'image/png', 'image/webp']) {
      expect(validateOwnImage({ type, size: 2048 })).toBeNull();
    }
  });
});

describe('safeFileName', () => {
  test('slugifies accents and drops diacritics/emoji', () => {
    expect(safeFileName('Nova Clásica ✨', 'jpg')).toBe('nova-clasica.jpg');
    expect(safeFileName('Café Órale', 'png')).toBe('cafe-orale.png');
  });

  test('strips path characters and dot segments', () => {
    const name = safeFileName('../../etc/pa$sswd', 'jpg');
    expect(name).toBe('etc-pa-sswd.jpg');
    expect(name).not.toContain('/');
    expect(name).not.toContain('\\');
    expect(name).not.toContain('..');
    expect(safeFileName('../secreto', 'png')).not.toContain('..');
  });

  test('falls back to imagen.<ext> for empty or unusable bases', () => {
    expect(safeFileName('', 'jpg')).toBe('imagen.jpg');
    expect(safeFileName('   ', 'png')).toBe('imagen.png');
    expect(safeFileName('✨🌟', 'webp')).toBe('imagen.webp');
    expect(safeFileName('..', 'jpeg')).toBe('imagen.jpeg');
  });

  test('caps the slug at 50 characters', () => {
    expect(safeFileName('a'.repeat(80), 'jpg')).toBe(`${'a'.repeat(50)}.jpg`);
  });
});

function stubNavigatorShare(options: { share?: unknown; canShare?: unknown }): void {
  for (const [key, value] of Object.entries(options)) {
    Object.defineProperty(navigator, key, { value, configurable: true, writable: true });
  }
}

describe('canShareFiles', () => {
  afterEach(() => {
    delete (navigator as unknown as Record<string, unknown>).share;
    delete (navigator as unknown as Record<string, unknown>).canShare;
  });

  test('false without navigator.share (no Web Share support)', () => {
    expect(typeof navigator.share).toBe('undefined');
    expect(canShareFiles([new File(['x'], 'foto.png', { type: 'image/png' })])).toBe(false);
  });

  test('false when only share exists but canShare is missing', () => {
    stubNavigatorShare({ share: vi.fn() });
    expect(canShareFiles([new File(['x'], 'foto.png', { type: 'image/png' })])).toBe(false);
  });

  test('false when canShare throws (feature-detected APIs must not break the UI)', () => {
    stubNavigatorShare({
      share: vi.fn(),
      canShare: () => {
        throw new TypeError('unsupported payload');
      },
    });
    expect(canShareFiles([new File(['x'], 'foto.png', { type: 'image/png' })])).toBe(false);
  });

  test('false when canShare rejects the payload', () => {
    stubNavigatorShare({ share: vi.fn(), canShare: () => false });
    expect(canShareFiles([new File(['x'], 'foto.png', { type: 'image/png' })])).toBe(false);
  });

  test('true when share + canShare accept the files', () => {
    const canShare = vi.fn(() => true);
    stubNavigatorShare({ share: vi.fn(), canShare });
    const files = [new File(['x'], 'foto.png', { type: 'image/png' })];
    expect(canShareFiles(files)).toBe(true);
    expect(canShare).toHaveBeenCalledWith({ files });
  });
});
