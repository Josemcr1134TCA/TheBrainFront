// [EP00-TBR-004-CA2] Regional format (story v3 format rules, PQ-1, AJ-5, AJ-6; design docs/diseno/EP00-TBR-004.md §2.1, §6).
// Black-box tests written from the criteria before the implementation exists. Synthetic values only.
import { formatDate, formatMoney, formatPercent, formatQuantity, NULL_DISPLAY } from './format';

const NBSP = ' ';
const DASH = '—';
// Injected "now" values (the clock is a parameter, not the machine clock).
const NOW = new Date('2026-11-11T18:00:00Z');
// 2026-01-01T05:00Z is still 2025-12-31 23:00 in America/Mexico_City.
const NOW_NEW_YEAR_UTC = new Date('2026-01-01T05:00:00Z');
const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

describe('[EP00-TBR-004-CA2] NULL_DISPLAY', () => {
  it('[EP00-TBR-004-CA2] is the em dash U+2014', () => {
    expect(NULL_DISPLAY).toBe(DASH);
  });
});

describe('[EP00-TBR-004-CA2] formatMoney', () => {
  it('[EP00-TBR-004-CA2] shows MXN without cents by default: 1850000 -> $1,850,000', () => {
    expect(formatMoney(1850000)).toBe('$1,850,000');
    expect(formatMoney(1850000, {})).toBe('$1,850,000');
    expect(formatMoney(1850000, { cents: false })).toBe('$1,850,000');
  });

  it('[EP00-TBR-004-CA2] groups 4-digit amounts: 1234 -> $1,234', () => {
    expect(formatMoney(1234)).toBe('$1,234');
  });

  it('[EP00-TBR-004-CA2] shows 2 decimals with the cents option: 1234.5 -> $1,234.50', () => {
    expect(formatMoney(1234.5, { cents: true })).toBe('$1,234.50');
    expect(formatMoney(0, { cents: true })).toBe('$0.00');
    expect(formatMoney(-1234.5, { cents: true })).toBe('-$1,234.50');
  });

  it('[EP00-TBR-004-CA2] rounds half away from zero (PQ-1): 1234.5 -> $1,235 and -1234.5 -> -$1,235', () => {
    expect(formatMoney(1234.5)).toBe('$1,235');
    expect(formatMoney(2.5)).toBe('$3');
    expect(formatMoney(1234.49)).toBe('$1,234');
    expect(formatMoney(-1234.5)).toBe('-$1,235');
    expect(formatMoney(-2.5)).toBe('-$3');
  });

  it('[EP00-TBR-004-CA2] puts the minus sign before the symbol: -1234 -> -$1,234', () => {
    expect(formatMoney(-1234)).toBe('-$1,234');
  });

  it('[EP00-TBR-004-CA2] shows zero as $0, also for a negative that rounds to zero (no -$0)', () => {
    expect(formatMoney(0)).toBe('$0');
    expect(formatMoney(-0)).toBe('$0');
    expect(formatMoney(-0.4)).toBe('$0');
    expect(formatMoney(-0.004, { cents: true })).toBe('$0.00');
  });

  it('[EP00-TBR-004-CA2] shows big figures in full, never abbreviated: 1e12 -> $1,000,000,000,000', () => {
    expect(formatMoney(1e12)).toBe('$1,000,000,000,000');
    expect(formatMoney(1_250_000)).not.toMatch(/[kKmM]|mil|millones/);
  });

  it('[EP00-TBR-004-CA2] shows null, undefined, NaN and infinities as the em dash', () => {
    for (const v of [
      null,
      undefined,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
    ]) {
      expect(formatMoney(v)).toBe(DASH);
      expect(formatMoney(v, { cents: true })).toBe(DASH);
    }
  });
});

describe('[EP00-TBR-004-CA2] formatQuantity', () => {
  it('[EP00-TBR-004-CA2] groups thousands: 1234 -> 1,234 and 1234567 -> 1,234,567', () => {
    expect(formatQuantity(1234)).toBe('1,234');
    expect(formatQuantity(1234567)).toBe('1,234,567');
    expect(formatQuantity(12)).toBe('12');
  });

  it('[EP00-TBR-004-CA2] shows 0 and negatives: 0 -> 0, -1234 -> -1,234', () => {
    expect(formatQuantity(0)).toBe('0');
    expect(formatQuantity(-1234)).toBe('-1,234');
  });

  it('[EP00-TBR-004-CA2] rounds a non-integer half away from zero (PQ-1), with no -0', () => {
    expect(formatQuantity(2.5)).toBe('3');
    expect(formatQuantity(-2.5)).toBe('-3');
    expect(formatQuantity(1234.4)).toBe('1,234');
    expect(formatQuantity(-0.4)).toBe('0');
  });

  it('[EP00-TBR-004-CA2] shows null, undefined, NaN and infinities as the em dash', () => {
    for (const v of [
      null,
      undefined,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
    ]) {
      expect(formatQuantity(v)).toBe(DASH);
    }
  });
});

