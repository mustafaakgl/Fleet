import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

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
}
