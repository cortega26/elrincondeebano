// Parking reservation module for /estacionamiento/
// Standalone vanilla JS — no framework, no dependencies.

/* Constants */
var WHATSAPP_NUMBER = '56951118901';
var PRICE_REGULAR = 4000;
var PRICE_HIGH = 5000;
var MAX_NIGHTS = 30;
var HOLIDAYS_API_URL = 'https://feriados.cl/api/v1/feriados';
var SESSION_CACHE_KEY = 'astro-poc-parking-holidays';
var CACHE_TTL_MS = 86400000;
var BOOKINGS_CSV_URL =
  'https://docs.google.com/spreadsheets/d/e/2PACX-1vQzPYJK56BihZqj2SDz39CcXt1G5ll7h2yNPFGbu_Y4gM8uax0otamO9Zh-SCMpDFCLk7isRRaJINYE/pub?gid=936239218&single=true&output=csv';
var BOOKINGS_CACHE_KEY = 'astro-poc-parking-bookings';
var BOOKINGS_CACHE_TTL = 300000;

/* ── Holiday API ────────────────────────────────────────────── */

function dateToISO(d) {
  var y = d.getFullYear();
  var m = String(d.getMonth() + 1).padStart(2, '0');
  var day = String(d.getDate()).padStart(2, '0');
  return y + '-' + m + '-' + day;
}

function getCachedHolidays() {
  try {
    var raw = sessionStorage.getItem(SESSION_CACHE_KEY);
    if (!raw) return null;
    var cached = JSON.parse(raw);
    if (Date.now() - cached.timestamp > CACHE_TTL_MS) return null;
    return cached.data;
  } catch (_) {
    return null;
  }
}

function setCachedHolidays(data) {
  try {
    sessionStorage.setItem(
      SESSION_CACHE_KEY,
      JSON.stringify({ timestamp: Date.now(), data: data })
    );
  } catch (_) {
    /* ignore */
  }
}

function fetchHolidays() {
  var cached = getCachedHolidays();
  if (cached) return Promise.resolve(cached);

  return fetch(HOLIDAYS_API_URL)
    .then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    })
    .then(function (data) {
      var dates = (Array.isArray(data) ? data : []).map(function (h) {
        return h.date;
      });
      setCachedHolidays(dates);
      return dates;
    })
    .catch(function () {
      return [];
    });
}

/* ── Bookings CSV ──────────────────────────────────────────── */

function getCachedBookings() {
  try {
    var raw = sessionStorage.getItem(BOOKINGS_CACHE_KEY);
    if (!raw) return null;
    var cached = JSON.parse(raw);
    if (Date.now() - cached.timestamp > BOOKINGS_CACHE_TTL) return null;
    return cached.data;
  } catch (_) {
    return null;
  }
}

function setCachedBookings(data) {
  try {
    sessionStorage.setItem(
      BOOKINGS_CACHE_KEY,
      JSON.stringify({ timestamp: Date.now(), data: data })
    );
  } catch (_) {
    /* ignore */
  }
}

function parseBookingsCSV(csvText) {
  var lines = csvText.trim().split('\n');
  if (lines.length < 2) return [];
  var bookings = [];
  for (var i = 1; i < lines.length; i++) {
    var parts = lines[i].split(',');
    if (parts.length >= 2 && parts[0].trim() && parts[1].trim()) {
      bookings.push({ desde: parts[0].trim(), hasta: parts[1].trim() });
    }
  }
  return bookings;
}

function isNightBlocked(dateStr, bookings) {
  for (var i = 0; i < bookings.length; i++) {
    if (dateStr >= bookings[i].desde && dateStr < bookings[i].hasta) return true;
  }
  return false;
}

function fetchBookings() {
  var cached = getCachedBookings();
  if (cached) return Promise.resolve(cached);

  return fetch(BOOKINGS_CSV_URL)
    .then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.text();
    })
    .then(function (csvText) {
      var bookings = parseBookingsCSV(csvText);
      setCachedBookings(bookings);
      return bookings;
    })
    .catch(function () {
      return [];
    });
}

/* ── Pricing ────────────────────────────────────────────────── */

function getNightPrice(date, holidays) {
  var dateStr = dateToISO(date);
  var dayOfWeek = date.getDay();

  if (holidays.indexOf(dateStr) !== -1) return PRICE_HIGH;

  var nextDay = new Date(date);
  nextDay.setDate(nextDay.getDate() + 1);
  if (holidays.indexOf(dateToISO(nextDay)) !== -1) return PRICE_HIGH;

  if (dayOfWeek === 5 || dayOfWeek === 6) return PRICE_HIGH;

  return PRICE_REGULAR;
}

