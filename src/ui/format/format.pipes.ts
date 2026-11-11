import { inject, Pipe, PipeTransform } from '@angular/core';
import { TB_CLOCK } from './clock';
import { formatDate, formatMoney, formatPercent, formatQuantity } from './format';

/** `{{ amount | tbMoney }}` or `{{ amount | tbMoney: { cents: true } }}`. */
@Pipe({ name: 'tbMoney' })
export class TbMoneyPipe implements PipeTransform {
  transform(value: number | null | undefined, options: { cents?: boolean } = {}): string {
    return formatMoney(value, options);
  }
}

@Pipe({ name: 'tbQuantity' })
export class TbQuantityPipe implements PipeTransform {
  transform(value: number | null | undefined): string {
    return formatQuantity(value);
  }
}

@Pipe({ name: 'tbPercent' })
export class TbPercentPipe implements PipeTransform {
  transform(value: number | null | undefined): string {
    return formatPercent(value);
  }
}

/** Pure pipe: the current year is read when the input changes (accepted risk R5). */
@Pipe({ name: 'tbDate' })
export class TbDatePipe implements PipeTransform {
  private readonly clock = inject(TB_CLOCK);
  transform(value: string | null | undefined): string {
    return formatDate(value, this.clock());
  }
}
