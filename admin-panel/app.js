/* global bootstrap */
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

let products = [];
let originalMeta = { version: null, last_updated: null };

async function fetchProductJson() {
  const endpoints = [
    `${window.location.origin}/data/product_data.json`,
    `https://elrincondeebano.com/data/product_data.json`,
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

function escapeHtml(s = '') {
  const div = document.createElement('div');
  div.textContent = s;
  return div.innerHTML;
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

  const tbody = $('#grid-body');
  tbody.textContent = '';
  for (const p of rows) {
    const id = pid(p);
    const tr = document.createElement('tr');

    const selectTd = document.createElement('td');
    const selectInput = document.createElement('input');
    selectInput.type = 'checkbox';
    selectInput.dataset.id = id;
    selectTd.appendChild(selectInput);

    const nameTd = document.createElement('td');
    nameTd.textContent = p.name || '';

    const descTd = document.createElement('td');
    descTd.textContent = p.description || '';

    const priceTd = document.createElement('td');
    const priceInput = document.createElement('input');
    priceInput.type = 'number';
    priceInput.className = 'form-control form-control-sm';
    priceInput.value = String(p.price ?? '');
    priceInput.min = '1';
    priceInput.step = '100';
    priceInput.dataset.field = 'price';
    priceInput.dataset.id = id;
    priceTd.appendChild(priceInput);

    const discountTd = document.createElement('td');
    const discountInput = document.createElement('input');
    discountInput.type = 'number';
    discountInput.className = 'form-control form-control-sm';
    discountInput.value = String(p.discount || 0);
    discountInput.min = '0';
    discountInput.step = '100';
    discountInput.dataset.field = 'discount';
    discountInput.dataset.id = id;
    discountTd.appendChild(discountInput);

    const stockTd = document.createElement('td');
    const stockInput = document.createElement('input');
    stockInput.type = 'checkbox';
    stockInput.checked = Boolean(p.stock);
    stockInput.dataset.field = 'stock';
    stockInput.dataset.id = id;
    stockTd.appendChild(stockInput);

    const categoryTd = document.createElement('td');
    categoryTd.textContent = p.category || '';

    const imageTd = document.createElement('td');
    const imageGroup = document.createElement('div');
    imageGroup.className = 'input-group input-group-sm';
    const imageInput = document.createElement('input');
    imageInput.type = 'text';
    imageInput.className = 'form-control';
    imageInput.value = p.image_path || '';
    imageInput.dataset.field = 'image_path';
    imageInput.dataset.id = id;
    const imageBtn = document.createElement('button');
    imageBtn.className = 'btn btn-outline-secondary btn-img-mgr';
    imageBtn.type = 'button';
    imageBtn.dataset.field = 'image_path';
    imageBtn.dataset.id = id;
    imageBtn.title = 'Gestionar imagen';
    imageBtn.textContent = '📷';
    imageGroup.append(imageInput, imageBtn);
    imageTd.appendChild(imageGroup);

    const avifTd = document.createElement('td');
    const avifGroup = document.createElement('div');
    avifGroup.className = 'input-group input-group-sm';
    const avifInput = document.createElement('input');
    avifInput.type = 'text';
    avifInput.className = 'form-control';
    avifInput.value = p.image_avif_path || '';
    avifInput.placeholder = 'assets/images/... .avif';
    avifInput.dataset.field = 'image_avif_path';
    avifInput.dataset.id = id;
    const avifBtn = document.createElement('button');
    avifBtn.className = 'btn btn-outline-secondary btn-img-mgr';
    avifBtn.type = 'button';
    avifBtn.dataset.field = 'image_avif_path';
    avifBtn.dataset.id = id;
    avifBtn.title = 'Gestionar imagen';
    avifBtn.textContent = '📷';
    avifGroup.append(avifInput, avifBtn);
    avifTd.appendChild(avifGroup);

    tr.append(
      selectTd,
      nameTd,
      descTd,
      priceTd,
      discountTd,
      stockTd,
      categoryTd,
      imageTd,
      avifTd
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
    $$('#grid-body input[type="checkbox"][data-id]').forEach(
      (cb) => (cb.checked = e.target.checked)
    );
  });

  // inline edits
  $('#grid-body').addEventListener('input', (e) => {
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

  $('#grid-body').addEventListener('change', (e) => {
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
  return $$('#grid-body input[type="checkbox"][data-id]:checked').map((cb) =>
    cb.getAttribute('data-id')
  );
}

function bulkPct() {
  const ids = selectedIds();
  if (!ids.length) {
    alert('Seleccione filas');
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
    alert('Seleccione filas');
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
    alert('Seleccione filas');
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

function setupMediaManager() {
  renderMediaModal();

  const modalEl = $('#mediaModal');
  const dropZone = $('#drop-zone');
  const fileInput = $('#media-input');
  const previewContainer = $('#media-preview-container');
  const previewImg = $('#media-preview-img');
  const filenameBadge = $('#media-filename');
  const filesizeBadge = $('#media-filesize');
  const btnApply = $('#btn-apply-media');
  let currentFile = null;
  let currentMediaTarget = null; // { id, field }

  // Delegate click for grid buttons
  $('#grid-body').addEventListener('click', (e) => {
    const btn = e.target.closest('.btn-img-mgr');
    if (!btn) return;
    const id = btn.getAttribute('data-id');
    const field = btn.getAttribute('data-field');
    currentMediaTarget = { id, field };

    // Reset modal state
    currentFile = null;
    previewContainer.classList.add('d-none');
    dropZone.classList.remove('d-none');
    btnApply.disabled = true;
    fileInput.value = ''; // Reset file input

    // Use bootstrap instance to show
    const bsModal = new bootstrap.Modal(modalEl);
    bsModal.show();
  });

  // Drag & Drop
  ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
    dropZone.addEventListener(eventName, preventDefaults, false);
  });

  function preventDefaults(e) {
    e.preventDefault();
    e.stopPropagation();
  }

  ['dragenter', 'dragover'].forEach(eventName => {
    dropZone.addEventListener(eventName, highlight, false);
  });

  ['dragleave', 'drop'].forEach(eventName => {
    dropZone.addEventListener(eventName, unhighlight, false);
  });

  function highlight() {
    dropZone.classList.add('dragover');
  }

  function unhighlight() {
    dropZone.classList.remove('dragover');
  }

  dropZone.addEventListener('drop', handleDrop, false);
  fileInput.addEventListener('change', (e) => handleFiles(e.target.files), false);

  function handleDrop(e) {
    const dt = e.dataTransfer;
    const files = dt.files;
    handleFiles(files);
  }

  function handleFiles(files) {
    if (files.length > 0) {
      const file = files[0];
      if (!file.type.startsWith('image/')) {
        alert('Por favor selecciona un archivo de imagen válido.');
        return;
      }
      currentFile = file;
      showPreview(file);
    }
  }

  function showPreview(file) {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onloadend = function () {
      previewImg.src = reader.result;
      filenameBadge.textContent = file.name;
      filesizeBadge.textContent = (file.size / 1024).toFixed(1) + ' KB';

      dropZone.classList.add('d-none');
      previewContainer.classList.remove('d-none');
      btnApply.disabled = false;
    };
  }

  btnApply.addEventListener('click', () => {
    if (!currentMediaTarget || !currentFile) return;

    // Construct path - assuming standard assets structure
    const path = `assets/images/${currentFile.name}`;

    // Update data model
    const p = findByPid(currentMediaTarget.id);
    if (p) {
      p[currentMediaTarget.field] = path;
    }

    // Update UI input
    const input = $(`input[data-id="${currentMediaTarget.id}"][data-field="${currentMediaTarget.field}"]`);
    if (input) {
      input.value = path;
    }

    // Close modal
    const bsModal = bootstrap.Modal.getInstance(modalEl);
    bsModal.hide();
  });
}