function isDateHoliday(date, holidays) {
  return holidays.indexOf(dateToISO(date)) !== -1;
}

function isDateEveOfHoliday(date, holidays) {
  var nextDay = new Date(date);
  nextDay.setDate(nextDay.getDate() + 1);
  return holidays.indexOf(dateToISO(nextDay)) !== -1;
}

function calculateBreakdown(checkIn, checkOut, holidays, bookings) {
  var nights = [];
  var current = new Date(checkIn.getTime());

  while (current < checkOut) {
    var dateStr = dateToISO(current);
    var price = getNightPrice(current, holidays);
    var holiday = isDateHoliday(current, holidays);
    var eve = !holiday && isDateEveOfHoliday(current, holidays);
    var blocked = bookings && isNightBlocked(dateStr, bookings);

    nights.push({
      date: new Date(current.getTime()),
      dayName: current.toLocaleDateString('es-CL', { weekday: 'long' }),
      dateStr: current.toLocaleDateString('es-CL', {
        day: 'numeric',
        month: 'long',
      }),
      price: price,
      isHoliday: holiday,
      isEve: eve,
      isBlocked: blocked,
    });

    current.setDate(current.getDate() + 1);
  }

  return nights;
}

/* ── Formatting ─────────────────────────────────────────────── */

function formatCurrency(value) {
  return '$' + Number(value).toLocaleString('es-CL');
}

function buildWhatsAppMessage(breakdown, driverName, licensePlate, apartment, paymentMethod) {
  var lines = [];
  lines.push('🔵 *Reserva Estacionamiento — El Rincón de Ébano*');
  lines.push('');
  lines.push('*Datos del conductor:*');
  lines.push('Nombre: ' + driverName);
  lines.push('Patente: ' + licensePlate);
  lines.push('Dpto: ' + apartment);
  lines.push('');
  lines.push('*Noches:*');
  lines.push('');

  breakdown.forEach(function (night, index) {
    var extras = [];
    if (night.isHoliday) extras.push('Feriado');
    if (night.isEve) extras.push('Víspera');
    var suffix = extras.length > 0 ? ' (' + extras.join(', ') + ')' : '';
    lines.push(
      index +
        1 +
        '. ' +
        night.dayName +
        ' ' +
        night.dateStr +
        suffix +
        ' · ' +
        formatCurrency(night.price)
    );
  });

  lines.push('');
  lines.push('_ _ _ _ _ _ _ _ _ _ _ _ _ _ _');
  lines.push('');

  var total = breakdown.reduce(function (sum, n) {
    return sum + n.price;
  }, 0);
  lines.push('*Total:* ' + formatCurrency(total));
  lines.push('*Pago:* ' + paymentMethod);

  return lines.join('\n');
}

/* ── UI ─────────────────────────────────────────────────────── */

function getDateFromInput(id) {
  var el = document.getElementById(id);
  if (!el || !el.value) return null;
  var d = new Date(el.value + 'T12:00:00');
  return isNaN(d.getTime()) ? null : d;
}

function renderBreakdown(breakdown) {
  var container = document.getElementById('parking-breakdown');
  var list = document.getElementById('parking-breakdown-list');
  var totalEl = document.getElementById('parking-total');
  if (!container || !list || !totalEl) return;

  if (breakdown.length === 0) {
    container.classList.add('is-hidden');
    return;
  }

  container.classList.remove('is-hidden');

  list.innerHTML = '';
  var total = 0;

  breakdown.forEach(function (night) {
    var row = document.createElement('div');
    row.className = 'parking-breakdown__row';
    if (night.isBlocked) row.classList.add('parking-breakdown__row--blocked');

    var label = document.createElement('span');
    label.className = 'parking-breakdown__label';

    var labelText =
      night.dayName.charAt(0).toUpperCase() + night.dayName.slice(1) + ' ' + night.dateStr;
    label.appendChild(document.createTextNode(labelText));

    if (night.isBlocked) {
      var bBadge = document.createElement('span');
      bBadge.className = 'parking-breakdown__badge parking-breakdown__badge--blocked';
      bBadge.textContent = 'Ocupada';
      label.appendChild(bBadge);
    } else if (night.isHoliday) {
      var hBadge = document.createElement('span');
      hBadge.className = 'parking-breakdown__badge parking-breakdown__badge--holiday';
      hBadge.textContent = 'Feriado';
      label.appendChild(hBadge);
    } else if (night.isEve) {
      var eBadge = document.createElement('span');
      eBadge.className = 'parking-breakdown__badge parking-breakdown__badge--eve';
      eBadge.textContent = 'Víspera';
      label.appendChild(eBadge);
    } else {
      var dow = night.date.getDay();
      if (dow === 5 || dow === 6) {
        var wBadge = document.createElement('span');
        wBadge.className = 'parking-breakdown__badge parking-breakdown__badge--weekend';
        wBadge.textContent = 'Finde';
        label.appendChild(wBadge);
      }
    }

    row.appendChild(label);

    var priceSpan = document.createElement('span');
    priceSpan.className = 'parking-breakdown__price';
    if (night.isBlocked) priceSpan.classList.add('parking-breakdown__price--blocked');
    priceSpan.textContent = night.isBlocked ? '—' : formatCurrency(night.price);
    row.appendChild(priceSpan);

    list.appendChild(row);
    if (!night.isBlocked) total += night.price;
  });

  var totalRow = document.createElement('div');
  totalRow.className = 'parking-breakdown__row parking-breakdown__row--total';
  var totalLabel = document.createElement('span');
  totalLabel.textContent = 'Total';
  var totalAmount = document.createElement('span');
  totalAmount.className = 'parking-breakdown__total-amount';
  totalAmount.textContent = formatCurrency(total);
  totalRow.appendChild(totalLabel);
  totalRow.appendChild(totalAmount);
  list.appendChild(totalRow);

  totalEl.textContent = formatCurrency(total);

  var creditContainer = document.getElementById('parking-payment-credit-container');
  var paymentHint = document.getElementById('parking-payment-hint');
  if (creditContainer && paymentHint) {
    var showCredit = total >= 30000;
    creditContainer.classList.toggle('is-hidden', !showCredit);
    paymentHint.classList.toggle('is-hidden', !showCredit);
  }
}

