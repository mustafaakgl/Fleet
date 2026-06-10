import { IsBoolean, IsInt, IsOptional, IsString, Min, MinLength } from 'class-validator';

export class ChecklistTemplateItemDto {
  @IsOptional()
  @IsString()
  id?: string;

  @IsString()
  @MinLength(1)
  item_key!: string;

  @IsString()
  @MinLength(1)
  label!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsInt()
  @Min(0)
  sort_order!: number;

  @IsOptional()
  @IsBoolean()
  requires_photo_on_defect?: boolean;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}
