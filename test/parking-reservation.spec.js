import { describe, expect, it, beforeEach } from 'vitest';
import {
  dateToISO,
  parseBookingsCSV,
  isNightBlocked,
  getNightPrice,
  calculateBreakdown,
  buildWhatsAppMessage,
  getCachedHolidays,
  setCachedHolidays,
  getCachedBookings,
  setCachedBookings,
  initParkingReservation,
  PRICE_REGULAR,
  PRICE_HIGH,
} from '../astro-poc/src/scripts/parking-reservation.js';

/* ── Helpers ─────────────────────────────────────────────── */

/**
 * Build a minimal DOM needed for initParkingReservation.
 * Returns the created elements so tests can manipulate them.
 */
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

/* ── dateToISO ───────────────────────────────────────────── */

describe('dateToISO', () => {
  it('formats a date with two-digit month and day', () => {
    expect(dateToISO(new Date(2026, 0, 15))).toBe('2026-01-15');
  });

  it('pads single-digit month and day with leading zero', () => {
    expect(dateToISO(new Date(2026, 2, 5))).toBe('2026-03-05');
    expect(dateToISO(new Date(2026, 11, 1))).toBe('2026-12-01');
  });
});

/* ── parseBookingsCSV ────────────────────────────────────── */

describe('parseBookingsCSV', () => {
  it('parses a valid CSV with multiple rows', () => {
    var csv = ['desde,hasta', '2026-01-10,2026-01-15', '2026-02-01,2026-02-05'].join('\n');
    expect(parseBookingsCSV(csv)).toEqual([
      { desde: '2026-01-10', hasta: '2026-01-15' },
      { desde: '2026-02-01', hasta: '2026-02-05' },
    ]);
  });

  it('returns empty array for empty CSV string', () => {
    expect(parseBookingsCSV('')).toEqual([]);
  });

  it('returns empty array when CSV has only a header row', () => {
    expect(parseBookingsCSV('desde,hasta')).toEqual([]);
  });
});

/* ── isNightBlocked ──────────────────────────────────────── */

describe('isNightBlocked', () => {
  var bookings = [
    { desde: '2026-01-10', hasta: '2026-01-15' },
    { desde: '2026-02-20', hasta: '2026-02-25' },
  ];

  it('returns true when date is inside a blocked range', () => {
    expect(isNightBlocked('2026-01-12', bookings)).toBe(true);
  });

  it('returns false when date is outside any blocked range', () => {
    expect(isNightBlocked('2026-01-20', bookings)).toBe(false);
  });

  it('returns true when date equals the start (desde) of a range', () => {
    expect(isNightBlocked('2026-01-10', bookings)).toBe(true);
  });

  it('returns false when date equals the end (hasta) of a range', () => {
    expect(isNightBlocked('2026-01-15', bookings)).toBe(false);
  });
});

/* ── getNightPrice ───────────────────────────────────────── */

describe('getNightPrice', () => {
  var holidays = ['2026-01-01', '2026-05-01'];

  it('returns PRICE_REGULAR for a regular weekday not near a holiday', () => {
    // 2026-01-13 is a Tuesday (dayOfWeek = 2)
    expect(getNightPrice(new Date(2026, 0, 13), holidays)).toBe(PRICE_REGULAR);
  });

  it('returns PRICE_HIGH when the date is a holiday', () => {
    // 2026-01-01 is a holiday
    expect(getNightPrice(new Date(2026, 0, 1), holidays)).toBe(PRICE_HIGH);
  });

  it('returns PRICE_HIGH on a Friday even without holidays', () => {
    // 2026-01-16 is a Friday (dayOfWeek = 5)
    expect(getNightPrice(new Date(2026, 0, 16), holidays)).toBe(PRICE_HIGH);
  });

  it('returns PRICE_HIGH when the next day is a holiday (eve)', () => {
    // 2026-04-30 is a Thursday — next day (2026-05-01) is a holiday
    expect(getNightPrice(new Date(2026, 3, 30), holidays)).toBe(PRICE_HIGH);
  });

  it('returns PRICE_HIGH on a Saturday', () => {
    // 2026-01-17 is a Saturday (dayOfWeek = 6)
    expect(getNightPrice(new Date(2026, 0, 17), holidays)).toBe(PRICE_HIGH);
  });
});

/* ── calculateBreakdown ──────────────────────────────────── */

