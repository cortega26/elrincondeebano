import { calculatePrintingQuote, buildPrintingWhatsAppUrl } from '../lib/printing-pricing.js';
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
  const errorOutput = root.querySelector('#printing-error');

  function render() {
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

      const url = buildPrintingWhatsAppUrl(quote);
      if (url) {
        submitLink.href = url;
        submitLink.removeAttribute('aria-disabled');
        submitLink.removeAttribute('tabindex');
      } else {
        submitLink.removeAttribute('href');
        submitLink.setAttribute('aria-disabled', 'true');
        submitLink.setAttribute('tabindex', '-1');
      }
    } catch (error) {
      errorOutput.textContent = error instanceof Error ? error.message : 'Revisa las cantidades.';
      paperSizeInput.setAttribute('aria-invalid', 'true');
      bwInput.setAttribute('aria-invalid', 'true');
      colorInput.setAttribute('aria-invalid', 'true');
      submitLink.removeAttribute('href');
      submitLink.setAttribute('aria-disabled', 'true');
      submitLink.setAttribute('tabindex', '-1');
      serviceOutput.textContent = '—';
      bwOutput.textContent = '—';
      colorOutput.textContent = '—';
      totalOutput.textContent = '—';
    }
  }

  paperSizeInput.addEventListener('change', render);
  bwInput.addEventListener('input', render);
  colorInput.addEventListener('input', render);
  render();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializePrintingQuote, { once: true });
} else {
  initializePrintingQuote();
}
