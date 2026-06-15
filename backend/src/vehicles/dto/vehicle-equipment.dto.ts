import { IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class CreateVehicleEquipmentDto {
  @IsString()
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  quantity?: number;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  serialNumber?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

export class UpdateVehicleEquipmentDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  quantity?: number;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  serialNumber?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;

  @IsOptional()
  @IsString()
  status?: 'active' | 'retired';

  @IsOptional()
  @IsString()
  photoDocumentId?: string | null;
}