function clearBreakdown() {
  var container = document.getElementById('parking-breakdown');
  var list = document.getElementById('parking-breakdown-list');
  var totalEl = document.getElementById('parking-total');

  if (container) container.classList.add('is-hidden');
  if (list) list.innerHTML = '';
  if (totalEl) totalEl.textContent = '';
}

function setStatusMessage(text, type) {
  var msg = document.getElementById('parking-message');
  if (!msg) return;
  if (!text) {
    msg.classList.add('is-hidden');
    msg.textContent = '';
    return;
  }
  msg.textContent = text;
  msg.className = 'alert ' + type + ' mt-3 mb-0';
  msg.classList.remove('is-hidden');
}

function getSelectedPayment() {
  var radios = document.querySelectorAll('input[name="parkingPayment"]');
  for (var i = 0; i < radios.length; i++) {
    if (radios[i].checked) return radios[i].value;
  }
  return '';
}

function validateForm() {
  var checkIn = getDateFromInput('parking-checkin');
  var checkOut = getDateFromInput('parking-checkout');
  var driver = document.getElementById('parking-driver');
  var plate = document.getElementById('parking-plate');
  var apt = document.getElementById('parking-apartment');

  var datesOk = checkIn && checkOut && checkOut > checkIn;
  var aptOk = apt && /^\d{3,4}$/.test(apt.value.trim());
  var fieldsOk =
    driver && driver.value.trim() && plate && plate.value.trim() && aptOk && !!getSelectedPayment();

  return datesOk && fieldsOk;
}

function onDateChange(holidays, bookings) {
  var checkIn = getDateFromInput('parking-checkin');
  var checkOut = getDateFromInput('parking-checkout');

  if (!checkIn || !checkOut) {
    clearBreakdown();
    setStatusMessage('', '');
    validateForm();
    return;
  }

  if (checkOut <= checkIn) {
    clearBreakdown();
    setStatusMessage('La fecha de salida debe ser posterior a la de llegada.', 'alert-warning');
    validateForm();
    return;
  }

  setStatusMessage('', '');
  var breakdown = calculateBreakdown(checkIn, checkOut, holidays, bookings);
  renderBreakdown(breakdown);
  validateForm();

  var hasBlocked = breakdown.some(function (n) {
    return n.isBlocked;
  });
  if (hasBlocked) {
    setStatusMessage('Una o más noches están ocupadas. Selecciona otras fechas.', 'alert-warning');
  }
}

function clearValidationErrors() {
  var fields = ['parking-driver', 'parking-plate', 'parking-apartment'];
  fields.forEach(function (id) {
    var el = document.getElementById(id);
    if (el) el.classList.remove('is-invalid');
  });
  var paymentContainer = document.getElementById('parking-payment');
  if (paymentContainer) paymentContainer.classList.remove('parking-payment--invalid');
}

