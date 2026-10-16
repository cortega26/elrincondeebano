// Plan 217 / ADR 0011: traspaso a WhatsApp desde el navegador. Cada función
// devuelve un resultado honesto: ninguna puede saber si el mensaje se envió.

export const OWN_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export const OWN_IMAGE_MAX_BYTES = 10 * 1024 * 1024;
// Lado mayor tras optimizar: suficiente para WhatsApp sin archivos pesados.
export const SHARE_MAX_DIMENSION = 1600;

export function validateOwnImage(file: { type: string; size: number }): string | null {
  if (!(OWN_IMAGE_TYPES as readonly string[]).includes(file.type)) {
    return 'Formato no admitido (usa JPG, PNG o WebP)';
  }
  if (file.size > OWN_IMAGE_MAX_BYTES) {
    return 'La imagen supera 10 MB';
  }
  if (file.size === 0) return 'La imagen está vacía';
  return null;
}

/**
 * Convierte una imagen (del catálogo .webp/.avif o propia) a JPEG o PNG
 * redimensionada. WhatsApp puede tratar un .webp como sticker, por eso se
 * comparte siempre JPEG; el portapapeles solo admite PNG.
 */
export async function convertImage(
  source: Blob,
  type: 'image/jpeg' | 'image/png',
  maxDimension: number = SHARE_MAX_DIMENSION
): Promise<Blob> {
  const bitmap = await createImageBitmap(source);
  const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('El navegador no permite procesar imágenes');
  if (type === 'image/jpeg') {
    // JPEG no tiene transparencia: fondo blanco en vez de negro.
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
  }
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close?.();
  return new Promise((resolvePromise, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolvePromise(blob) : reject(new Error('No se pudo convertir la imagen'))),
      type,
      0.85
    );
  });
}

export async function fetchImage(src: string): Promise<Blob> {
  const response = await fetch(src);
  if (!response.ok) throw new Error(`No se pudo cargar la imagen (${response.status})`);
  return response.blob();
}

export function canShareFiles(files: File[]): boolean {
  try {
    return (
      typeof navigator.share === 'function' &&
      typeof navigator.canShare === 'function' &&
      navigator.canShare({ files })
    );
  } catch {
    return false;
  }
}

export type ShareOutcome = 'compartir_iniciado' | 'cancelado' | 'no_disponible' | 'error';

/** Abre la hoja de compartir del sistema con texto + imágenes. */
export async function shareWithFiles(text: string, files: File[]): Promise<ShareOutcome> {
  if (!canShareFiles(files)) return 'no_disponible';
  try {
    await navigator.share({ text, files });
    // La promesa se resuelve al elegir una app; no confirma el envío.
    return 'compartir_iniciado';
  } catch (err) {
    if ((err as DOMException)?.name === 'AbortError') return 'cancelado';
    return 'error';
  }
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function canCopyImage(): boolean {
  return typeof ClipboardItem !== 'undefined' && typeof navigator.clipboard?.write === 'function';
}

export async function copyImage(png: Blob): Promise<boolean> {
  if (!canCopyImage()) return false;
  try {
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': png })]);
    return true;
  } catch {
    return false;
  }
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/**
 * Abre WhatsApp en otra pestaña. Devuelve false si el navegador bloqueó la
 * ventana (la UI muestra entonces el enlace para abrirlo a mano).
 */
export function openWhatsApp(url: string): boolean {
  const win = window.open(url, '_blank');
  if (!win) return false;
  try {
    win.opener = null;
  } catch {
    /* ignore */
  }
  return true;
}

export function safeFileName(base: string, ext: string): string {
  const slug = base
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 50);
  return `${slug || 'imagen'}.${ext}`;
}
