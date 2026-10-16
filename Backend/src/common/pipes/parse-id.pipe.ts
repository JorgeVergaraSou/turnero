import {
  BadRequestException,
  Injectable,
  NotFoundException,
  PipeTransform,
} from '@nestjs/common';

/** El mayor id que entra en una columna `int unsigned` de MySQL. */
export const MAX_ID = 4_294_967_295;

/**
 * Identificador de la ruta (`/pacientes/:id`). Reemplaza a ParseIntPipe en los
 * ids: ParseIntPipe acepta cualquier entero (-1, 99999999999999999999), y esos
 * valores llegaban hasta la base, donde reventaban al guardar la auditoría
 * ("Out of range value for column 'patient_id'") y salían como un 500 (con el
 * intento denegado sin registrar).
 *
 * - no es un número → 400
 * - es un número pero no puede ser el id de nada (≤ 0 o más grande que la
 *   columna) → 404, igual que un id que no existe
 */
@Injectable()
export class ParseIdPipe implements PipeTransform<unknown, number> {
  transform(value: unknown): number {
    const text = typeof value === 'number' ? String(value) : value;
    if (typeof text !== 'string' || !/^-?\d+$/.test(text.trim())) {
      throw new BadRequestException('El identificador no es válido.');
    }
    const id = Number(text);
    if (!Number.isSafeInteger(id) || id < 1 || id > MAX_ID) {
      throw new NotFoundException('No encontrado.');
    }
    return id;
  }
}
