import { applyDecorators } from '@nestjs/common';
import { Transform } from 'class-transformer';
import { IsString, Matches, MaxLength, MinLength } from 'class-validator';

/**
 * Política de contraseña única para todo el proyecto (mínimo 8 caracteres,
 * al menos un número y una mayúscula) — usada en RegisterDto, CreateUserDto
 * y UpdateUserDto. Si la política cambia, cambia acá una sola vez en vez de
 * en cada DTO por separado. No se usa en LoginDto a propósito: el login
 * tiene que aceptar contraseñas que ya existen en la base aunque hayan sido
 * creadas bajo una política anterior (o por el seed de admin inicial, que
 * no pasa por esta validación).
 */
export function IsPassword() {
  return applyDecorators(
    Transform(({ value }) =>
      typeof value === 'string' ? value.trim() : value,
    ),
    IsString({ message: 'La contraseña debe ser una cadena de texto.' }),
    MinLength(8, {
      message: 'La contraseña debe tener al menos 8 caracteres.',
    }),
    // tope para no hashear con argon2 textos gigantes (consumo de CPU/memoria)
    MaxLength(128, {
      message: 'La contraseña no puede superar los 128 caracteres.',
    }),
    Matches(/[0-9]/, {
      message: 'La contraseña debe contener al menos un número.',
    }),
    Matches(/[A-Z]/, {
      message: 'La contraseña debe contener al menos una letra mayúscula.',
    }),
  );
}
