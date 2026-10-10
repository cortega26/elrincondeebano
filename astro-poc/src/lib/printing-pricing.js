import { WHATSAPP_NUMBER, formatCurrency } from './formatting.js';

/** Tarifa por pedido: la atención se cobra una sola vez, sin importar la mezcla de páginas. */
export const PRINTING_RATES = Object.freeze({
  service: 500,
  blackAndWhite: 200,
  color: 400,
});

export const MAX_PRINTING_PAGES_PER_TYPE = 500;

function validatePageCount(value) {
  if (value === '' || value === null || value === undefined) {
    throw new RangeError('Indica un número de páginas válido.');
  }
  const parsed = Number(value);
  if (
    !Number.isSafeInteger(parsed) ||
    parsed < 0 ||
    parsed > MAX_PRINTING_PAGES_PER_TYPE
  ) {
    throw new RangeError(`Ingresa entre 0 y ${MAX_PRINTING_PAGES_PER_TYPE} páginas por tipo.`);
  }
  return parsed;
}

export function calculatePrintingQuote(blackAndWhite, color) {
  const blackAndWhitePages = validatePageCount(blackAndWhite);
  const colorPages = validatePageCount(color);
  const hasPages = blackAndWhitePages + colorPages > 0;

  const serviceCost = hasPages ? PRINTING_RATES.service : 0;
  const blackAndWhiteCost = blackAndWhitePages * PRINTING_RATES.blackAndWhite;
  const colorCost = colorPages * PRINTING_RATES.color;

  return {
    blackAndWhitePages,
    colorPages,
    hasPages,
    serviceCost,
    blackAndWhiteCost,
    colorCost,
    total: serviceCost + blackAndWhiteCost + colorCost,
  };
}

/** Solicitud precotizada, nunca un pedido ni un cobro confirmado. */
export function buildPrintingWhatsAppUrl(quote) {
  if (!quote?.hasPages) {
    return null;
  }

  const lines = [
    'Hola, quiero cotizar impresiones/fotocopias en El Rincón de Ébano.',
    `Blanco y negro: ${quote.blackAndWhitePages} página(s) (${formatCurrency(quote.blackAndWhiteCost)}).`,
    `Color: ${quote.colorPages} página(s) (${formatCurrency(quote.colorCost)}).`,
    `Atención y entrega: ${formatCurrency(quote.serviceCost)} por pedido.`,
    `Total estimado: ${formatCurrency(quote.total)}.`,
    'Es para documentos en papel común, a una cara. Enviaré los archivos o coordinaré los originales por este chat.',
    'Entiendo que el precio final y la disponibilidad se confirman por WhatsApp.',
  ];

  return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(lines.join('\n'))}`;
}
