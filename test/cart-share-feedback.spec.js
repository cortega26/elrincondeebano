/** @vitest-environment jsdom */
// Plan 177: the share button labels success/failure only after the clipboard
// promise settles — never claims success while the write is still pending.
// (Kept in its own file: test/cart-view.spec.js carries a pre-existing
// 84-line money-math describe that trips max-lines-per-function as soon as
// the file is touched — left for a dedicated cleanup, not this plan.)
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createCartViewController } from '../astro-poc/src/scripts/storefront/cart-view.js';

function createTestElement(tagName, { className = '', text = '', attrs = {} } = {}) {
  const element = document.createElement(tagName);
  if (className) element.className = className;
  if (text) element.textContent = text;
  Object.entries(attrs).forEach(([key, value]) => {
    if (value !== null && value !== undefined) element.setAttribute(key, String(value));
  });
  return element;
}

function renderShareButton(shareCartImpl) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const totalElement = document.createElement('div');
  document.body.appendChild(totalElement);
  const controller = createCartViewController({
    container,
    totalElement,
    createElement: createTestElement,
    formatCurrency: (value) => String(value),
    getCartState: () => ({ totalItems: 1, totalAmount: 1000 }),
    triggerTransientClass: vi.fn(),
    syncCheckoutState: vi.fn(),
    syncMobileCartShortcut: vi.fn(),
    shareCart: shareCartImpl,
    isOrderJustSent: () => false,
  });
  controller.renderCart([
    { id: 'p1', name: 'Café', price: 1000, discount: 0, image: '', quantity: 1 },
  ]);
  return container.querySelector('.cart-share-row button');
}

beforeEach(() => {
  document.body.innerHTML = '';
});

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

describe('cart share feedback (plan 177)', () => {
  it('labels success only after the clipboard promise resolves true', async () => {
    const btn = renderShareButton(vi.fn().mockResolvedValue(true));
    expect(btn.textContent).toBe('Compartir carrito');
    btn.click();
    await vi.waitFor(() => expect(btn.textContent).toBe('¡Enlace copiado!'));
  });

  it('labels failure when the clipboard write fails', async () => {
    const btn = renderShareButton(vi.fn().mockResolvedValue(false));
    btn.click();
    await vi.waitFor(() => expect(btn.textContent).toBe('No se pudo copiar'));
  });
});