describe('calculateBreakdown', () => {
  it('returns breakdown with regular prices when no holidays or bookings', () => {
    // 2026-01-12 (Mon) to 2026-01-14 (Wed) = 2 nights, all weekdays
    var checkIn = new Date(2026, 0, 12);
    var checkOut = new Date(2026, 0, 14);
    var result = calculateBreakdown(checkIn, checkOut, [], []);

    expect(result).toHaveLength(2);
    result.forEach(function (night) {
      expect(night.price).toBe(PRICE_REGULAR);
      expect(night.isHoliday).toBe(false);
      expect(night.isEve).toBe(false);
      expect(night.isBlocked).toBe(false);
    });
  });

  it('marks holiday nights with PRICE_HIGH and isHoliday flag', () => {
    // Night of 2026-01-01 (Thu) → holiday, Night of 2026-01-02 (Fri) → weekend
    var checkIn = new Date(2026, 0, 1);
    var checkOut = new Date(2026, 0, 3);
    var holidays = ['2026-01-01'];
    var result = calculateBreakdown(checkIn, checkOut, holidays, []);

    expect(result).toHaveLength(2);
    expect(result[0].isHoliday).toBe(true);
    expect(result[0].price).toBe(PRICE_HIGH);
    // second night is Friday — also PRICE_HIGH but not a holiday
    expect(result[1].isHoliday).toBe(false);
  });

  it('marks blocked nights when dates fall inside a booking range', () => {
    // Night of 2026-01-12 (Mon) is blocked by booking, but 2026-01-13 is not
    var checkIn = new Date(2026, 0, 12);
    var checkOut = new Date(2026, 0, 14);
    var bookings = [{ desde: '2026-01-12', hasta: '2026-01-13' }];
    var result = calculateBreakdown(checkIn, checkOut, [], bookings);

    expect(result).toHaveLength(2);
    expect(result[0].isBlocked).toBe(true);
    expect(result[1].isBlocked).toBe(false);
  });
});

/* ── buildWhatsAppMessage ────────────────────────────────── */

describe('buildWhatsAppMessage', () => {
  it('includes driver info, night breakdown, total and payment method', () => {
    var breakdown = [
      {
        date: new Date(2026, 0, 12),
        dayName: 'lunes',
        dateStr: '12 de enero',
        price: 4000,
        isHoliday: false,
        isEve: true,
        isBlocked: false,
      },
      {
        date: new Date(2026, 0, 13),
        dayName: 'martes',
        dateStr: '13 de enero',
        price: 4000,
        isHoliday: false,
        isEve: false,
        isBlocked: false,
      },
    ];

    var msg = buildWhatsAppMessage(breakdown, 'Carlos', 'ABC-123', '42', 'transferencia');

    expect(msg).toContain('Carlos');
    expect(msg).toContain('ABC-123');
    expect(msg).toContain('42');
    expect(msg).toContain('lunes');
    expect(msg).toContain('12 de enero');
    expect(msg).toContain('martes');
    expect(msg).toContain('13 de enero');
    expect(msg).toContain('Víspera');
    expect(msg).toContain('transferencia');
    expect(msg).toContain('Total:');
  });

  it('marks a holiday night with the Feriado label', () => {
    var breakdown = [
      {
        date: new Date(2026, 0, 1),
        dayName: 'jueves',
        dateStr: '1 de enero',
        price: 5000,
        isHoliday: true,
        isEve: false,
        isBlocked: false,
      },
    ];

    var msg = buildWhatsAppMessage(breakdown, 'Test', 'XX-00', '1', 'efectivo');
    expect(msg).toContain('Feriado');
  });
});

/* ── sessionStorage caching ──────────────────────────────── */

describe('caching helpers', () => {
  beforeEach(function () {
    sessionStorage.clear();
  });

  it('setCachedHolidays stores and getCachedHolidays retrieves data', () => {
    var data = ['2026-01-01', '2026-05-01'];
    setCachedHolidays(data);
    expect(getCachedHolidays()).toEqual(data);
  });

  it('setCachedBookings stores and getCachedBookings retrieves data', () => {
    var data = [{ desde: '2026-01-10', hasta: '2026-01-15' }];
    setCachedBookings(data);
    expect(getCachedBookings()).toEqual(data);
  });

  it('getCachedHolidays returns null when no cache exists', () => {
    expect(getCachedHolidays()).toBeNull();
  });

  it('getCachedBookings returns null when no cache exists', () => {
    expect(getCachedBookings()).toBeNull();
  });
});

/* ── initParkingReservation (DOM) ────────────────────────── */

describe('initParkingReservation', () => {
  beforeEach(function () {
    sessionStorage.clear();
    installParkingDOM();
  });

  it('returns early when required DOM elements are missing', () => {
    document.body.innerHTML = '';
    expect(initParkingReservation()).toBeUndefined();
  });

  it('sets min/max on date inputs and wires event listeners', function () {
    initParkingReservation();

    var checkin = document.getElementById('parking-checkin');
    var checkout = document.getElementById('parking-checkout');
    var submitBtn = document.getElementById('parking-submit');

    expect(checkin.min).toBeTruthy();
    expect(checkin.max).toBeTruthy();
    expect(checkout.min).toBeTruthy();
    expect(checkout.max).toBeTruthy();
    // Submit button should not throw when clicked (listener added via addEventListener)
    expect(function () {
      submitBtn.dispatchEvent(new window.Event('click'));
    }).not.toThrow();
  });
});
