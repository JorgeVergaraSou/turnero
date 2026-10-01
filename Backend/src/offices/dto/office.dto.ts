import { PartialType } from '@nestjs/mapped-types';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class CreateOfficeDto {
  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: 'El nombre es obligatorio.' })
  @MaxLength(100)
  name: string;

  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: 'La dirección es obligatoria.' })
  @MaxLength(200)
  address: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(200)
  locationDetails?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(30)
  phone?: string;
}

export class UpdateOfficeDto extends PartialType(CreateOfficeDto) {
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
