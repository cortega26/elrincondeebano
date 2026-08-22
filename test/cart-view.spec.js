/** @vitest-environment jsdom */
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

function formatCurrency(value) {
  const parsed = Number(value);
  const amount = Number.isFinite(parsed) ? parsed : 0;
  return new Intl.NumberFormat('es-CL', {
    style: 'currency',
    currency: 'CLP',
    minimumFractionDigits: 0,
  }).format(amount);
}

function getCartState(cart) {
  const normalized = Array.isArray(cart) ? cart : [];
  let totalItems = 0;
  let totalAmount = 0;
  for (const item of normalized) {
    const qty = Number.isFinite(Number(item.quantity)) ? Number(item.quantity) : 0;
    if (qty <= 0) continue;
    totalItems += qty;
    const price = Number.isFinite(Number(item.price)) ? Number(item.price) : 0;
    const discount = Number.isFinite(Number(item.discount)) ? Number(item.discount) : 0;
    const effective = Math.max(0, price - discount);
    totalAmount += effective * qty;
  }
  return { totalItems, totalAmount };
}

function makeController(container, totalElement, overrides = {}) {
  return createCartViewController({
    container,
    totalElement,
    createElement: createTestElement,
    formatCurrency,
    getCartState,
    triggerTransientClass: vi.fn(),
    syncCheckoutState: vi.fn(),
    syncMobileCartShortcut: vi.fn(),
    shareCart: vi.fn(),
    isOrderJustSent: () => false,
    ...overrides,
  });
}

beforeEach(() => {
  document.body.innerHTML = '';
});

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

describe('cart-view money math', () => {
  it('renders subtotal and total using effective price', () => {
    const container = document.createElement('div');
    container.id = 'cart-items';
    document.body.appendChild(container);
    const totalElement = document.createElement('div');
    totalElement.id = 'cart-total';
    document.body.appendChild(totalElement);

    const controller = makeController(container, totalElement);

    const cart = [
      {
        id: 'p1',
        name: 'Café Premium',
        price: 2000,
        discount: 500,
        image: '',
        quantity: 2,
      },
    ];
    controller.renderCart(cart);

    const priceLine = container.querySelector('.cart-item__price-line');
    const subtotal = container.querySelector('.cart-item__subtotal');

    // effective 1500, subtotal 3000, raw would be 2000/4000 must not appear as subtotal
    expect(priceLine).not.toBeNull();
    expect(priceLine.textContent).toContain((1500).toLocaleString('es-CL'));
    expect(priceLine.textContent).not.toContain((2000).toLocaleString('es-CL') + ' ·');

    expect(subtotal).not.toBeNull();
    expect(subtotal.textContent).toContain((3000).toLocaleString('es-CL'));
    expect(subtotal.textContent).not.toContain((4000).toLocaleString('es-CL'));

    expect(totalElement.textContent).toContain((3000).toLocaleString('es-CL'));
    expect(container.querySelector('.cart-share-row')).not.toBeNull();
  });

  it('clamps effective price to zero when discount exceeds price', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const totalElement = document.createElement('div');
    document.body.appendChild(totalElement);
    const controller = makeController(container, totalElement);
    const cart = [
      { id: 'p2', name: 'Gratis', price: 1000, discount: 1500, image: '', quantity: 1 },
    ];
    controller.renderCart(cart);
    const subtotal = container.querySelector('.cart-item__subtotal');
    expect(subtotal.textContent).toContain('$0');
    expect(totalElement.textContent).toContain('$0');
  });

  it('removes share row when last item is removed', () => {
    const container = document.createElement('div');
    container.id = 'cart-items';
    document.body.appendChild(container);
    const totalElement = document.createElement('div');
    totalElement.id = 'cart-total';
    document.body.appendChild(totalElement);

    const controller = makeController(container, totalElement);

    const cart = [{ id: 'p1', name: 'Pan', price: 1000, discount: 200, image: '', quantity: 1 }];
    controller.renderCart(cart);
    expect(container.querySelector('.cart-item')).not.toBeNull();
    expect(container.querySelector('.cart-share-row')).not.toBeNull();
    expect(totalElement.textContent).toContain((800).toLocaleString('es-CL'));

    // targeted remove of last item
    controller.renderCart([], { changedItemId: 'p1' });

    expect(container.querySelector('.cart-item')).toBeNull();
    expect(container.querySelector('.cart-share-row')).toBeNull();
    expect(container.textContent).toContain('Tu carrito está vacío');
    expect(totalElement.textContent).toContain('$0');
  });

  it('updates subtotal via targeted quantity change using effective price', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const totalElement = document.createElement('div');
    document.body.appendChild(totalElement);
    const controller = makeController(container, totalElement);

    controller.renderCart([
      { id: 'p1', name: 'Leche', price: 1000, discount: 200, image: '', quantity: 1 },
    ]);
    const firstSubtotal = container.querySelector('.cart-item__subtotal').textContent;
    expect(firstSubtotal).toContain((800).toLocaleString('es-CL'));

    controller.renderCart(
      [{ id: 'p1', name: 'Leche', price: 1000, discount: 200, image: '', quantity: 3 }],
      { changedItemId: 'p1' }
    );
    const updated = container.querySelector('.cart-item__subtotal').textContent;
    expect(updated).toContain((2400).toLocaleString('es-CL'));
    expect(totalElement.textContent).toContain((2400).toLocaleString('es-CL'));
  });
});
