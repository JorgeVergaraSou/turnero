import { Transform } from 'class-transformer';
import { IsBoolean, IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { normalizeNoticeText } from '../privacy-notice.util';

const normalize = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? normalizeNoticeText(value) : value;

/** Publicar una versión nueva del aviso: nunca se edita una ya publicada. */
export class PublishPrivacyNoticeDto {
  @Transform(normalize)
  @IsString()
  @IsNotEmpty({ message: 'El aviso breve no puede quedar vacío.' })
  @MaxLength(2000, { message: 'El aviso breve admite hasta 2000 caracteres.' })
  summary: string;

  @Transform(normalize)
  @IsString()
  @IsNotEmpty({ message: 'La política de privacidad no puede quedar vacía.' })
  @MaxLength(30000, {
    message: 'La política de privacidad admite hasta 30000 caracteres.',
  })
  policy: string;

  /** true = borrador pendiente de revisión legal (se avisa en pantalla) */
  @IsBoolean({ message: 'Indicá si es un borrador.' })
  isDraft: boolean;
}
