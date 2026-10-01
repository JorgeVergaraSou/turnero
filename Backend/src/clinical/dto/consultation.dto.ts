import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { DiagnosisType, StudyRequestType } from '../clinical.enums';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

/** Textos clínicos largos: tope generoso pero acotado. */
const LONG_TEXT = 20000;

/** null explícito = borrar el valor del borrador */
const nullable = ValidateIf((_o, value) => value !== null);

export class DiagnosisDto {
  @IsEnum(DiagnosisType)
  type: DiagnosisType;

  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: 'La descripción del diagnóstico es obligatoria.' })
  @MaxLength(500)
  description: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(20)
  codeSystem?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(20)
  code?: string;
}

export class MedicationDto {
  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: 'El medicamento es obligatorio.' })
  @MaxLength(200)
  drugName: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(100)
  dose?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(100)
  frequency?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(100)
  duration?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(500)
  notes?: string;
}

export class StudyRequestDto {
  @IsEnum(StudyRequestType)
  type: StudyRequestType;

  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: 'La descripción del estudio es obligatoria.' })
  @MaxLength(500)
  description: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(500)
  notes?: string;
}

/**
 * Guardado de borrador. Todo opcional: solo se tocan los campos enviados.
 * Las listas (diagnósticos, medicación, estudios), si se envían,
 * REEMPLAZAN a las del borrador (el formulario siempre manda la lista
 * completa que ve el médico).
 */
export class UpdateConsultationDto {
  @IsOptional()
  @nullable
  @Transform(trim)
  @IsString()
  @MaxLength(LONG_TEXT)
  reason?: string | null;

  @IsOptional()
  @nullable
  @Transform(trim)
  @IsString()
  @MaxLength(LONG_TEXT)
  anamnesis?: string | null;

  @IsOptional()
  @nullable
  @Transform(trim)
  @IsString()
  @MaxLength(LONG_TEXT)
  physicalExam?: string | null;

  @IsOptional()
  @nullable
  @Transform(trim)
  @IsString()
  @MaxLength(LONG_TEXT)
  evolution?: string | null;

  @IsOptional()
  @nullable
  @Transform(trim)
  @IsString()
  @MaxLength(LONG_TEXT)
  indications?: string | null;

  @IsOptional()
  @nullable
  @Transform(trim)
  @IsString()
  @MaxLength(LONG_TEXT)
  observations?: string | null;

  // --- signos vitales: rangos fisiológicamente plausibles ---
  @IsOptional()
  @nullable
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.2)
  @Max(500)
  weightKg?: number | null;

  @IsOptional()
  @nullable
  @IsNumber({ maxDecimalPlaces: 1 })
  @Min(20)
  @Max(260)
  heightCm?: number | null;

  @IsOptional()
  @nullable
  @IsInt()
  @Min(40)
  @Max(300)
  systolicBp?: number | null;

  @IsOptional()
  @nullable
  @IsInt()
  @Min(20)
  @Max(200)
  diastolicBp?: number | null;

  @IsOptional()
  @nullable
  @IsInt()
  @Min(20)
  @Max(300)
  heartRate?: number | null;

  @IsOptional()
  @nullable
  @IsNumber({ maxDecimalPlaces: 1 })
  @Min(30)
  @Max(45)
  temperatureC?: number | null;

  @IsOptional()
  @nullable
  @IsInt()
  @Min(50)
  @Max(100)
  oxygenSaturation?: number | null;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => DiagnosisDto)
  diagnoses?: DiagnosisDto[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => MedicationDto)
  medications?: MedicationDto[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => StudyRequestDto)
  studyRequests?: StudyRequestDto[];
}

export class CreateAmendmentDto {
  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: 'El contenido de la enmienda es obligatorio.' })
  @MaxLength(LONG_TEXT)
  content: string;

  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: 'Indique el motivo de la enmienda.' })
  @MaxLength(500)
  reason: string;
}
