import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';

/** Como ParseIntPipe, pero deja pasar `undefined`/'' (query param opcional). */
@Injectable()
export class OptionalIntPipe
  implements PipeTransform<string | undefined, number | undefined>
{
  transform(value: string | undefined): number | undefined {
    if (value === undefined || value === '') {
      return undefined;
    }
    if (!/^\d+$/.test(value)) {
      throw new BadRequestException('Se esperaba un número entero positivo');
    }
    return Number(value);
  }
}
