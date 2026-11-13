// Black-box tests of safeReturnUrl (design EP00-TBR-005 §7.2 and precision (b) of the architect; decision S8).
// [EP00-TBR-005-CA4] Only internal routes of the app are accepted as the return destination; anything else falls back.
//   Accepted: a string of at most 2048 characters that starts with «/», not «//» nor «/\», with no «\» and no control
//   characters anywhere, whose resolution against a fake origin keeps that origin, and whose resolved pathname is not
//   /entrada nor /sin-permiso (with or without query or fragment). Everything else → fallback (default «/»).
// Written before the code (T1). Synthetic values only.
import { safeReturnUrl } from './return-url';

const FALLBACK = '/';

describe('[EP00-TBR-005-CA4] safeReturnUrl accepts internal routes', () => {
  const ACCEPTED = [
    '/',
    '/catalogo',
    '/catalogo?pagina=2',
    '/catalogo#fila-3',
    '/catalogo?pagina=2#fila-3',
    '/zona/sub/detalle',
    '/catalogo?returnUrl=%2Fentrada',
    '/@sample.example',
    '/entradas',
    '/sin-permisos-extra',
    '/zona/entrada',
  ];
  for (const url of ACCEPTED) {
    it(`[EP00-TBR-005-CA4] keeps «${url}»`, () => {
      expect(safeReturnUrl(url)).toBe(url);
    });
  }

  it('[EP00-TBR-005-CA4] accepts exactly 2048 characters', () => {
    const url = '/' + 'a'.repeat(2047);

    expect(url).toHaveLength(2048);
    expect(safeReturnUrl(url)).toBe(url);
  });
});

describe('[EP00-TBR-005-CA4] safeReturnUrl rejects anything that is not an internal route (no open redirect)', () => {
  const REJECTED: [string, unknown][] = [
    ['protocol-relative «//»', '//evil.example/x'],
    ['«/\\» (browsers read it as «//»)', '/\\evil.example'],
    ['a backslash anywhere', '/zona\\evil'],
    ['two backslashes', '\\\\evil.example'],
    ['an absolute http URL', 'http://evil.example/'],
    ['an absolute https URL', 'https://evil.example/catalogo'],
    ['a javascript: URL', 'javascript:alert(1)'],
    ['a data: URL', 'data:text/html,hola'],
    ['a scheme without slashes', 'https:evil.example'],
    ['a relative path', 'catalogo'],
    ['a dot-relative path', './catalogo'],
    ['an empty string', ''],
    ['a leading space', ' /catalogo'],
    ['a newline', '/cata\nlogo'],
    ['a carriage return', '/catalogo\r'],
    ['a tab that would turn into «//»', '/\t/evil.example'],
    ['a NUL character', '/catalogo\u0000'],
    ['a DEL character', '/catalogo\u007f'],
    ['more than 2048 characters', '/' + 'a'.repeat(2048)],
    ['null', null],
    ['undefined', undefined],
    ['a number', 42],
    ['an object', { url: '/catalogo' }],
    ['an array', ['/catalogo']],
  ];
  for (const [label, raw] of REJECTED) {
    it(`[EP00-TBR-005-CA4] falls back on ${label}`, () => {
      expect(safeReturnUrl(raw)).toBe(FALLBACK);
    });
  }
});

describe('[EP00-TBR-005-CA4] safeReturnUrl never returns to the entry nor to the denied screen (precision b)', () => {
  const REJECTED = [
    '/entrada',
    '/entrada?returnUrl=%2Fcatalogo',
    '/entrada#x',
    '/entrada/',
    '/sin-permiso',
    '/sin-permiso?x=1',
    '/sin-permiso#x',
    '/./entrada',
    '/zona/../entrada',
    '/%2e%2e/sin-permiso',
  ];
  for (const url of REJECTED) {
    it(`[EP00-TBR-005-CA4] falls back on «${url}»`, () => {
      expect(safeReturnUrl(url)).toBe(FALLBACK);
    });
  }
});

describe('[EP00-TBR-005-CA4] safeReturnUrl fallback', () => {
  it('[EP00-TBR-005-CA4] the default fallback is «/»', () => {
    expect(safeReturnUrl('//evil.example')).toBe('/');
  });

  it('[EP00-TBR-005-CA4] uses the given fallback when the value is rejected', () => {
    expect(safeReturnUrl('https://evil.example', '/catalogo')).toBe('/catalogo');
    expect(safeReturnUrl(undefined, '/catalogo')).toBe('/catalogo');
  });

  it('[EP00-TBR-005-CA4] ignores the fallback when the value is accepted', () => {
    expect(safeReturnUrl('/zona', '/catalogo')).toBe('/zona');
  });
});
