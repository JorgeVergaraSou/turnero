import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';
import moment from 'moment-timezone';

/** Query param de fecha 'YYYY-MM-DD' opcional; rechaza fechas inexistentes. */
@Injectable()
export class OptionalDatePipe
  implements PipeTransform<string | undefined, string | undefined>
{
  transform(value: string | undefined): string | undefined {
    if (value === undefined || value === '') {
      return undefined;
    }
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
      !moment.utc(value, 'YYYY-MM-DD', true).isValid()
    ) {
      throw new BadRequestException('La fecha debe tener formato AAAA-MM-DD');
    }
    return value;
  }
}

/** Igual que OptionalDatePipe pero obligatorio. */
@Injectable()
export class RequiredDatePipe implements PipeTransform<string, string> {
  private readonly optional = new OptionalDatePipe();

  transform(value: string): string {
    const parsed = this.optional.transform(value);
    if (!parsed) {
      throw new BadRequestException('La fecha es obligatoria (AAAA-MM-DD)');
    }
    return parsed;
  }
}
