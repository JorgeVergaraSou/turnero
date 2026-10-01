import { PartialType } from '@nestjs/mapped-types';
import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsInt,
  IsNotEmpty,
  IsPositive,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { IsDateOnly } from '@/common/decorators/date-time.decorators';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

/** Normaliza un DNI: saca puntos, espacios y guiones, y pasa a mayúsculas
 * ("12.345.678" y "12345678" son el mismo paciente). */
export function normalizeDocumentNumber(value: unknown): unknown {
  return typeof value === 'string'
    ? value.replace(/[.\s-]/g, '').toUpperCase()
    : value;
}

/**
 * Datos administrativos mínimos del paciente (principio de mínima
 * recopilación: nada clínico acá). Usado tanto por recepción como por la
 * reserva pública.
 */
export class PatientDataDto {
  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: 'El nombre es obligatorio.' })
  @MaxLength(80)
  firstName: string;

  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: 'El apellido es obligatorio.' })
  @MaxLength(80)
  lastName: string;

  @Transform(({ value }) => normalizeDocumentNumber(value))
  @IsString()
  @Matches(/^[A-Z0-9]{5,20}$/, {
    message: 'El DNI debe tener entre 5 y 20 letras o números.',
  })
  documentNumber: string;

  @Transform(trim)
  @IsString()
  @Matches(/^[0-9+()\s-]{6,30}$/, {
    message:
      'El teléfono solo puede contener números, espacios, +, - y paréntesis.',
  })
  phone: string;

  @IsOptional()
  @Transform(trim)
  @IsEmail({}, { message: 'El email no es válido.' })
  @MaxLength(150)
  email?: string;

  @IsOptional()
  @IsDateOnly()
  birthDate?: string;

  /** obligatorio: id de la obra social, o null = particular. Si falta
   * (undefined), ValidateIf deja correr IsInt y el pedido se rechaza. */
  @ValidateIf((_o, value) => value !== null)
  @IsInt({ message: 'Elegí la obra social (o "Particular").' })
  @IsPositive({ message: 'Elegí la obra social (o "Particular").' })
  healthInsuranceId: number | null;

  /** opcional; vacío = null. Si es particular se descarta (ver service). */
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() || null : value,
  )
  @IsString()
  @Matches(/^[A-Za-z0-9 ./-]{3,40}$/, {
    message:
      'El número de afiliado solo puede tener letras, números, espacios, puntos, barras y guiones (3 a 40).',
  })
  healthInsuranceNumber?: string | null;
}

export class CreatePatientDto extends PatientDataDto {}

export class UpdatePatientDto extends PartialType(PatientDataDto) {}
