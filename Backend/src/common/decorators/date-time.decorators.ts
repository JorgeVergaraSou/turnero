import { applyDecorators } from '@nestjs/common';
import {
  IsString,
  Matches,
  ValidateBy,
  ValidationOptions,
} from 'class-validator';
import moment from 'moment-timezone';

/** Fecha de calendario 'YYYY-MM-DD' que además existe (rechaza 2026-02-30). */
export function IsDateOnly(validationOptions?: ValidationOptions) {
  return applyDecorators(
    IsString({ message: 'La fecha debe ser un texto con formato AAAA-MM-DD.' }),
    ValidateBy(
      {
        name: 'isDateOnly',
        validator: {
          validate: (value: unknown) =>
            typeof value === 'string' &&
            /^\d{4}-\d{2}-\d{2}$/.test(value) &&
            moment.utc(value, 'YYYY-MM-DD', true).isValid(),
          defaultMessage: () =>
            'La fecha debe tener formato AAAA-MM-DD y ser una fecha válida.',
        },
      },
      validationOptions,
    ),
  );
}

/** Hora del día 'HH:mm' (00:00 a 23:59). */
export function IsTimeOfDay() {
  return applyDecorators(
    IsString({ message: 'La hora debe ser un texto con formato HH:mm.' }),
    Matches(/^([01]\d|2[0-3]):[0-5]\d$/, {
      message: 'La hora debe tener formato HH:mm (00:00 a 23:59).',
    }),
  );
}
