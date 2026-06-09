import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateVehicleReminderDto {
  @IsString()
  vehicleId!: string;

  @IsIn(['emission_test', 'registration', 'insurance', 'inspection'])
  renewalKind!: 'emission_test' | 'registration' | 'insurance' | 'inspection';

  @IsString()
  dueDate!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(365)
  dueSoonThreshold!: number;

  @IsIn(['weeks', 'days'])
  dueSoonThresholdUnit!: 'weeks' | 'days';

  @IsBoolean()
  notifications!: boolean;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  watchers?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  comment?: string;
}
