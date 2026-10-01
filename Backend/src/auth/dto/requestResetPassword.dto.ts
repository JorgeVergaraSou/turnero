import { IsEmail, IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class RequestResetPasswordDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  nickUsuario: string;

  // Solo se usa la primera vez que el usuario todavía no tiene un email
  // asociado (ver AuthService.requestResetPassword) — si ya tiene uno, se
  // ignora este y el token siempre se manda al email ya guardado. Igual es
  // obligatorio en el DTO: pedir nickUsuario + email juntos evita que
  // alguien con un token válido a su propio email pueda aplicarlo sobre el
  // nick de otra persona.
  @IsNotEmpty()
  @IsEmail()
  @MaxLength(255)
  email: string;
}