function markValidationErrors() {
  var hasError = false;

  var driver = document.getElementById('parking-driver');
  var plate = document.getElementById('parking-plate');
  var apt = document.getElementById('parking-apartment');

  if (!driver || !driver.value.trim()) {
    if (driver) driver.classList.add('is-invalid');
    hasError = true;
  }
  if (!plate || !plate.value.trim()) {
    if (plate) plate.classList.add('is-invalid');
    hasError = true;
  }
  if (!apt || !/^\d{3,4}$/.test(apt.value.trim())) {
    if (apt) apt.classList.add('is-invalid');
    hasError = true;
  }
  if (!getSelectedPayment()) {
    var paymentContainer = document.getElementById('parking-payment');
    if (paymentContainer) paymentContainer.classList.add('parking-payment--invalid');
    hasError = true;
  }

  return hasError;
}

function onSubmit(holidays, bookings) {
  var checkIn = getDateFromInput('parking-checkin');
  var checkOut = getDateFromInput('parking-checkout');

  if (!checkIn || !checkOut || checkOut <= checkIn) {
    setStatusMessage('Selecciona las fechas de llegada y salida.', 'alert-warning');
    return;
  }

  var breakdown = calculateBreakdown(checkIn, checkOut, holidays, bookings);
  if (breakdown.length === 0) return;

  var hasBlocked = breakdown.some(function (n) {
    return n.isBlocked;
  });
  if (hasBlocked) {
    setStatusMessage(
      'Una o más noches están ocupadas. No se puede enviar la reserva.',
      'alert-danger'
    );
    return;
  }

  var driver = document.getElementById('parking-driver');
  var plate = document.getElementById('parking-plate');
  var apt = document.getElementById('parking-apartment');
  var paymentMethod = getSelectedPayment();

  clearValidationErrors();
  if (markValidationErrors()) {
    setStatusMessage('Completa todos los campos obligatorios antes de enviar.', 'alert-warning');
    return;
  }

  setStatusMessage('', '');
  var message = buildWhatsAppMessage(
    breakdown,
    driver.value.trim(),
    plate.value.trim(),
    apt.value.trim(),
    paymentMethod
  );
  var encoded = encodeURIComponent(message);
  globalThis.open('https://wa.me/' + WHATSAPP_NUMBER + '?text=' + encoded, '_blank');
}

function initParkingReservation() {
  var checkin = document.getElementById('parking-checkin');
  var checkout = document.getElementById('parking-checkout');
  var submitBtn = document.getElementById('parking-submit');

  if (!checkin || !checkout || !submitBtn) return;

  var today = new Date();
  var maxDate = new Date(today);
  maxDate.setDate(maxDate.getDate() + MAX_NIGHTS);
  var todayStr = dateToISO(today);
  var maxStr = dateToISO(maxDate);

  checkin.min = todayStr;
  checkin.max = maxStr;
  checkout.min = todayStr;
  checkout.max = maxStr;

  var holidays = [];
  var bookings = [];

  fetchHolidays().then(function (result) {
    holidays = result;
  });

  fetchBookings().then(function (result) {
    bookings = result;
  });

  checkin.addEventListener('change', function () {
    if (checkin.value) {
      var dayAfter = new Date(checkin.valueAsNumber);
      dayAfter.setDate(dayAfter.getDate() + 1);
      checkout.min = dateToISO(dayAfter);
      if (!checkout.value || checkout.valueAsNumber <= checkin.valueAsNumber) {
        checkout.value = '';
      }
      clearBreakdown();
      setStatusMessage('', '');
    }
    onDateChange(holidays, bookings);
  });

  checkout.addEventListener('change', function () {
    onDateChange(holidays, bookings);
  });

  submitBtn.addEventListener('click', function (e) {
    e.preventDefault();
    onSubmit(holidays, bookings);
  });

  var driverInput = document.getElementById('parking-driver');
  var plateInput = document.getElementById('parking-plate');
  var aptInput = document.getElementById('parking-apartment');

  function onFieldChange(e) {
    if (e && e.target && e.target.classList) {
      e.target.classList.remove('is-invalid');
    }
    setStatusMessage('', '');
    validateForm();
  }

  if (driverInput) driverInput.addEventListener('input', onFieldChange);
  if (plateInput) plateInput.addEventListener('input', onFieldChange);
  if (aptInput) aptInput.addEventListener('input', onFieldChange);

  var paymentRadios = document.querySelectorAll('input[name="parkingPayment"]');
  for (var i = 0; i < paymentRadios.length; i++) {
    paymentRadios[i].addEventListener('change', function () {
      document.getElementById('parking-payment')?.classList.remove('parking-payment--invalid');
      setStatusMessage('', '');
      validateForm();
    });
  }
}

/* ── Boot ───────────────────────────────────────────────────── */

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initParkingReservation);
} else {
  initParkingReservation();
}
