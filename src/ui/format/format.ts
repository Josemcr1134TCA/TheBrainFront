/**
 * Regional formats of the design system (EP00-TBR-004, CA2). Pure functions: no Angular, no machine clock.
 * Locale is es-MX, currency MXN, time zone America/Mexico_City. Rounding is half away from zero (PQ-1).
 * Dates never use local getters: the result does not depend on the time zone of the machine (AJ-5).
 */
export const LOCALE = 'es-MX';
export const CURRENCY = 'MXN';
export const TIME_ZONE = 'America/Mexico_City';
/** What a missing value shows: the em dash (U+2014). */
export const NULL_DISPLAY = '—';

const NBSP = ' ';
// Fixed table: CLDR gives "sept" for September, the product rule asks for "sep" (AJ-5).
const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'] as const;

type Maybe<T> = T | null | undefined;

// useGrouping 'always' and roundingMode are newer than the TypeScript lib of this project, hence the cast.
const base = {
  useGrouping: 'always',
  signDisplay: 'negative',
  roundingMode: 'halfExpand',
} as unknown as Intl.NumberFormatOptions;

const moneyNoCents = new Intl.NumberFormat(LOCALE, { ...base, style: 'currency', currency: CURRENCY, minimumFractionDigits: 0, maximumFractionDigits: 0 });
const moneyCents = new Intl.NumberFormat(LOCALE, { ...base, style: 'currency', currency: CURRENCY, minimumFractionDigits: 2, maximumFractionDigits: 2 });
const quantity = new Intl.NumberFormat(LOCALE, { ...base, minimumFractionDigits: 0, maximumFractionDigits: 0 });
const percent = new Intl.NumberFormat(LOCALE, { ...base, minimumFractionDigits: 1, maximumFractionDigits: 1 });
const zoneParts = new Intl.DateTimeFormat('en-US', { timeZone: TIME_ZONE, year: 'numeric', month: 'numeric', day: 'numeric' });

const isNumber = (v: Maybe<number>): v is number => typeof v === 'number' && Number.isFinite(v);

/** MXN amount in full: `$1,850,000`; with `cents` `$1,234.50`; negative `-$1,234`; empty `—`. */
export function formatMoney(value: Maybe<number>, options: { cents?: boolean } = {}): string {
  if (!isNumber(value)) return NULL_DISPLAY;
  return (options.cents ? moneyCents : moneyNoCents).format(value);
}

/** Whole quantity with thousands separator: `1,234`; empty `—`. */
export function formatQuantity(value: Maybe<number>): string {
  if (!isNumber(value)) return NULL_DISPLAY;
  return quantity.format(value);
}

/** Percentage points with 1 decimal and a no-break space: `24.5 %` (24.5 means 24.5 %, not a fraction). */
export function formatPercent(value: Maybe<number>): string {
  if (!isNumber(value)) return NULL_DISPLAY;
  return `${percent.format(value)}${NBSP}%`;
}

interface Ymd { y: number; m: number; d: number }

function civilDate(text: string): Ymd | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const check = new Date(Date.UTC(y, mo - 1, d));
  if (check.getUTCFullYear() !== y || check.getUTCMonth() !== mo - 1 || check.getUTCDate() !== d) return null;
  return { y, m: mo, d };
}

function zonedDate(instant: Date): Ymd | null {
  if (Number.isNaN(instant.getTime())) return null;
  const parts = zoneParts.formatToParts(instant);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return { y: get('year'), m: get('month'), d: get('day') };
}

function toYmd(value: string | Date): Ymd | null {
  if (value instanceof Date) return zonedDate(value);
  const text = value.trim();
  const civil = civilDate(text);
  if (civil) return civil;
  // An instant needs an explicit zone (Z or an offset); a time without zone is ambiguous.
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})$/i.test(text)) return zonedDate(new Date(text));
  return null;
}

/**
 * Date for people: `9 oct` in the current year, `30-sep-2025` in another year; empty or invalid `—`.
 * `now` is a parameter (inject the clock); the current year is the year of `now` in America/Mexico_City.
 * A `YYYY-MM-DD` string is a civil date and is not converted between zones.
 */
export function formatDate(value: Maybe<string | Date>, now: Date): string {
  if (value === null || value === undefined) return NULL_DISPLAY;
  const date = toYmd(value);
  const current = zonedDate(now);
  if (!date || !current) return NULL_DISPLAY;
  const month = MONTHS[date.m - 1];
  return date.y === current.y ? `${date.d} ${month}` : `${date.d}-${month}-${date.y}`;
}
