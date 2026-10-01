import { Type } from 'class-transformer';
import {
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsPositive,
  Max,
  Min,
} from 'class-validator';
import { IsDateOnly } from '@/common/decorators/date-time.decorators';
import { AuditAction, AuditResult } from '../audit.enums';

export const AUDIT_CATEGORIES = [
  'CLINICAL',
  'ACCESS',
  'ADMINISTRATIVE',
] as const;
export type AuditCategory = (typeof AUDIT_CATEGORIES)[number];

export class AuditQueryDto {
  @IsOptional()
  @IsDateOnly()
  from?: string;

  @IsOptional()
  @IsDateOnly()
  to?: string;

  @IsOptional()
  @IsIn(AUDIT_CATEGORIES)
  category?: AuditCategory;

  @IsOptional()
  @IsEnum(AuditAction)
  action?: AuditAction;

  @IsOptional()
  @IsEnum(AuditResult)
  result?: AuditResult;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  patientId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  actorUserId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 50;
}
