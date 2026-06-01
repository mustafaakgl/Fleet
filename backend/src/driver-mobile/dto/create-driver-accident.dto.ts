import { IsDateString, IsEnum, IsOptional, IsString } from 'class-validator';

const INCIDENT_TYPES = ['vehicle_accident', 'cargo_damage'] as const;

export class CreateDriverAccidentDto {
  @IsEnum(INCIDENT_TYPES)
  type!: (typeof INCIDENT_TYPES)[number];

  @IsDateString()
  incidentDateTime!: string;

  @IsString()
  description!: string;

  @IsOptional()
  @IsString()
  assignmentId?: string;

  @IsOptional()
  @IsString()
  vehicleId?: string;

  @IsOptional()
  @IsString()
  companyId?: string;

  @IsOptional()
  @IsString()
  location?: string;

  @IsOptional()
  @IsString()
  cargoName?: string;

  @IsOptional()
  @IsString()
  cargoOwner?: string;
}
