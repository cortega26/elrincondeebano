import {
  calculateCombinedPrintingQuote,
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

  const bwInput = root.querySelector('#printing-bw');
  const colorInput = root.querySelector('#printing-color');
  const bwOficioInput = root.querySelector('#printing-bw-oficio');
  const colorOficioInput = root.querySelector('#printing-color-oficio');
  const quantityInputs = [bwInput, colorInput, bwOficioInput, colorOficioInput];
  const quantityButtons = root.querySelectorAll('.printing-quote__step');
  const serviceOutput = root.querySelector('#printing-service-cost');
  const bwOutput = root.querySelector('#printing-bw-cost');
  const colorOutput = root.querySelector('#printing-color-cost');
  const bwOficioOutput = root.querySelector('#printing-bw-oficio-cost');
  const colorOficioOutput = root.querySelector('#printing-color-oficio-cost');
  const totalOutput = root.querySelector('#printing-total');
  const submitLink = root.querySelector('#printing-whatsapp');
  const submitLabel = root.querySelector('#printing-whatsapp-label');
  const errorOutput = root.querySelector('#printing-error');

  const getQuote = () => calculateCombinedPrintingQuote({
    carta: { blackAndWhite: bwInput.value, color: colorInput.value },
    oficio: { blackAndWhite: bwOficioInput.value, color: colorOficioInput.value },
  });

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

  function syncQuantityButtons() {
    quantityButtons.forEach((button) => {
      const input = root.querySelector(`#${button.dataset.printingTarget}`);
      const count = input.value === '' ? NaN : Number(input.value);
      const next = count + Number(button.dataset.printingDelta);
      button.disabled =
        !Number.isSafeInteger(count) ||
        count < Number(input.min) ||
        count > Number(input.max) ||
        next < Number(input.min) ||
        next > Number(input.max);
    });
  }

  function render() {
    syncQuantityButtons();
    const physical = requestType() === 'original';
    digitalSection.hidden = physical;
    physicalSection.hidden = !physical;
    shareButton.hidden = true;
    shareHelp.hidden = true;

    try {
      const quote = getQuote();
      serviceOutput.textContent = formatCurrency(quote.serviceCost);
      bwOutput.textContent = formatCurrency(quote.formats.carta.blackAndWhiteCost);
      colorOutput.textContent = formatCurrency(quote.formats.carta.colorCost);
      bwOficioOutput.textContent = formatCurrency(quote.formats.oficio.blackAndWhiteCost);
      colorOficioOutput.textContent = formatCurrency(quote.formats.oficio.colorCost);
      totalOutput.textContent = formatCurrency(quote.total);
      errorOutput.textContent = quote.hasPages ? '' : 'Agrega al menos una página para solicitar.';
      quantityInputs.forEach((input) => input.removeAttribute('aria-invalid'));

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
      quantityInputs.forEach((input) => {
        const count = input.value === '' ? NaN : Number(input.value);
        if (!Number.isSafeInteger(count) || count < 0 || count > 500) {
          input.setAttribute('aria-invalid', 'true');
        } else {
          input.removeAttribute('aria-invalid');
        }
      });
      setCallToAction(null);
      serviceOutput.textContent = '—';
      bwOutput.textContent = '—';
      colorOutput.textContent = '—';
      bwOficioOutput.textContent = '—';
      colorOficioOutput.textContent = '—';
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
      quote = getQuote();
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

  quantityButtons.forEach((button) => {
    button.addEventListener('click', () => {
      const input = root.querySelector(`#${button.dataset.printingTarget}`);
      const count = input.value === '' ? NaN : Number(input.value);
      const delta = Number(button.dataset.printingDelta);
      if (
        button.disabled ||
        !Number.isSafeInteger(count) ||
        count < Number(input.min) ||
        count > Number(input.max)
      ) return;
      input.value = String(Math.max(Number(input.min), Math.min(Number(input.max), count + delta)));
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
  });

  quantityInputs.forEach((input) => input.addEventListener('input', render));
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
