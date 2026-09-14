// Plan 013 Step 2: timeouts + independent degradation + lookup equivalence.
// Mocked-timer tests prove the widget becomes interactive when either
// endpoint is slow/down, and that quote math is identical on fixtures.
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  dateToISO,
  isNightBlocked,
  getNightPrice,
  calculateBreakdown,
  initParkingReservation,
  fetchWithTimeout,
  toHolidaySet,
  createBookingLookup,
  FETCH_TIMEOUT_MS,
  PRICE_REGULAR,
  PRICE_HIGH,
} from '../astro-poc/src/scripts/parking-reservation.js';

function installParkingDOM() {
  document.body.innerHTML = `
    <input type="date" id="parking-checkin" />
    <input type="date" id="parking-checkout" />
    <button id="parking-submit">Reservar</button>
    <input type="text" id="parking-driver" />
    <input type="text" id="parking-plate" />
    <input type="text" id="parking-apartment" />
    <div id="parking-message" class="is-hidden"></div>
    <div id="parking-breakdown" class="is-hidden">
      <div id="parking-breakdown-list"></div>
      <span id="parking-total"></span>
    </div>
    <div id="parking-payment">
      <label><input type="radio" name="parkingPayment" value="transferencia" /> Transferencia</label>
    </div>
    <div id="parking-payment-credit-container" class="is-hidden"></div>
    <div id="parking-payment-hint" class="is-hidden"></div>
  `;
}

function submitWithDates(checkinDate, checkoutDate) {
  document.getElementById('parking-checkin').value = checkinDate;
  document.getElementById('parking-checkout').value = checkoutDate;
  document.getElementById('parking-driver').value = 'Ana Pérez';
  document.getElementById('parking-plate').value = 'ABC-123';
  document.getElementById('parking-apartment').value = '101';
  const payment = document.querySelector('input[name="parkingPayment"][value="transferencia"]');
  if (payment) payment.checked = true;
  document.getElementById('parking-submit').dispatchEvent(new window.Event('click'));
}

const HOLIDAYS_URL = 'feriados';

function nextTwoDayRange() {
  const today = new Date();
  const t1 = new Date(today);
  t1.setDate(t1.getDate() + 1);
  const t2 = new Date(today);
  t2.setDate(t2.getDate() + 2);
  return [dateToISO(t1), dateToISO(t2)];
}

function captureOpenedUrls() {
  const opened = [];
  const originalOpen = globalThis.open;
  globalThis.open = (url) => opened.push(url);
  return {
    opened,
    restore: () => {
      globalThis.open = originalOpen;
    },
  };
}

function expectDegradedShare(opened) {
  expect(opened.length).toBe(1);
  expect(decodeURIComponent(opened[0])).toContain('Disponibilidad no verificada');
}

beforeEach(() => {
  sessionStorage.clear();
  installParkingDOM();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

describe('fetchWithTimeout (plan 013)', () => {
  it('resolves fast responses without waiting for the timeout', async () => {
    globalThis.fetch = () => Promise.resolve({ ok: true });
    const result = await fetchWithTimeout('https://example.com/fast');
    expect(result.ok).toBe(true);
  });

  it('rejects a hung fetch after FETCH_TIMEOUT_MS even if abort is ignored', async () => {
    // Signal-ignoring hang: the race — not the abort — settles the promise.
    globalThis.fetch = () => new Promise(() => {});
    const pending = fetchWithTimeout('https://example.com/hung');
    const assertion = expect(pending).rejects.toThrow(/Timeout/);
    await vi.advanceTimersByTimeAsync(FETCH_TIMEOUT_MS + 100);
    await assertion;
  });
});

describe('independent degradation with mocked timers (plan 013)', () => {
  it('widget works with bookings data when holidays endpoint is down', async () => {
    globalThis.fetch = (url) => {
      if (String(url).includes(HOLIDAYS_URL)) return Promise.reject(new Error('holidays down'));
      return Promise.resolve({ ok: true, text: () => Promise.resolve('desde,hasta\n') });
    };
    const { opened, restore } = captureOpenedUrls();
    try {
      initParkingReservation();
      await vi.advanceTimersByTimeAsync(0);
      const [checkin, checkout] = nextTwoDayRange();
      submitWithDates(checkin, checkout);
      expectDegradedShare(opened);
    } finally {
      restore();
    }
  });

  it('widget works with holidays data when bookings endpoint is down', async () => {
    globalThis.fetch = (url) => {
      if (String(url).includes(HOLIDAYS_URL)) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
      }
      return Promise.reject(new Error('bookings down'));
    };
    const { opened, restore } = captureOpenedUrls();
    try {
      initParkingReservation();
      await vi.advanceTimersByTimeAsync(0);
      const [checkin, checkout] = nextTwoDayRange();
      submitWithDates(checkin, checkout);
      expectDegradedShare(opened);
    } finally {
      restore();
    }
  });

  it('a hung holidays endpoint does not block bookings past the timeout', async () => {
    globalThis.fetch = (url) => {
      if (String(url).includes(HOLIDAYS_URL)) return new Promise(() => {}); // hung
      return Promise.resolve({ ok: true, text: () => Promise.resolve('desde,hasta\n') });
    };
    const { opened, restore } = captureOpenedUrls();
    try {
      initParkingReservation();
      // Before the timeout the widget is still loading availability.
      await vi.advanceTimersByTimeAsync(FETCH_TIMEOUT_MS - 1000);
      const [checkin, checkout] = nextTwoDayRange();
      submitWithDates(checkin, checkout);
      expect(document.getElementById('parking-message').textContent).toContain(
        'Cargando disponibilidad'
      );

      // Past the timeout the hung source degrades and the widget works.
      await vi.advanceTimersByTimeAsync(2000);
      submitWithDates(checkin, checkout);
      expectDegradedShare(opened);
    } finally {
      restore();
    }
  });

  it('a hung bookings endpoint does not block holidays past the timeout', async () => {
    globalThis.fetch = (url) => {
      if (String(url).includes(HOLIDAYS_URL)) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
      }
      return new Promise(() => {}); // hung
    };
    const { opened, restore } = captureOpenedUrls();
    try {
      initParkingReservation();
      await vi.advanceTimersByTimeAsync(FETCH_TIMEOUT_MS + 100);
      const [checkin, checkout] = nextTwoDayRange();
      submitWithDates(checkin, checkout);
      expectDegradedShare(opened);
    } finally {
      restore();
    }
  });
});

