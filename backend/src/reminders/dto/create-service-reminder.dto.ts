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

export class CreateServiceReminderDto {
  @IsString()
  vehicleId!: string;

  @IsString()
  @MaxLength(120)
  serviceTask!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(120)
  timeInterval!: number;

  @IsIn(['months', 'weeks'])
  timeIntervalUnit!: 'months' | 'weeks';

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(52)
  timeDueSoonThreshold!: number;

  @IsIn(['months', 'weeks'])
  timeDueSoonThresholdUnit!: 'months' | 'weeks';

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(500_000)
  meterIntervalKm!: number;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100_000)
  meterDueSoonThresholdKm!: number;

  @IsBoolean()
  manualOverride!: boolean;

  @IsOptional()
  @IsString()
  nextDueDate?: string;

  @IsBoolean()
  notifications!: boolean;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  watchers?: string[];
}
