import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  createSafeElement,
  renderPriceHtml,
  renderQuantityControl,
  toggleActionArea,
  setupActionArea,
  setupImageSkeleton,
  createProductPicture,
  createCartThumbnail,
  showErrorMessage,
} from '../src/js/modules/ui-components.mjs';

describe('ui-components', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('createSafeElement handles attributes, text, and children', () => {
    const child = document.createElement('span');
    child.textContent = 'child';
    const element = createSafeElement(
      'div',
      { id: 'root', text: 'hello', 'data-x': '1' },
      [child, 'tail']
    );

    expect(element.id).toBe('root');
    expect(element.getAttribute('data-x')).toBe('1');
    expect(element.textContent).toContain('hello');
    expect(element.textContent).toContain('child');
    expect(element.textContent).toContain('tail');
  });

  it('renderPriceHtml renders discount and base price', () => {
    const element = renderPriceHtml(1000, 100);
    expect(element.classList.contains('precio-container')).toBe(true);
    expect(element.querySelector('.precio-descuento')).toBeTruthy();
    expect(element.querySelector('.precio-original')).toBeTruthy();
    expect(element.textContent).toMatch(/900/);
    expect(element.textContent).toMatch(/1.?000/);
  });

  it('renderPriceHtml renders single price when no discount', () => {
    const element = renderPriceHtml(2500, 0);
    expect(element.querySelector('.precio')).toBeTruthy();
    expect(element.querySelector('.precio-descuento')).toBeNull();
  });

  it('createProductPicture and createCartThumbnail build responsive images', () => {
    const picture = createProductPicture({
      imagePath: '/img.png',
      avifPath: '/img.avif',
      alt: 'Alt',
      eager: true,
    });

    const source = picture.querySelector('source[type="image/avif"]');
    const img = picture.querySelector('img');

    expect(source).toBeTruthy();
    expect(img.getAttribute('loading')).toBe('eager');
    expect(img.classList.contains('product-thumb')).toBe(true);
    expect(img.classList.contains('is-loading')).toBe(true);

    const cartPicture = createCartThumbnail({
      imagePath: '/thumb.png',
      avifPath: '/thumb.avif',
      alt: 'Thumb',
    });

    const cartImg = cartPicture.querySelector('img');
    expect(cartImg.classList.contains('cart-item-thumb-img')).toBe(true);
    expect(cartImg.getAttribute('sizes')).toBe('100px');
  });

  it('setupImageSkeleton marks loaded images', () => {
    const img = document.createElement('img');
    img.className = 'product-thumb';
    Object.defineProperty(img, 'complete', { value: true, configurable: true });
    Object.defineProperty(img, 'naturalWidth', { value: 100, configurable: true });

    setupImageSkeleton(img);
    expect(img.classList.contains('is-loaded')).toBe(true);
  });

  it('setupImageSkeleton listens for load when not complete', () => {
    const img = document.createElement('img');
    img.className = 'product-thumb';
    Object.defineProperty(img, 'complete', { value: false, configurable: true });
    Object.defineProperty(img, 'naturalWidth', { value: 0, configurable: true });

    setupImageSkeleton(img);
    expect(img.classList.contains('is-loading')).toBe(true);

    img.dispatchEvent(new window.Event('load'));
    expect(img.classList.contains('is-loaded')).toBe(true);
  });

  it('setupActionArea wires quantity controls and toggles visibility', () => {
    const product = { id: 'p1' };
    const getCartItemQuantity = vi.fn().mockReturnValue(2);

    const actionArea = createSafeElement('div', { class: 'action-area' }, [
      createSafeElement('button', { class: 'add-to-cart-btn' }, ['Add']),
      renderQuantityControl(product, getCartItemQuantity),
    ]);
    document.body.appendChild(actionArea);

    const addToCart = vi.fn();
    const updateQuantity = vi.fn();

    setupActionArea(actionArea, product, { addToCart, updateQuantity, getCartItemQuantity });

    const addButton = actionArea.querySelector('.add-to-cart-btn');
    addButton.dispatchEvent(new window.Event('click', { bubbles: true }));
    expect(addToCart).toHaveBeenCalledWith(product, 1);
    expect(addButton.classList.contains('is-hidden')).toBe(true);

    const quantityControl = actionArea.querySelector('.quantity-control');
    expect(quantityControl.classList.contains('is-hidden')).toBe(false);

    const minusBtn = actionArea.querySelector('.quantity-btn[data-action="decrease"]');
    const plusBtn = actionArea.querySelector('.quantity-btn[data-action="increase"]');
    minusBtn.dispatchEvent(new window.Event('click', { bubbles: true }));
    plusBtn.dispatchEvent(new window.Event('click', { bubbles: true }));

    expect(updateQuantity).toHaveBeenCalledWith(product, -1);
    expect(updateQuantity).toHaveBeenCalledWith(product, 1);

    const quantityInput = actionArea.querySelector('.quantity-input');
    quantityInput.value = '5';
    quantityInput.dispatchEvent(new window.Event('change', { bubbles: true }));
    expect(updateQuantity).toHaveBeenCalledWith(product, 3);
  });

  it('toggleActionArea swaps button and control visibility', () => {
    const button = document.createElement('button');
    const control = document.createElement('div');
    toggleActionArea(button, control, true);

    expect(button.classList.contains('is-hidden')).toBe(true);
    expect(control.classList.contains('is-hidden')).toBe(false);
  });

  it('showErrorMessage renders retry UI', () => {
    const container = document.createElement('div');
    container.id = 'product-container';
    document.body.appendChild(container);

    showErrorMessage('Test error');

    const errorMessage = container.querySelector('.error-message');
    expect(errorMessage).toBeTruthy();
    expect(container.textContent).toContain('Test error');
    const retryButton = container.querySelector('.retry-button');
    expect(retryButton).toBeTruthy();
    retryButton.dispatchEvent(new window.Event('click', { bubbles: true }));
  });
});
