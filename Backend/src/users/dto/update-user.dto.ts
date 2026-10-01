import {
  IsString,
  MaxLength,
  MinLength,
  IsEmail,
  IsOptional,
  ValidateIf,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { IsPassword } from '@/common/decorators/is-password.decorator';
import { IsNickUsuario } from '@/common/decorators/is-nick-usuario.decorator';

export class UpdateUserDto {
  @IsOptional()
  @IsNickUsuario()
  nickUsuario?: string;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString({ message: 'El nombre debe ser una cadena de texto.' })
  @MinLength(3, { message: 'El nombre debe tener al menos 3 caracteres.' })
  @MaxLength(60, { message: 'El nombre no puede superar los 60 caracteres.' })
  nombre?: string;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString({ message: 'El nombre debe ser una cadena de texto.' })
  @MinLength(3, { message: 'El nombre debe tener al menos 3 caracteres.' })
  @MaxLength(60, { message: 'El apellido no puede superar los 60 caracteres.' })
  apellido?: string;

  // opcional al editar, pero no se puede BORRAR (null): el email es la
  // única vía para recuperar la clave. IsOptional dejaría pasar null.
  @ValidateIf((_o, value) => value !== undefined)
  @IsEmail(
    {},
    {
      message: 'El email debe ser una dirección de correo electrónico válida.',
    },
  )
  @MaxLength(255, { message: 'El email no puede superar los 255 caracteres.' })
  email?: string;

  @IsOptional()
  @IsPassword()
  password?: string;

  @IsOptional()
  @IsString({ message: 'La contraseña actual debe ser una cadena de texto.' })
  @MaxLength(128)
  currentPassword?: string;
}
