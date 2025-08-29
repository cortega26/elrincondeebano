// Simple client-side gate: replace this hash with your own
// Generate a SHA-256 (hex) using: crypto.subtle.digest('SHA-256', new TextEncoder().encode('YOUR_PASSWORD'))
// and then convert to hex. For convenience, a default is provided.
const PASSWORD_SHA256_HEX = "e3afed0047b08059d0fada10f400c1e5b1d05c0b5b4b2f3b2e1f0a0b9c8d7e6f"; // placeholder (md5-like length but treated as placeholder)

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

let products = [];
let originalMeta = { version: null, last_updated: null };

async function sha256Hex(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2,'0')).join('');
}

function show(view) {
  $('#login-view').classList.toggle('d-none', view !== 'login');
  $('#app-view').classList.toggle('d-none', view !== 'app');
}

async function login() {
  const pwd = $('#password').value;
  const hash = await sha256Hex(pwd);
  if (hash === PASSWORD_SHA256_HEX) {
    sessionStorage.setItem('admin-auth', '1');
    show('app');
    await loadFromServer();
  } else {
    alert('Contraseña incorrecta');
  }
}

async function ensureAuth() {
  if (sessionStorage.getItem('admin-auth') === '1') {
    show('app');
    await loadFromServer();
  } else {
    show('login');
  }
}

async function loadFromServer() {
  const res = await fetch('/_products/product_data.json', { cache: 'no-cache' });
  if (!res.ok) { alert('No se pudo cargar product_data.json'); return; }
  const data = await res.json();
  products = data.products || data;
  originalMeta.version = data.version || null;
  originalMeta.last_updated = data.last_updated || null;
  renderFilters();
  renderGrid();
}

function renderFilters() {
  const categories = Array.from(new Set(products.map(p => p.category).filter(Boolean))).sort();
  const select = $('#category');
  select.innerHTML = '<option value="">Todas las categorías</option>' + categories.map(c => `<option>${escapeHtml(c)}</option>`).join('');
}

function escapeHtml(s='') {
  const div = document.createElement('div');
  div.textContent = s; return div.innerHTML;
}

function renderGrid() {
  const filter = ($('#filter').value || '').toLowerCase();
  const cat = $('#category').value;
  const rows = products
    .filter(p => (!cat || p.category === cat))
    .filter(p => !filter || (p.name?.toLowerCase().includes(filter) || p.description?.toLowerCase().includes(filter)));

  const tbody = $('#grid-body');
  tbody.innerHTML = '';
  for (const p of rows) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><input type="checkbox" data-id="${pid(p)}" /></td>
      <td>${escapeHtml(p.name)}</td>
      <td>${escapeHtml(p.description || '')}</td>
      <td><input type="number" class="form-control form-control-sm" value="${p.price}" min="1" step="100" data-field="price" data-id="${pid(p)}"></td>
      <td><input type="number" class="form-control form-control-sm" value="${p.discount||0}" min="0" step="100" data-field="discount" data-id="${pid(p)}"></td>
      <td><input type="checkbox" ${p.stock? 'checked':''} data-field="stock" data-id="${pid(p)}"></td>
      <td>${escapeHtml(p.category||'')}</td>
      <td><input type="text" class="form-control form-control-sm" value="${escapeHtml(p.image_path||'')}" data-field="image_path" data-id="${pid(p)}"></td>
    `;
    tbody.appendChild(tr);
  }
}

function pid(p) { return (p.name + '|' + (p.category||'')).toLowerCase(); }
function findByPid(id) { return products.find(p => pid(p)===id); }

function wireEvents() {
  $('#btn-login').addEventListener('click', login);
  $('#btn-load').addEventListener('click', loadFromServer);
  $('#file-input').addEventListener('change', importJSON);
  $('#btn-export').addEventListener('click', exportJSON);
  $('#filter').addEventListener('input', renderGrid);
  $('#category').addEventListener('change', renderGrid);
  $('#select-all').addEventListener('change', (e)=> {
    $$('#grid-body input[type="checkbox"][data-id]').forEach(cb => cb.checked = e.target.checked);
  });

  // edit events
  $('#grid-body').addEventListener('input', (e) => {
    const t = e.target;
    const id = t.getAttribute('data-id');
    const field = t.getAttribute('data-field');
    if (!id || !field) return;
    const p = findByPid(id); if (!p) return;
    let val = t.type === 'checkbox' ? t.checked : t.value;
    if (field === 'price' || field === 'discount') val = parseInt(val||'0', 10) || 0;
    p[field] = val;
  });

  $('#grid-body').addEventListener('change', (e) => {
    const t = e.target;
    if (t.matches('input[type="checkbox"][data-field="stock"]')) {
      const id = t.getAttribute('data-id');
      const p = findByPid(id); if (p) p.stock = t.checked;
    }
  });

  // bulk actions
  $('#bulk-pct').addEventListener('click', () => bulkPct());
  $('#bulk-fixed').addEventListener('click', () => bulkFixed());
  $('#bulk-stock-on').addEventListener('click', () => bulkStock(true));
  $('#bulk-stock-off').addEventListener('click', () => bulkStock(false));
}

function selectedIds() {
  return $$('#grid-body input[type="checkbox"][data-id]:checked').map(cb => cb.getAttribute('data-id'));
}

function bulkPct() {
  const ids = selectedIds(); if (!ids.length) { alert('Seleccione filas'); return; }
  const pct = prompt('Porcentaje de descuento (0-100):', '10');
  if (pct === null) return;
  const v = Math.max(0, Math.min(100, parseFloat(pct)||0));
  ids.forEach(id => { const p = findByPid(id); if (p) p.discount = Math.min(p.price-1, Math.round(p.price * (v/100))); });
  renderGrid();
}

function bulkFixed() {
  const ids = selectedIds(); if (!ids.length) { alert('Seleccione filas'); return; }
  const amt = prompt('Descuento fijo:', '500');
  if (amt === null) return;
  const v = Math.max(0, parseInt(amt)||0);
  ids.forEach(id => { const p = findByPid(id); if (p) p.discount = Math.min(p.price-1, v); });
  renderGrid();
}

function bulkStock(on) {
  const ids = selectedIds(); if (!ids.length) { alert('Seleccione filas'); return; }
  ids.forEach(id => { const p = findByPid(id); if (p) p.stock = on; });
  renderGrid();
}

async function importJSON(e) {
  const file = e.target.files?.[0]; if (!file) return;
  const text = await file.text();
  try {
    const data = JSON.parse(text);
    products = data.products || data;
    renderFilters();
    renderGrid();
  } catch(err) {
    alert('JSON inválido');
  }
}

function exportJSON() {
  const out = {
    version: new Date().toISOString().replace(/[-:TZ.]/g,'').slice(0,15),
    last_updated: new Date().toISOString(),
    products: products
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
  ensureAuth();
});

