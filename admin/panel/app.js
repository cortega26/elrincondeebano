/* global bootstrap */
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

const GRID_BODY_SELECTOR = '#grid-body';
const SELECT_ROWS_MESSAGE = 'Seleccione filas';

let products = [];
const originalMeta = { version: null, last_updated: null };

async function fetchProductJson() {
  const endpoints = [
    '${window.location.origin}/data/product_data.json',
    'https://elrincondeebano.com/data/product_data.json',
  ];
  let lastErr;
  for (const url of endpoints) {
    try {
      const res = await fetch(url, { cache: 'no-cache' });
      if (!res.ok) {
        lastErr = new Error(`HTTP ${res.status} @ ${url}`);
        continue;
      }
      return await res.json();
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error('No se pudo obtener product_data.json');
}

async function loadFromServer() {
  let data;
  try {
    data = await fetchProductJson();
  } catch (err) {
    console.error('Error cargando productos:', err);
    alert('No se pudo cargar product_data.json. Revise CORS/Cloudflare y vuelva a intentar.');
    return;
  }
  products = data.products || data;
  originalMeta.version = data.version || null;
  originalMeta.last_updated = data.last_updated || null;
  renderFilters();
  renderGrid();
}

function renderFilters() {
  const categories = Array.from(new Set(products.map((p) => p.category).filter(Boolean))).sort();
  const select = $('#category');
  select.textContent = '';
  const defaultOption = document.createElement('option');
  defaultOption.value = '';
  defaultOption.textContent = 'Todas las categorías';
  select.appendChild(defaultOption);
  categories.forEach((category) => {
    const option = document.createElement('option');
    option.value = category;
    option.textContent = category;
    select.appendChild(option);
  });
}

function pid(p) {
  return (p.name + '|' + (p.category || '')).toLowerCase();
}
function findByPid(id) {
  return products.find((p) => pid(p) === id);
}

function createTextCell(value) {
  const td = document.createElement('td');
  td.textContent = value || '';
  return td;
}

function createCellWith(child) {
  const td = document.createElement('td');
  td.appendChild(child);
  return td;
}

function createCheckboxCell({ id, field, checked = false }) {
  const input = document.createElement('input');
  input.type = 'checkbox';
  if (typeof checked === 'boolean') {
    input.checked = checked;
  }
  input.dataset.id = id;
  if (field) {
    input.dataset.field = field;
  }
  return createCellWith(input);
}

function createNumberInputCell({ id, field, value, min, step }) {
  const input = document.createElement('input');
  input.type = 'number';
  input.className = 'form-control form-control-sm';
  input.value = String(value ?? '');
  input.min = String(min);
  input.step = String(step);
  input.dataset.field = field;
  input.dataset.id = id;
  return createCellWith(input);
}

function createTextInput({ id, field, value, placeholder }) {
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'form-control';
  input.value = value || '';
  if (placeholder) {
    input.placeholder = placeholder;
  }
  input.dataset.field = field;
  input.dataset.id = id;
  return input;
}

function createImageButton({ id, field }) {
  const button = document.createElement('button');
  button.className = 'btn btn-outline-secondary btn-img-mgr';
  button.type = 'button';
  button.dataset.field = field;
  button.dataset.id = id;
  button.title = 'Gestionar imagen';
  button.textContent = '📷';
  return button;
}

function createImageInputCell({ id, field, value, placeholder }) {
  const group = document.createElement('div');
  group.className = 'input-group input-group-sm';
  const input = createTextInput({ id, field, value, placeholder });
  const button = createImageButton({ id, field });
  group.append(input, button);
  return createCellWith(group);
}

function renderGrid() {
  const filter = ($('#filter').value || '').toLowerCase();
  const cat = $('#category').value;
  const rows = products
    .filter((p) => !cat || p.category === cat)
    .filter(
      (p) =>
        !filter ||
        p.name?.toLowerCase().includes(filter) ||
        p.description?.toLowerCase().includes(filter)
    );

  const tbody = $(GRID_BODY_SELECTOR);
  tbody.textContent = '';
  for (const p of rows) {
    const id = pid(p);
    const tr = document.createElement('tr');

    tr.append(
      createCheckboxCell({ id }),
      createTextCell(p.name || ''),
      createTextCell(p.description || ''),
      createNumberInputCell({ id, field: 'price', value: p.price ?? '', min: 1, step: 100 }),
      createNumberInputCell({ id, field: 'discount', value: p.discount || 0, min: 0, step: 100 }),
      createCheckboxCell({ id, field: 'stock', checked: Boolean(p.stock) }),
      createTextCell(p.category || ''),
      createImageInputCell({ id, field: 'image_path', value: p.image_path || '' }),
      createImageInputCell({
        id,
        field: 'image_avif_path',
        value: p.image_avif_path || '',
        placeholder: 'assets/images/... .avif',
      })
    );
    tbody.appendChild(tr);
  }
}

function renderMediaModal() {
  if ($('#mediaModal')) return;
  const modalHtml = `
  <div class="modal fade" id="mediaModal" tabindex="-1" aria-hidden="true">
    <div class="modal-dialog modal-lg">
      <div class="modal-content">
        <div class="modal-header">
          <h5 class="modal-title">Gestor de Multimedia</h5>
          <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
        </div>
        <div class="modal-body">
          <div id="drop-zone" class="drop-zone p-5 text-center mb-3 border rounded bg-light">
              <p class="mb-2 fs-5">Arrastra y suelta una imagen aquí</p>
              <p class="text-muted small">o</p>
              <button class="btn btn-sm btn-primary" onclick="document.getElementById('media-input').click()">Seleccionar archivo</button>
              <input type="file" id="media-input" class="d-none" accept="image/*,image/avif,image/webp">
          </div>
          <div id="media-preview-container" class="text-center d-none p-3 border rounded">
              <h6 class="text-start mb-3">Vista Previa</h6>
              <img id="media-preview-img" src="" class="img-fluid mb-2 shadow-sm" style="max-height: 300px; object-fit: contain;">
              <div class="mt-2">
                <span class="badge bg-secondary" id="media-filename"></span>
                <span class="badge bg-info text-dark" id="media-filesize"></span>
              </div>
          </div>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancelar</button>
          <button type="button" class="btn btn-primary" id="btn-apply-media" disabled>Usar esta imagen</button>
        </div>
      </div>
    </div>
  </div>`;
  document.body.insertAdjacentHTML('beforeend', modalHtml);
}

function wireEvents() {
  $('#btn-load').addEventListener('click', loadFromServer);
  $('#file-input').addEventListener('change', importJSON);
  $('#btn-export').addEventListener('click', exportJSON);
  $('#filter').addEventListener('input', renderGrid);
  $('#category').addEventListener('change', renderGrid);
  $('#select-all').addEventListener('change', (e) => {
    $$(`${GRID_BODY_SELECTOR} input[type="checkbox"][data-id]`).forEach(
      (cb) => (cb.checked = e.target.checked)
    );
  });

  // inline edits
  $(GRID_BODY_SELECTOR).addEventListener('input', (e) => {
    const t = e.target;
    const id = t.getAttribute('data-id');
    const field = t.getAttribute('data-field');
    if (!id || !field) return;
    const p = findByPid(id);
    if (!p) return;
    let val = t.type === 'checkbox' ? t.checked : t.value;
    if (field === 'price' || field === 'discount') val = parseInt(val || '0', 10) || 0;
    p[field] = val;
  });

  $(GRID_BODY_SELECTOR).addEventListener('change', (e) => {
    const t = e.target;
    if (t.matches('input[type="checkbox"][data-field="stock"]')) {
      const id = t.getAttribute('data-id');
      const p = findByPid(id);
      if (p) p.stock = t.checked;
    }
  });

  // bulk actions
  $('#bulk-pct').addEventListener('click', () => bulkPct());
  $('#bulk-fixed').addEventListener('click', () => bulkFixed());
  $('#bulk-stock-on').addEventListener('click', () => bulkStock(true));
  $('#bulk-stock-off').addEventListener('click', () => bulkStock(false));
}

function selectedIds() {
  return $$(`${GRID_BODY_SELECTOR} input[type="checkbox"][data-id]:checked`).map((cb) =>
    cb.getAttribute('data-id')
  );
}

function bulkPct() {
  const ids = selectedIds();
  if (!ids.length) {
    alert(SELECT_ROWS_MESSAGE);
    return;
  }
  const pct = prompt('Porcentaje de descuento (0-100):', '10');
  if (pct === null) return;
  const v = Math.max(0, Math.min(100, parseFloat(pct) || 0));
  ids.forEach((id) => {
    const p = findByPid(id);
    if (p) p.discount = Math.min(p.price - 1, Math.round(p.price * (v / 100)));
  });
  renderGrid();
}

function bulkFixed() {
  const ids = selectedIds();
  if (!ids.length) {
    alert(SELECT_ROWS_MESSAGE);
    return;
  }
  const amt = prompt('Descuento fijo:', '500');
  if (amt === null) return;
  const v = Math.max(0, parseInt(amt) || 0);
  ids.forEach((id) => {
    const p = findByPid(id);
    if (p) p.discount = Math.min(p.price - 1, v);
  });
  renderGrid();
}

function bulkStock(on) {
  const ids = selectedIds();
  if (!ids.length) {
    alert(SELECT_ROWS_MESSAGE);
    return;
  }
  ids.forEach((id) => {
    const p = findByPid(id);
    if (p) p.stock = on;
  });
  renderGrid();
}

async function importJSON(e) {
  const file = e.target.files?.[0];
  if (!file) return;
  const text = await file.text();
  try {
    const data = JSON.parse(text);
    products = data.products || data;
    renderFilters();
    renderGrid();
  } catch (err) {
    alert('JSON inválido');
  }
}

function exportJSON() {
  const out = {
    version: new Date()
      .toISOString()
      .replace(/[-:TZ.]/g, '')
      .slice(0, 15),
    last_updated: new Date().toISOString(),
    products: products,
  };
  const blob = new Blob([JSON.stringify(out, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'product_data.json';
  a.click();
  URL.revokeObjectURL(a.href);
}

document.addEventListener('DOMContentLoaded', () => {
  wireEvents();
  setupMediaManager();
  loadFromServer();
});

function getMediaElements() {
  return {
    modal: $('#mediaModal'),
    dropZone: $('#drop-zone'),
    fileInput: $('#media-input'),
    previewContainer: $('#media-preview-container'),
    previewImage: $('#media-preview-img'),
    filenameBadge: $('#media-filename'),
    filesizeBadge: $('#media-filesize'),
    applyButton: $('#btn-apply-media'),
  };
}

function openMediaManager(event, state, elements) {
  const button = event.target.closest('.btn-img-mgr');
  if (!button) {
    return;
  }
  state.target = {
    id: button.getAttribute('data-id'),
    field: button.getAttribute('data-field'),
  };
  state.file = null;
  elements.previewContainer.classList.add('d-none');
  elements.dropZone.classList.remove('d-none');
  elements.applyButton.disabled = true;
  elements.fileInput.value = '';
  new bootstrap.Modal(elements.modal).show();
}

function preventMediaDefaults(event) {
  event.preventDefault();
  event.stopPropagation();
}

function wireMediaDropZone({ dropZone, fileInput, onFiles }) {
  ['dragenter', 'dragover', 'dragleave', 'drop'].forEach((eventName) => {
    dropZone.addEventListener(eventName, preventMediaDefaults, false);
  });
  ['dragenter', 'dragover'].forEach((eventName) => {
    dropZone.addEventListener(eventName, () => dropZone.classList.add('dragover'), false);
  });
  ['dragleave', 'drop'].forEach((eventName) => {
    dropZone.addEventListener(eventName, () => dropZone.classList.remove('dragover'), false);
  });
  dropZone.addEventListener('drop', (event) => onFiles(event.dataTransfer.files), false);
  fileInput.addEventListener('change', (event) => onFiles(event.target.files), false);
}

function showMediaPreview(file, elements) {
  const reader = new FileReader();
  reader.readAsDataURL(file);
  reader.onloadend = () => {
    elements.previewImage.src = reader.result;
    elements.filenameBadge.textContent = file.name;
    elements.filesizeBadge.textContent = (file.size / 1024).toFixed(1) + ' KB';
    elements.dropZone.classList.add('d-none');
    elements.previewContainer.classList.remove('d-none');
    elements.applyButton.disabled = false;
  };
}

function handleMediaFiles(files, state, elements) {
  if (!files.length) {
    return;
  }
  const file = files[0];
  if (!file.type.startsWith('image/')) {
    alert('Por favor selecciona un archivo de imagen válido.');
    return;
  }
  state.file = file;
  showMediaPreview(file, elements);
}

function applyMediaSelection(state, elements) {
  if (!state.target || !state.file) {
    return;
  }
  const assetPath = `assets/images/${state.file.name}`;
  const product = findByPid(state.target.id);
  if (product) {
    product[state.target.field] = assetPath;
  }
  const input = $(`input[data-id="${state.target.id}"][data-field="${state.target.field}"]`);
  if (input) {
    input.value = assetPath;
  }
  bootstrap.Modal.getInstance(elements.modal).hide();
}

function setupMediaManager() {
  renderMediaModal();
  const elements = getMediaElements();
  const state = { file: null, target: null };
  $(GRID_BODY_SELECTOR).addEventListener('click', (event) =>
    openMediaManager(event, state, elements)
  );
  wireMediaDropZone({
    dropZone: elements.dropZone,
    fileInput: elements.fileInput,
    onFiles: (files) => handleMediaFiles(files, state, elements),
  });
  elements.applyButton.addEventListener('click', () => applyMediaSelection(state, elements));
}
