import { PartialType } from '@nestjs/mapped-types';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsPositive,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

class LicenseAndSpecialtiesDto {
  @Transform(trim)
  @MinLength(2, { message: 'La matrícula debe tener al menos 2 caracteres.' })
  @MaxLength(50)
  @Matches(/^[A-Za-z0-9 .\-/]+$/, {
    message:
      'La matrícula solo puede contener letras, números, espacios, puntos, guiones y barras.',
  })
  licenseNumber: string;

  @IsArray()
  @ArrayMinSize(1, { message: 'Debe asignar al menos una especialidad.' })
  @ArrayUnique()
  @Type(() => Number)
  @IsInt({ each: true })
  @IsPositive({ each: true })
  specialtyIds: number[];
}

export class CreateProfessionalDto extends LicenseAndSpecialtiesDto {
  /** usuario existente con rol MEDICO (se da de alta antes por /auth/nuevo-usuario) */
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  userId: number;
}

export class UpdateProfessionalDto extends PartialType(
  LicenseAndSpecialtiesDto,
) {
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