describe('quote math identical on fixtures (plan 013)', () => {
  const holidays = ['2026-01-01', '2026-05-01'];
  const bookings = [
    { desde: '2026-01-10', hasta: '2026-01-15' },
    { desde: '2026-02-20', hasta: '2026-02-25' },
  ];

  it('Set-based holiday probes match legacy array semantics', () => {
    const set = toHolidaySet(holidays);
    expect(set.has('2026-01-01')).toBe(true);
    // Spot-check every day of a full year for identical pricing.
    for (let m = 0; m < 12; m++) {
      for (let d = 1; d <= 28; d++) {
        const date = new Date(2026, m, d);
        expect(getNightPrice(date, set)).toBe(getNightPrice(date, holidays));
      }
    }
    expect(getNightPrice(new Date(2026, 0, 1), set)).toBe(PRICE_HIGH);
    expect(getNightPrice(new Date(2026, 0, 13), set)).toBe(PRICE_REGULAR);
  });

  it('interval booking lookup matches linear isNightBlocked on fixtures', () => {
    const lookup = createBookingLookup(bookings);
    const probes = [
      '2026-01-09',
      '2026-01-10',
      '2026-01-12',
      '2026-01-15',
      '2026-02-22',
      '2026-03-01',
    ];
    for (const day of probes) {
      expect(lookup.isBlocked(day)).toBe(isNightBlocked(day, bookings));
    }
    // Overlapping ranges: every containing interval must report blocked.
    const overlapping = [
      { desde: '2026-01-01', hasta: '2026-12-31' },
      { desde: '2026-06-01', hasta: '2026-06-02' },
    ];
    const overlapLookup = createBookingLookup(overlapping);
    expect(overlapLookup.isBlocked('2026-07-01')).toBe(true);
    expect(overlapLookup.isBlocked('2026-06-01')).toBe(true);
    expect(overlapLookup.isBlocked('2025-12-31')).toBe(false);
  });

  it('calculateBreakdown totals are identical with array or Set inputs', () => {
    const checkIn = new Date(2026, 0, 1);
    const checkOut = new Date(2026, 0, 10);
    const fromArrays = calculateBreakdown(checkIn, checkOut, holidays, bookings);
    const fromSets = calculateBreakdown(checkIn, checkOut, toHolidaySet(holidays), bookings);
    expect(fromSets.map((n) => n.price)).toEqual(fromArrays.map((n) => n.price));
    expect(fromSets.map((n) => n.isBlocked)).toEqual(fromArrays.map((n) => n.isBlocked));
    const total = fromSets.reduce((sum, n) => sum + (n.isBlocked ? 0 : n.price), 0);
    const expected = fromArrays.reduce((sum, n) => sum + (n.isBlocked ? 0 : n.price), 0);
    expect(total).toBe(expected);
  });
});
