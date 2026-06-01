import { IsDateString, IsOptional, IsString, Matches, MinLength } from 'class-validator';

const TIME_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;

export class CreateTransportRequestDto {
  @IsString()
  @MinLength(1)
  driver_id!: string;

  @IsString()
  @MinLength(1)
  vehicle_id!: string;

  @IsString()
  @MinLength(1)
  company_id!: string;

  @IsString()
  @MinLength(1)
  cargo_name!: string;

  @IsString()
  @MinLength(1)
  cargo_owner!: string;

  @IsString()
  @MinLength(1)
  pickup_address!: string;

  @IsString()
  @MinLength(1)
  delivery_address!: string;

  @IsDateString()
  requested_date!: string;

  @IsString()
  @Matches(TIME_REGEX, { message: 'start_time must be HH:MM' })
  start_time!: string;

  @IsString()
  @Matches(TIME_REGEX, { message: 'end_time must be HH:MM' })
  end_time!: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
