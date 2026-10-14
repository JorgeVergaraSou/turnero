import { Transform, Type } from 'class-transformer';
import {
  Equals,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsPositive,
  IsString,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { RequesterType } from './history-export-request.entity';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

const isRepresentative = (o: CreateHistoryExportDto) =>
  o.requesterType === RequesterType.REPRESENTANTE;

export class CreateHistoryExportDto {
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  patientId: number;

  /** médico que va a emitir la copia (tiene que haber atendido al paciente) */
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  assignedProfessionalId: number;

  @IsEnum(RequesterType)
  requesterType: RequesterType;

  /** solo si pide un representante legal: su nombre, documento y vínculo */
  @ValidateIf(isRepresentative)
  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: 'Indicá el nombre de quien retira la copia.' })
  @MaxLength(120)
  requesterName?: string;

  @ValidateIf(isRepresentative)
  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: 'Indicá el documento de quien retira la copia.' })
  @MaxLength(20)
  requesterDocument?: string;

  @ValidateIf(isRepresentative)
  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: 'Indicá el vínculo con el paciente.' })
  @MaxLength(60)
  requesterRelationship?: string;

  /** recepción confirma que verificó el DNI de quien pide */
  @Equals(true, {
    message: 'Tenés que verificar el DNI de quien pide la copia.',
  })
  identityChecked: boolean;
}

export class CancelHistoryExportDto {
  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: 'Indicá el motivo de la cancelación.' })
  @MaxLength(255)
  reason: string;
}

export class ReassignHistoryExportDto {
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  professionalId: number;
}

export class IssueHistoryExportDto {
  /** el médico confirma que verificó la identidad de quien retira la copia */
  @Equals(true, {
    message: 'Tenés que confirmar la identidad de quien retira la copia.',
  })
  identityConfirmed: boolean;
}
