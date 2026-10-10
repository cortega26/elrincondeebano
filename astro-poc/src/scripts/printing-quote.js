import {
  calculatePrintingQuote,
  buildPrintingWhatsAppMessage,
  buildPrintingWhatsAppUrl,
  validatePrintingFile,
} from '../lib/printing-pricing.js';
import { formatCurrency } from '../lib/formatting.js';

function initializePrintingQuote() {
  const root = document.querySelector('[data-printing-calculator]');
  if (!root || root.dataset.initialized === 'true') {
    return;
  }
  root.dataset.initialized = 'true';

  const paperSizeInput = root.querySelector('#printing-paper-size');
  const bwUnitOutput = root.querySelector('#printing-bw-unit-price');
  const colorUnitOutput = root.querySelector('#printing-color-unit-price');
  const bwInput = root.querySelector('#printing-bw');
  const colorInput = root.querySelector('#printing-color');
  const serviceOutput = root.querySelector('#printing-service-cost');
  const bwOutput = root.querySelector('#printing-bw-cost');
  const colorOutput = root.querySelector('#printing-color-cost');
  const totalOutput = root.querySelector('#printing-total');
  const submitLink = root.querySelector('#printing-whatsapp');
  const submitLabel = root.querySelector('#printing-whatsapp-label');
  const errorOutput = root.querySelector('#printing-error');

  const digitalSection = root.querySelector('#printing-digital-section');
  const physicalSection = root.querySelector('#printing-physical-section');
  const fileInput = root.querySelector('#printing-file');
  const fileFeedback = root.querySelector('#printing-file-feedback');
  const shareButton = root.querySelector('#printing-share-file');
  const shareHelp = root.querySelector('.printing-quote__share-help');
  const shareFeedback = root.querySelector('#printing-share-feedback');

  const requestType = () =>
    root.querySelector('input[name="printing-source"]:checked')?.value || 'archivo';

  function getShareCapability(file) {
    if (typeof navigator.share !== 'function' || typeof navigator.canShare !== 'function') {
      return false;
    }
    try {
      return navigator.canShare({ files: [file] });
    } catch {
      return false;
    }
  }

  function setCallToAction(url) {
    if (url) {
      submitLink.href = url;
      submitLink.removeAttribute('aria-disabled');
      submitLink.removeAttribute('tabindex');
    } else {
      submitLink.removeAttribute('href');
      submitLink.setAttribute('aria-disabled', 'true');
      submitLink.setAttribute('tabindex', '-1');
    }
  }

  function render() {
    const physical = requestType() === 'original';
    digitalSection.hidden = physical;
    physicalSection.hidden = !physical;
    shareButton.hidden = true;
    shareHelp.hidden = true;

    try {
      const quote = calculatePrintingQuote(bwInput.value, colorInput.value, paperSizeInput.value);
      bwUnitOutput.textContent = `${formatCurrency(quote.blackAndWhiteUnitPrice)} por página`;
      colorUnitOutput.textContent = `${formatCurrency(quote.colorUnitPrice)} por página`;
      serviceOutput.textContent = formatCurrency(quote.serviceCost);
      bwOutput.textContent = formatCurrency(quote.blackAndWhiteCost);
      colorOutput.textContent = formatCurrency(quote.colorCost);
      totalOutput.textContent = formatCurrency(quote.total);
      errorOutput.textContent = quote.hasPages ? '' : 'Agrega al menos una página para solicitar.';
      paperSizeInput.removeAttribute('aria-invalid');
      bwInput.removeAttribute('aria-invalid');
      colorInput.removeAttribute('aria-invalid');

      setCallToAction(buildPrintingWhatsAppUrl(quote, { requestType: requestType() }));
      submitLabel.textContent = physical
        ? 'Coordinar originales por WhatsApp'
        : 'Enviar cotización por WhatsApp';

      if (!physical) {
        const file = fileInput.files?.[0];
        if (!file) {
          fileFeedback.textContent = 'Puedes seleccionar un archivo para compartirlo junto a la cotización, o adjuntarlo después en WhatsApp.';
        } else {
          const validation = validatePrintingFile(file);
          if (!validation.valid) {
            fileFeedback.textContent = validation.message;
          } else if (getShareCapability(file)) {
            fileFeedback.textContent = `Archivo listo: ${file.name}. No se carga al sitio.`;
            shareButton.hidden = !quote.hasPages;
            shareHelp.hidden = shareButton.hidden;
          } else {
            fileFeedback.textContent = `Archivo elegido: ${file.name}. Este navegador no permite compartirlo desde la web: abre WhatsApp y adjúntalo allí.`;
          }
        }
      }
    } catch (error) {
      errorOutput.textContent = error instanceof Error ? error.message : 'Revisa las cantidades.';
      paperSizeInput.setAttribute('aria-invalid', 'true');
      bwInput.setAttribute('aria-invalid', 'true');
      colorInput.setAttribute('aria-invalid', 'true');
      setCallToAction(null);
      serviceOutput.textContent = '—';
      bwOutput.textContent = '—';
      colorOutput.textContent = '—';
      totalOutput.textContent = '—';
    }
  }

  root.querySelectorAll('input[name="printing-source"]').forEach((radio) => {
    radio.addEventListener('change', () => {
      // Nunca conservar ni compartir accidentalmente un archivo al cambiar
      // al flujo de originales físicos.
      if (requestType() === 'original') fileInput.value = '';
      shareFeedback.textContent = '';
      render();
    });
  });

  shareButton.addEventListener('click', async () => {
    const file = fileInput.files?.[0];
    const validFile = validatePrintingFile(file);
    if (requestType() !== 'archivo' || !validFile.valid || !getShareCapability(file)) {
      shareFeedback.textContent = 'No se puede compartir desde aquí. Usa WhatsApp y adjunta el archivo en el chat.';
      render();
      return;
    }

    let quote;
    try {
      quote = calculatePrintingQuote(bwInput.value, colorInput.value, paperSizeInput.value);
    } catch {
      render();
      return;
    }
    if (!quote.hasPages) return;

    // La API exige activación directa del usuario: no agregar awaits antes.
    try {
      await navigator.share({
        title: 'Impresiones · El Rincón de Ébano',
        text: buildPrintingWhatsAppMessage(quote, { requestType: 'archivo' }),
        files: [file],
      });
      shareFeedback.textContent = 'Se abrió el flujo para compartir. Comprueba en la aplicación elegida que aparezcan el archivo y la cotización; no constituye un pedido confirmado.';
    } catch (error) {
      if (error?.name !== 'AbortError') {
        shareFeedback.textContent = 'No fue posible compartir. Usa el botón de WhatsApp y adjunta el archivo en la conversación.';
      }
    }
  });

  paperSizeInput.addEventListener('change', render);
  bwInput.addEventListener('input', render);
  colorInput.addEventListener('input', render);
  fileInput.addEventListener('change', () => {
    shareFeedback.textContent = '';
    render();
  });
  render();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializePrintingQuote, { once: true });
} else {
  initializePrintingQuote();
}
