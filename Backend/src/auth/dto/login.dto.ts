import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class LoginDto {
  // Sin política de formato ni trim automático acá a propósito: el login
  // tiene que aceptar cualquier nickUsuario que ya exista en la base tal
  // cual fue guardado (ver mismo criterio en `password` abajo). La
  // política fuerte (@IsNickUsuario()) se aplica al crear/cambiar el
  // nombre de usuario, no al intentar loguearse con el que ya tiene.
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  nickUsuario: string;

  // Sin política de complejidad ni trim automático acá a propósito: el
  // login tiene que aceptar cualquier contraseña que ya exista en la base
  // tal cual fue guardada, incluso si no cumple la política actual (ej. el
  // usuario ADMIN inicial sembrado por SEED_ADMIN_PASSWORD). La política
  // fuerte se aplica al crear/cambiar la contraseña (ver IsPassword()), no
  // al intentar loguearse con la que ya tiene.
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  password: string;
}
/* CON ESTE DTO VALIDAREMOS LA INFORMACION DE LOGIN */
