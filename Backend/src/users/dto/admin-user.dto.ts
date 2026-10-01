import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { Role } from '@/common/enums/role.enum';
import { IsPassword } from '@/common/decorators/is-password.decorator';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

/**
 * Edición de OTRO usuario por un ADMIN. No incluye nickUsuario (es el
 * identificador de login; cambiarlo lo hace el propio usuario desde su
 * perfil) ni password (va por el endpoint de restablecer clave).
 */
export class AdminUpdateUserDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: 'El nombre no puede quedar vacío.' })
  @MaxLength(60)
  nombre?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: 'El apellido no puede quedar vacío.' })
  @MaxLength(60)
  apellido?: string;

  // opcional al editar, pero no se puede BORRAR (null): el email es la
  // única vía para recuperar la clave. IsOptional dejaría pasar null.
  @ValidateIf((_o, value) => value !== undefined)
  @Transform(trim)
  @IsEmail({}, { message: 'El email no es válido.' })
  @MaxLength(255)
  email?: string;

  @IsOptional()
  @IsEnum(Role, { message: 'Rol inválido' })
  role?: Role;
}

export class AdminResetPasswordDto {
  @IsPassword()
  password: string;
}
