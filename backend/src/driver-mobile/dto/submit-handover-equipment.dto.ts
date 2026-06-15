import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class HandoverInventoryCheckItemDto {
  @IsString()
  equipmentId!: string;

  @IsInt()
  @Min(0)
  quantityPresent!: number;
}

export class SubmitHandoverEquipmentChecklistDto {
  @IsBoolean()
  firstAidKit!: boolean;

  @IsBoolean()
  fireExtinguisher!: boolean;

  @IsBoolean()
  straps!: boolean;

  @IsBoolean()
  safetyVest!: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;

  @IsOptional()
  @IsBoolean()
  damageDetected?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  damageNotes?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => HandoverInventoryCheckItemDto)
  inventoryChecks?: HandoverInventoryCheckItemDto[];
}
