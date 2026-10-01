import { Transform, Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsPositive,
  IsString,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import {
  IsDateOnly,
  IsTimeOfDay,
} from '@/common/decorators/date-time.decorators';
import {
  PatientDataDto,
  normalizeDocumentNumber,
} from '@/patients/dto/patient.dto';
import {
  APPOINTMENT_CODE_PATTERN,
  normalizeAppointmentCode,
} from '../appointment-code.util';
import { AppointmentStatus } from '../appointment-status';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

class SlotSelectionDto {
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  professionalId: number;

  @Type(() => Number)
  @IsInt()
  @IsPositive()
  specialtyId: number;

  @IsDateOnly()
  date: string;

  @IsTimeOfDay()
  startTime: string;
}

/** Reserva pública (paciente sin cuenta). */
export class CreatePublicAppointmentDto extends SlotSelectionDto {
  // @ValidateNested solo valida si el objeto VIENE: sin @IsObject, un
  // pedido sin "patient" pasaba la validación y fallaba adentro con un 500
  @IsObject({ message: 'Faltan los datos del paciente.' })
  @ValidateNested()
  @Type(() => PatientDataDto)
  patient: PatientDataDto;
}

/** Reserva desde recepción, para un paciente ya cargado. */
export class CreateAdminAppointmentDto extends SlotSelectionDto {
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  patientId: number;
}

/** Consulta/cancelación pública: siempre código + DNI juntos. */
export class PublicAppointmentAccessDto {
  @Transform(({ value }) =>
    typeof value === 'string' ? normalizeAppointmentCode(value) : value,
  )
  @IsString()
  @Matches(APPOINTMENT_CODE_PATTERN, { message: 'Código de turno inválido.' })
  code: string;

  @Transform(({ value }) => normalizeDocumentNumber(value))
  @IsString()
  @Matches(/^[A-Z0-9]{5,20}$/, { message: 'DNI inválido.' })
  documentNumber: string;
}

export class CancelAppointmentDto {
  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: 'Indique el motivo de la cancelación.' })
  @MaxLength(255)
  reason: string;
}

export class RescheduleAppointmentDto {
  @IsDateOnly()
  date: string;

  @IsTimeOfDay()
  startTime: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(255)
  reason?: string;
}

export class ListAppointmentsQueryDto {
  @IsOptional()
  @IsDateOnly()
  from?: string;

  @IsOptional()
  @IsDateOnly()
  to?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  professionalId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  patientId?: number;

  @IsOptional()
  @IsEnum(AppointmentStatus)
  status?: AppointmentStatus;
}
