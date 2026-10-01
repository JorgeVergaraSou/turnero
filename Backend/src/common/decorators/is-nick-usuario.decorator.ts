import { applyDecorators } from '@nestjs/common';
import { Transform } from 'class-transformer';
import { IsString, Matches, MaxLength, MinLength } from 'class-validator';

/**
 * Validación única para el identificador de login (nickUsuario): mínimo 3
 * caracteres, solo letras/números/puntos/guiones/guiones bajos — sin
 * espacios ni símbolos raros, y de paso evita cualquier intento de
 * inyección vía este campo en algún lugar donde se use en una query cruda.
 * Usado en RegisterDto, CreateUserDto y UpdateUserDto.
 */
export function IsNickUsuario() {
  return applyDecorators(
    Transform(({ value }) =>
      typeof value === 'string' ? value.trim() : value,
    ),
    IsString({ message: 'El nombre de usuario debe ser una cadena de texto.' }),
    MinLength(3, {
      message: 'El nombre de usuario debe tener al menos 3 caracteres.',
    }),
    // = largo de la columna nick_usuario
    MaxLength(60, {
      message: 'El nombre de usuario no puede superar los 60 caracteres.',
    }),
    Matches(/^[a-zA-Z0-9._-]+$/, {
      message:
        'El nombre de usuario solo puede contener letras, números, puntos, guiones y guiones bajos.',
    }),
  );
}
