import { IsBoolean, IsEnum, IsOptional, IsString, MinLength, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { VehicleCategory } from '@prisma/client';
import { ChecklistTemplateItemDto } from './checklist-template-item.dto';

export class UpdateChecklistTemplateDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsEnum(VehicleCategory)
  vehicle_category?: VehicleCategory;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsBoolean()
  is_default?: boolean;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;

  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => ChecklistTemplateItemDto)
  items?: ChecklistTemplateItemDto[];
}
