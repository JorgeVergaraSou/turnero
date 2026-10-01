import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsPositive,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import {
  IsDateOnly,
  IsTimeOfDay,
} from '@/common/decorators/date-time.decorators';
import {
  ALLOWED_SLOT_MINUTES,
  ScheduleExceptionType,
} from '../scheduling.enums';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

const SLOT_MESSAGE = `La duración del turno debe ser una de: ${ALLOWED_SLOT_MINUTES.join(', ')} minutos.`;

export class CreateScheduleDto {
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  professionalId: number;

  @Type(() => Number)
  @IsInt()
  @IsPositive()
  officeId: number;

  /** 1 = lunes … 7 = domingo */
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(7)
  weekday: number;

  @IsTimeOfDay()
  startTime: string;

  @IsTimeOfDay()
  endTime: string;

  @Type(() => Number)
  @IsIn(ALLOWED_SLOT_MINUTES, { message: SLOT_MESSAGE })
  slotMinutes: number;

  @IsDateOnly()
  validFrom: string;

  @IsOptional()
  @IsDateOnly()
  validUntil?: string;
}

/** Profesional y día no se cambian: para eso se crea otro horario. */
export class UpdateScheduleDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  officeId?: number;

  @IsOptional()
  @IsTimeOfDay()
  startTime?: string;

  @IsOptional()
  @IsTimeOfDay()
  endTime?: string;

  @IsOptional()
  @Type(() => Number)
  @IsIn(ALLOWED_SLOT_MINUTES, { message: SLOT_MESSAGE })
  slotMinutes?: number;

  @IsOptional()
  @IsDateOnly()
  validFrom?: string;

  /** null = sin fecha de fin */
  @IsOptional()
  @ValidateIf((_o, value) => value !== null)
  @IsDateOnly()
  validUntil?: string | null;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class CreateScheduleExceptionDto {
  /** omitido = aplica a todos los profesionales (ej. feriado) */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  professionalId?: number;

  @IsEnum(ScheduleExceptionType, { message: 'Tipo de excepción inválido' })
  type: ScheduleExceptionType;

  @IsDateOnly()
  startDate: string;

  @IsDateOnly()
  endDate: string;

  /** omitidos = días completos */
  @IsOptional()
  @IsTimeOfDay()
  startTime?: string;

  @IsOptional()
  @IsTimeOfDay()
  endTime?: string;

  /** solo HORARIO_ESPECIAL */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  officeId?: number;

  /** solo HORARIO_ESPECIAL */
  @IsOptional()
  @Type(() => Number)
  @IsIn(ALLOWED_SLOT_MINUTES, { message: SLOT_MESSAGE })
  slotMinutes?: number;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(255)
  reason?: string;
}

/** Una excepción no se edita: se desactiva y, si hace falta, se carga otra. */
export class UpdateScheduleExceptionDto {
  @IsBoolean()
  active: boolean;
}
