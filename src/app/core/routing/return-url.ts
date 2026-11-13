const ORIGIN = 'https://internal.invalid';
const MAX_LENGTH = 2048;
const INTERNAL_DESTINATIONS = new Set(['/entrada', '/sin-permiso']);

// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001f\u007f-\u009f]/;

// Compares the resolved path: decoded, without matrix parameters and without trailing slashes.
function isInternalDestination(pathname: string): boolean {
  let decoded: string;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return true;
  }
  const normalized = decoded
    .split('/')
    .map((segment) => segment.split(';')[0])
    .join('/')
    .replace(/\/+$/, '');
  return INTERNAL_DESTINATIONS.has(normalized.toLowerCase());
}

/**
 * Returns `raw` only when it is a safe internal route to go back to; anything else yields `fallback`. It accepts a string
 * of at most 2048 characters that starts with "/" (not "//" or "/\"), has no backslash or control character, resolves
 * to the same origin and does not point to /entrada or /sin-permiso (no loops, no open redirect).
 */
export function safeReturnUrl(raw: unknown, fallback = '/'): string {
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > MAX_LENGTH) return fallback;
  if (!raw.startsWith('/') || raw.startsWith('//') || raw.startsWith('/\\')) return fallback;
  if (raw.includes('\\') || CONTROL_CHARS.test(raw)) return fallback;
  try {
    const url = new URL(raw, ORIGIN);
    if (url.origin !== ORIGIN) return fallback;
    if (isInternalDestination(url.pathname)) return fallback;
  } catch {
    return fallback;
  }
  return raw;
}
