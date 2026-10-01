import { Transform } from 'class-transformer';
import { CallNameFormat } from '@/common/enums/call-name-format.enum';
import { Role } from '@/common/enums/role.enum';
import {
  ArrayUnique,
  IsArray,
  IsEnum,
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class UpdateSettingsDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: 'El nombre del consultorio no puede quedar vacío.' })
  @MaxLength(100)
  clinicName?: string;

  /** null = sin teléfono */
  @IsOptional()
  @ValidateIf((_o, value) => value !== null)
  @Transform(trim)
  @Matches(/^[0-9+()\s-]{6,30}$/, {
    message:
      'El teléfono solo puede contener números, espacios, +, - y paréntesis.',
  })
  contactPhone?: string | null;

  @IsOptional()
  @IsBoolean()
  publicBookingEnabled?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1, {
    message: 'Se tiene que poder reservar al menos 1 día hacia adelante.',
  })
  @Max(365, { message: 'Como máximo 365 días hacia adelante.' })
  bookingHorizonDays?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(168, { message: 'Como máximo 168 horas (7 días) de anticipación.' })
  publicCancelMinHours?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(72, { message: 'El recordatorio se puede mandar hasta 72 horas antes.' })
  reminderHoursBefore?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(20, { message: 'Como máximo 20 turnos pendientes por paciente.' })
  publicMaxPendingPerPatient?: number;

  @IsOptional()
  @IsBoolean()
  callsEnabled?: boolean;

  @IsOptional()
  @IsEnum(CallNameFormat, {
    message: 'El formato del nombre del llamado no es válido.',
  })
  callNameFormat?: CallNameFormat;

  @IsOptional()
  @IsInt()
  @Min(1, { message: 'La voz se repite al menos 1 vez.' })
  @Max(3, { message: 'La voz se repite como máximo 3 veces.' })
  callVoiceRepeats?: number;

  /** roles obligados a usar verificación en dos pasos ([] = ninguno) */
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsEnum(Role, { each: true, message: 'Rol inválido' })
  twoFactorRoles?: Role[];
}
