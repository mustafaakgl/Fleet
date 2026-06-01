import { IsDateString, IsEnum, IsNotEmpty, IsNumber, IsOptional, IsString } from 'class-validator';

const INCIDENT_TYPES = ['vehicle_accident', 'cargo_damage'] as const;
const INCIDENT_STATUSES = ['reported', 'under_review', 'resolved', 'rejected'] as const;

export class CreateAccidentDto {
  @IsEnum(INCIDENT_TYPES)
  type!: (typeof INCIDENT_TYPES)[number];

  @IsString()
  @IsNotEmpty()
  driverId!: string;

  @IsString()
  @IsNotEmpty()
  vehicleId!: string;

  @IsOptional()
  @IsString()
  companyId?: string;

  @IsOptional()
  @IsString()
  assignmentId?: string;

  @IsDateString()
  incidentDateTime!: string;

  @IsOptional()
  @IsString()
  location?: string;

  @IsString()
  @IsNotEmpty()
  description!: string;

  @IsOptional()
  @IsString()
  cargoName?: string;

  @IsOptional()
  @IsString()
  cargoOwner?: string;

  @IsOptional()
  @IsNumber()
  damageValue?: number;

  @IsOptional()
  @IsEnum(INCIDENT_STATUSES)
  status?: (typeof INCIDENT_STATUSES)[number];
}
