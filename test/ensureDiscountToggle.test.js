const test = require('node:test');
const assert = require('node:assert');
const { JSDOM } = require('jsdom');

test('ensureDiscountToggle inserts a single toggle', () => {
  const dom = new JSDOM(
    `<!DOCTYPE html><section aria-label="Opciones de filtrado"><div class="row"></div></section>`
  );
  global.window = dom.window;
  global.document = dom.window.document;

  function ensureDiscountToggle() {
    let toggle = document.getElementById('filter-discount');
    if (toggle) return toggle;

    const filterSection = document.querySelector(
      'section[aria-label*="filtrado"], section[aria-label*="Opciones de filtrado"]'
    );
    const filterSectionRow = filterSection ? filterSection.querySelector('.row') : null;
    if (!filterSectionRow) return null;

    const col = document.createElement('div');
    col.className = 'col-12 mt-2';
    const formCheck = document.createElement('div');
    formCheck.className = 'form-check form-switch';
    const input = document.createElement('input');
    input.className = 'form-check-input';
    input.type = 'checkbox';
    input.id = 'filter-discount';
    input.setAttribute('aria-label', 'Mostrar solo productos con descuento');
    const label = document.createElement('label');
    label.className = 'form-check-label';
    label.htmlFor = 'filter-discount';
    label.textContent = 'Solo productos con descuento';
    formCheck.appendChild(input);
    formCheck.appendChild(label);
    col.appendChild(formCheck);
    filterSectionRow.appendChild(col);
    return input;
  }

  const first = ensureDiscountToggle();
  assert.ok(first, 'toggle should be created');
  assert.ok(document.getElementById('filter-discount'));
  assert.strictEqual(document.querySelectorAll('#filter-discount').length, 1);

  const second = ensureDiscountToggle();
  assert.strictEqual(second, first, 'should return existing toggle');
  assert.strictEqual(
    document.querySelectorAll('#filter-discount').length,
    1,
    'should not duplicate toggle'
  );
});
