import { Transform } from 'class-transformer';
import { IsJWT, IsString, MaxLength } from 'class-validator';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

/** Segundo paso del login: el challenge que devolvió /auth/login. */
export class TwoFactorChallengeDto {
  @IsJWT({ message: 'La verificación venció. Volvé a ingresar.' })
  challengeToken: string;
}

export class TwoFactorCodeDto extends TwoFactorChallengeDto {
  /** 6 dígitos de la app, o un código de recuperación (XXXXX-XXXXX) */
  @Transform(trim)
  @IsString()
  @MaxLength(20)
  code: string;
}