describe('[EP00-TBR-004-CA2] formatPercent', () => {
  it('[EP00-TBR-004-CA2] takes percentage points and shows 1 decimal plus a no-break space: 24.5 -> 24.5 %', () => {
    expect(formatPercent(24.5)).toBe(`24.5${NBSP}%`);
  });

  it('[EP00-TBR-004-CA2] the separator is exactly U+00A0, never a plain space', () => {
    const text = formatPercent(24.5);
    expect(text).not.toContain('24.5 %');
    expect(text.charCodeAt(text.length - 2)).toBe(0x00a0);
    expect(text.endsWith('%')).toBe(true);
  });

  it('[EP00-TBR-004-CA2] always shows 1 decimal: 24 -> 24.0 %, 0 -> 0.0 %, 24.46 -> 24.5 %', () => {
    expect(formatPercent(24)).toBe(`24.0${NBSP}%`);
    expect(formatPercent(0)).toBe(`0.0${NBSP}%`);
    expect(formatPercent(24.46)).toBe(`24.5${NBSP}%`);
  });

  it('[EP00-TBR-004-CA2] rounds half away from zero (PQ-1): -3.25 -> -3.3 %, and -0.04 -> 0.0 %', () => {
    expect(formatPercent(-3.25)).toBe(`-3.3${NBSP}%`);
    expect(formatPercent(3.25)).toBe(`3.3${NBSP}%`);
    expect(formatPercent(-0.04)).toBe(`0.0${NBSP}%`);
  });

  it('[EP00-TBR-004-CA2] groups thousands: 1234.5 -> 1,234.5 %', () => {
    expect(formatPercent(1234.5)).toBe(`1,234.5${NBSP}%`);
  });

  it('[EP00-TBR-004-CA2] shows null, undefined, NaN and infinities as the em dash', () => {
    for (const v of [
      null,
      undefined,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
    ]) {
      expect(formatPercent(v)).toBe(DASH);
    }
  });
});

describe('[EP00-TBR-004-CA2] formatDate', () => {
  it('[EP00-TBR-004-CA2] a civil date of the current year: 2026-10-09 -> 9 oct (no leading zero)', () => {
    expect(formatDate('2026-10-09', NOW)).toBe('9 oct');
    expect(formatDate('2026-03-05', NOW)).toBe('5 mar');
  });

  it('[EP00-TBR-004-CA2] a civil date of another year carries the year: 2025-09-30 -> 30-sep-2025 (not sept)', () => {
    expect(formatDate('2025-09-30', NOW)).toBe('30-sep-2025');
    expect(formatDate('2027-02-01', NOW)).toBe('1-feb-2027');
    expect(formatDate('2025-10-09', NOW)).toBe('9-oct-2025');
  });

  it('[EP00-TBR-004-CA2] uses the fixed month table for the 12 months, in the current year and in another year', () => {
    MONTHS.forEach((m, i) => {
      const mm = String(i + 1).padStart(2, '0');
      expect(formatDate(`2026-${mm}-15`, NOW)).toBe(`15 ${m}`);
      expect(formatDate(`2025-${mm}-01`, NOW)).toBe(`1-${m}-2025`);
    });
  });

  it('[EP00-TBR-004-CA2] a YYYY-MM-DD string is not converted from UTC (2025-09-30 stays the 30th)', () => {
    expect(formatDate('2025-09-30', NOW)).not.toContain('29');
    expect(formatDate('2026-01-01', NOW)).toBe('1 ene');
    expect(formatDate('2026-12-31', NOW)).toBe('31 dic');
  });

  it('[EP00-TBR-004-CA2] an instant is shown in America/Mexico_City: 2026-10-10T03:00:00Z -> 9 oct', () => {
    expect(formatDate('2026-10-10T03:00:00Z', NOW)).toBe('9 oct');
    expect(formatDate(new Date('2026-10-10T03:00:00Z'), NOW)).toBe('9 oct');
    expect(formatDate('2026-10-10T05:30:00+00:00', NOW)).toBe('9 oct');
    expect(formatDate('2026-10-09T23:30:00-06:00', NOW)).toBe('9 oct');
    expect(formatDate('2026-10-10T07:00:00Z', NOW)).toBe('10 oct');
  });

  it('[EP00-TBR-004-CA2] the year of an instant is also taken in America/Mexico_City', () => {
    // 2026-01-01T03:00Z is 2025-12-31 21:00 in Mexico City: another year than NOW.
    expect(formatDate('2026-01-01T03:00:00Z', NOW)).toBe('31-dic-2025');
  });

  it('[EP00-TBR-004-CA2] the current year is the year of now in America/Mexico_City, not in UTC', () => {
    expect(formatDate('2025-12-31', NOW_NEW_YEAR_UTC)).toBe('31 dic');
    expect(formatDate('2026-01-01', NOW_NEW_YEAR_UTC)).toBe('1-ene-2026');
  });

  it('[EP00-TBR-004-CA2] invalid strings, invalid dates, a time without zone and null show the em dash', () => {
    expect(formatDate('not-a-date', NOW)).toBe(DASH);
    expect(formatDate('2026-13-45', NOW)).toBe(DASH);
    expect(formatDate('', NOW)).toBe(DASH);
    expect(formatDate(new Date('invalid'), NOW)).toBe(DASH);
    expect(formatDate('2026-10-09T10:00:00', NOW)).toBe(DASH);
    expect(formatDate(null, NOW)).toBe(DASH);
    expect(formatDate(undefined, NOW)).toBe(DASH);
  });

  it('[EP00-TBR-004-CA2] never shows slashes or a leading zero', () => {
    for (const v of ['2026-01-05', '2025-02-03', '2026-10-10T03:00:00Z']) {
      const text = formatDate(v, NOW);
      expect(text).not.toContain('/');
      expect(text).not.toMatch(/^0/);
    }
  });
});
