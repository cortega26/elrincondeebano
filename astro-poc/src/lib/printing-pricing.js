import { WHATSAPP_NUMBER, formatCurrency } from './formatting.js';

/** Tarifa por pedido: la atención se cobra una sola vez, sin importar la mezcla de páginas. */
export const PRINTING_RATES = Object.freeze({
  service: 500,
  blackAndWhite: 200,
  color: 400,
});

export const MAX_PRINTING_PAGES_PER_TYPE = 500;
export const MAX_PRINTING_FILE_BYTES = 15 * 1024 * 1024;

export const PRINTING_REQUEST_TYPES = Object.freeze({
  archivo: 'archivo',
  original: 'original',
});

// Los recargos se suman por página al precio base de carta, nunca al cargo fijo.
export const PRINTING_PAPER_FORMATS = Object.freeze({
  carta: Object.freeze({ label: 'Carta', blackAndWhiteSurcharge: 0, colorSurcharge: 0 }),
  oficio: Object.freeze({ label: 'Oficio', blackAndWhiteSurcharge: 50, colorSurcharge: 100 }),
});

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

export function calculatePrintingQuote(blackAndWhite, color, paperSize = 'carta') {
  const blackAndWhitePages = validatePageCount(blackAndWhite);
  const colorPages = validatePageCount(color);

  if (!Object.hasOwn(PRINTING_PAPER_FORMATS, paperSize)) {
    throw new RangeError('Selecciona formato carta u oficio.');
  }

  const format = PRINTING_PAPER_FORMATS[paperSize];
  const blackAndWhiteUnitPrice = PRINTING_RATES.blackAndWhite + format.blackAndWhiteSurcharge;
  const colorUnitPrice = PRINTING_RATES.color + format.colorSurcharge;
  const hasPages = blackAndWhitePages + colorPages > 0;

  const serviceCost = hasPages ? PRINTING_RATES.service : 0;
  const blackAndWhiteCost = blackAndWhitePages * blackAndWhiteUnitPrice;
  const colorCost = colorPages * colorUnitPrice;

  return {
    paperSize,
    paperSizeLabel: format.label,
    blackAndWhiteUnitPrice,
    colorUnitPrice,
    blackAndWhitePages,
    colorPages,
    hasPages,
    serviceCost,
    blackAndWhiteCost,
    colorCost,
    total: serviceCost + blackAndWhiteCost + colorCost,
  };
}

/** Una sola cotización admite cantidades independientes en carta y oficio. */
export function calculateCombinedPrintingQuote({ carta, oficio }) {
  if (!carta || !oficio) {
    throw new RangeError('Indica las cantidades de carta y oficio.');
  }

  const formats = {
    carta: calculatePrintingQuote(carta.blackAndWhite, carta.color, 'carta'),
    oficio: calculatePrintingQuote(oficio.blackAndWhite, oficio.color, 'oficio'),
  };
  const hasPages = formats.carta.hasPages || formats.oficio.hasPages;
  const blackAndWhiteCost = formats.carta.blackAndWhiteCost + formats.oficio.blackAndWhiteCost;
  const colorCost = formats.carta.colorCost + formats.oficio.colorCost;
  const serviceCost = hasPages ? PRINTING_RATES.service : 0;

  return {
    formats,
    hasPages,
    blackAndWhiteCost,
    colorCost,
    serviceCost,
    total: blackAndWhiteCost + colorCost + serviceCost,
  };
}

/** Solo metadatos locales: el archivo jamás se carga ni almacena en esta web. */
export function validatePrintingFile(file) {
  if (!file) {
    return { valid: false, message: 'Selecciona un archivo.' };
  }

  if (!/\.(pdf|doc|docx|jpe?g|png)$/i.test(String(file.name || ''))) {
    return { valid: false, message: 'Formato no admitido. Usa PDF, Word, JPG o PNG.' };
  }

  if (!Number.isSafeInteger(file.size) || file.size < 1 || file.size > MAX_PRINTING_FILE_BYTES) {
    return { valid: false, message: 'Selecciona un archivo de hasta 15 MB.' };
  }

  return { valid: true, message: '' };
}

function validateRequestType(requestType) {
  if (!Object.hasOwn(PRINTING_REQUEST_TYPES, requestType)) {
    throw new RangeError('Selecciona impresión digital o fotocopia de originales.');
  }
}

/** Texto reutilizado por WhatsApp y por la función nativa de compartir archivos. */
export function buildPrintingWhatsAppMessage(quote, { requestType = 'archivo' } = {}) {
  validateRequestType(requestType);
  if (!quote?.hasPages) {
    return null;
  }

  const formatLines = (quote.formats
    ? Object.values(quote.formats).filter((format) => format.hasPages)
    : [quote]
  ).flatMap((format) => [
    `Formato: ${format.paperSizeLabel}.`,
    `Blanco y negro: ${format.blackAndWhitePages} página(s) a ${formatCurrency(format.blackAndWhiteUnitPrice)} c/u (${formatCurrency(format.blackAndWhiteCost)}).`,
    `Color: ${format.colorPages} página(s) a ${formatCurrency(format.colorUnitPrice)} c/u (${formatCurrency(format.colorCost)}).`,
  ]);

  const sizesDescription = quote.formats
    ? 'tamaños carta y/u oficio según el desglose'
    : `tamaño ${quote.paperSizeLabel.toLowerCase()}`;

  const lines = [
    'Hola, quiero cotizar impresiones/fotocopias en El Rincón de Ébano.',
    `Tipo: ${requestType === 'archivo' ? 'impresión desde archivo digital' : 'fotocopia de originales físicos'}.`,
    ...formatLines,
    `Atención y entrega: ${formatCurrency(quote.serviceCost)} por pedido.`,
    `Total: ${formatCurrency(quote.total)}.`,
    `Precios para documentos de texto en papel bond de 75 g/m², ${sizesDescription} y a una cara. Fotografías o impresiones de alta cobertura se cotizan aparte.`,
    requestType === 'archivo'
      ? 'Compartiré el archivo mediante el dispositivo o lo adjuntaré en este chat.'
      : 'Las cantidades son páginas finales estimadas. Necesito coordinar la recepción y devolución de los originales físicos; confirmaremos el precio tras revisarlos.',
    'Entiendo que el precio final y la disponibilidad se confirman por WhatsApp.',
  ];

  return lines.join('\n');
}

/** Solicitud precotizada, nunca un pedido ni un cobro confirmado. */
export function buildPrintingWhatsAppUrl(quote, options = {}) {
  const message = buildPrintingWhatsAppMessage(quote, options);
  return message ? `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}` : null;
}
