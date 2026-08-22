/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createOrderSubmitController } from '../astro-poc/src/scripts/storefront/order-submit.js';

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

function makeController(overrides = {}) {
  return createOrderSubmitController({
    createElement: createTestElement,
    formatCurrency,
    getCartState,
    getSelectedPaymentValue: () => 'Efectivo',
    readProfileForm: () => ({ deliveryNote: '' }),
    getSelectedSubstitutionPreference: () => 'similar',
    saveProfile: vi.fn(),
    savePreferredPayment: vi.fn(),
    saveSubstitutionPreference: vi.fn(),
    buildWhatsAppPreview: vi.fn(),
    showOrderConfirmationDialog: vi.fn(),
    ...overrides,
  });
}

beforeEach(() => {
  document.body.innerHTML = `
    <div id="payment-error"></div>
    <div id="order-confirm-summary"></div>
    <input type="radio" name="paymentMethod" value="Efectivo" />
  `;
});

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

describe('order-submit buildWhatsAppMessageText', () => {
  it('applies discount as price - discount', () => {
    const controller = makeController();
    const cart = [{ name: 'Aceite', price: 2000, discount: 500, quantity: 1 }];
    const text = controller.buildWhatsAppMessageText(cart, 1500, 'Efectivo', 'similar', '');
    const eff = (1500).toLocaleString('es-CL');
    const raw = (2000).toLocaleString('es-CL');
    expect(text).toContain(`$${eff}`);
    expect(text).not.toContain(`$${raw} =`);
  });

  it('clamps effective price to $0 when discount equals price', () => {
    const controller = makeController();
    const cart = [{ name: 'Pan', price: 1000, discount: 1000, quantity: 1 }];
    const text = controller.buildWhatsAppMessageText(cart, 0, 'Efectivo', 'similar', '');
    expect(text).toContain('$0');
    expect(text).toContain('1 × $0 = $0');
  });

  it('clamps effective price to $0 when discount exceeds price', () => {
    const controller = makeController();
    const cart = [{ name: 'Leche', price: 1000, discount: 1500, quantity: 2 }];
    const text = controller.buildWhatsAppMessageText(cart, 0, 'Efectivo', 'similar', '');
    expect(text).toContain('$0');
  });

  it('calculates qty * effectivePrice subtotal with es-CL formatting', () => {
    const controller = makeController();
    const cart = [{ name: 'Café', price: 1500, discount: 300, quantity: 2 }];
    // effective 1200 *2 =2400
    const text = controller.buildWhatsAppMessageText(cart, 2400, 'Efectivo', 'similar', '');
    const pricePart = (1200).toLocaleString('es-CL');
    const subtotalPart = (2400).toLocaleString('es-CL');
    expect(text).toContain(`2 × $${pricePart} = $${subtotalPart}`);
  });

  it('includes delivery note when present', () => {
    const controller = makeController();
    const cart = [{ name: 'Azúcar', price: 1000, quantity: 1 }];
    const text = controller.buildWhatsAppMessageText(cart, 1000, 'Efectivo', 'similar', 'Puerta 3');
    expect(text).toContain('Nota:');
    expect(text).toContain('Puerta 3');
  });

  it('omits note line when deliveryNote is empty', () => {
    const controller = makeController();
    const cart = [{ name: 'Azúcar', price: 1000, quantity: 1 }];
    const text = controller.buildWhatsAppMessageText(cart, 1000, 'Efectivo', 'similar', '');
    expect(text).not.toContain('Nota:');
  });

  it('omits note line when deliveryNote is falsy', () => {
    const controller = makeController();
    const cart = [{ name: 'Azúcar', price: 1000, quantity: 1 }];
    const text = controller.buildWhatsAppMessageText(cart, 1000, 'Efectivo', 'similar', undefined);
    expect(text).not.toContain('Nota:');
  });
});

describe('order-submit submitCartOrder', () => {
  it('shows error and does not capture pending order when no payment selected', () => {
    const controller = makeController({
      getSelectedPaymentValue: () => '',
    });
    const cart = [{ id: 'p1', name: 'Pan', price: 1000, quantity: 1 }];
    controller.submitCartOrder(cart);
    const errEl = document.getElementById('payment-error');
    expect(errEl.textContent).toBe('Selecciona un método de pago antes de enviar el pedido.');
    expect(controller.takePendingOrder()).toBeNull();
  });

  it('captures pending order with payment and uses effective total', () => {
    const saveProfile = vi.fn();
    const savePreferredPayment = vi.fn();
    const saveSubstitutionPreference = vi.fn();
    const buildWhatsAppPreview = vi.fn();
    const showOrderConfirmationDialog = vi.fn();
    const getSelectedPaymentValue = () => 'Transferencia';
    const readProfileForm = () => ({ name: 'Ana', deliveryNote: 'Timbre 2' });
    const getSelectedSubstitutionPreference = () => 'exacto';

    const controller = makeController({
      getSelectedPaymentValue,
      readProfileForm,
      getSelectedSubstitutionPreference,
      saveProfile,
      savePreferredPayment,
      saveSubstitutionPreference,
      buildWhatsAppPreview,
      showOrderConfirmationDialog,
      getCartState,
    });

    const cart = [{ id: 'p1', name: 'Aceite', price: 2000, discount: 500, quantity: 2 }];
    controller.submitCartOrder(cart);
    const pending = controller.takePendingOrder();
    expect(pending).not.toBeNull();
    expect(pending.selectedPayment).toBe('Transferencia');
    expect(pending.totalAmount).toBe(3000);
    expect(pending.message).toContain((1500).toLocaleString('es-CL'));
    expect(pending.message).toContain((3000).toLocaleString('es-CL'));
    expect(saveProfile).toHaveBeenCalledWith({ name: 'Ana', deliveryNote: 'Timbre 2' });
    expect(savePreferredPayment).toHaveBeenCalledWith('Transferencia');
    expect(saveSubstitutionPreference).toHaveBeenCalledWith('exacto');
    expect(buildWhatsAppPreview).toHaveBeenCalled();
    expect(showOrderConfirmationDialog).toHaveBeenCalled();
    expect(controller.takePendingOrder()).toBeNull();
  });

  it('does nothing for empty cart', () => {
    const controller = makeController();
    controller.submitCartOrder([]);
    expect(controller.takePendingOrder()).toBeNull();
    const errEl = document.getElementById('payment-error');
    expect(errEl.textContent).toBe('');
  });
});
