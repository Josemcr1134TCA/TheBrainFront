// [EP00-TBR-004-CA2] Format pipes and the injectable clock (design docs/diseno/EP00-TBR-004.md §2.2, §6).
// The pipes use the same pure functions as format.ts; TB_CLOCK replaces the machine clock in tests.
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { TB_CLOCK } from './clock';
import { TbDatePipe, TbMoneyPipe, TbPercentPipe, TbQuantityPipe } from './format.pipes';

const NBSP = ' ';
const DASH = '—';

@Component({
  selector: 'tb-format-pipes-host',
  imports: [TbMoneyPipe, TbQuantityPipe, TbPercentPipe, TbDatePipe],
  template: `
    <span id="money">{{ amount | tbMoney }}</span>
    <span id="money-cents">{{ amount | tbMoney: { cents: true } }}</span>
    <span id="money-null">{{ missing | tbMoney }}</span>
    <span id="qty">{{ qty | tbQuantity }}</span>
    <span id="pct">{{ pct | tbPercent }}</span>
    <span id="date-this-year">{{ thisYear | tbDate }}</span>
    <span id="date-other-year">{{ otherYear | tbDate }}</span>
    <span id="date-null">{{ missingDate | tbDate }}</span>
  `,
})
class FormatPipesHost {
  amount = 1234.5;
  missing: number | null = null;
  // [EP00-TBR-004-CA2] H3: a missing date is a string or null, never a number.
  missingDate: string | null = null;
  qty = 1234;
  pct = 24.5;
  thisYear = '2026-10-09';
  otherYear = '2025-09-30';
}

function render(now: string) {
  TestBed.configureTestingModule({
    imports: [FormatPipesHost],
    providers: [{ provide: TB_CLOCK, useValue: () => new Date(now) }],
  });
  const fixture = TestBed.createComponent(FormatPipesHost);
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  return (id: string) => el.querySelector(`#${id}`)?.textContent?.trim();
}

describe('[EP00-TBR-004-CA2] format pipes', () => {
  it('[EP00-TBR-004-CA2] tbMoney shows $1,235 by default (half away from zero) and $1,234.50 with { cents: true }', () => {
    const text = render('2026-11-11T18:00:00Z');
    expect(text('money')).toBe('$1,235');
    expect(text('money-cents')).toBe('$1,234.50');
    expect(text('money-null')).toBe(DASH);
  });

  it('[EP00-TBR-004-CA2] tbQuantity and tbPercent show 1,234 and 24.5 % with U+00A0', () => {
    const text = render('2026-11-11T18:00:00Z');
    expect(text('qty')).toBe('1,234');
    expect(text('pct')).toBe(`24.5${NBSP}%`);
  });

  it('[EP00-TBR-004-CA2] tbDate reads TB_CLOCK: 9 oct this year and 30-sep-2025 in another year', () => {
    const text = render('2026-11-11T18:00:00Z');
    expect(text('date-this-year')).toBe('9 oct');
    expect(text('date-other-year')).toBe('30-sep-2025');
    expect(text('date-null')).toBe(DASH);
  });

  it('[EP00-TBR-004-CA2] tbDate follows a replaced clock: with now in 2027 the 2026 date carries its year', () => {
    const text = render('2027-03-01T18:00:00Z');
    expect(text('date-this-year')).toBe('9-oct-2026');
  });

  it('[EP00-TBR-004-CA2] tbDate takes the current year in America/Mexico_City (2026-01-01T05:00Z is still 2025 there)', () => {
    const text = render('2026-01-01T05:00:00Z');
    expect(text('date-other-year')).toBe('30 sep');
    expect(text('date-this-year')).toBe('9-oct-2026');
  });
});

describe('[EP00-TBR-004-CA2] TbDatePipe input type (H3)', () => {
  it('[EP00-TBR-004-CA2] shows «—» for a null date', () => {
    const text = render('2026-11-11T18:00:00Z');
    expect(text('date-null')).toBe(DASH);
  });

  it('[EP00-TBR-004-CA2] does not accept a number: a mistyped date fails at compile time instead of showing «—»', () => {
    // Type check only: never called. If TbDatePipe accepted number again, the directive below would be unused and
    // this file would not compile.
    const typeCheckOnly = (pipe: TbDatePipe) => {
      // @ts-expect-error H3: a number is not a date for tbDate.
      return pipe.transform(20261009);
    };
    expect(typeof typeCheckOnly).toBe('function');
  });
});

describe('[EP00-TBR-004-CA2] TB_CLOCK', () => {
  it('[EP00-TBR-004-CA2] defaults to the machine clock when nobody replaces it', () => {
    const clock = TestBed.inject(TB_CLOCK);
    expect(typeof clock).toBe('function');
    const before = Date.now();
    const now = clock();
    expect(now).toBeInstanceOf(Date);
    expect(Math.abs(now.getTime() - before)).toBeLessThan(5_000);
  });
});
