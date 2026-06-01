import { IsDateString, IsOptional, IsString, Matches, MinLength } from 'class-validator';

const TIME_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;

export class UpdateAssignmentDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  cargo_name?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  cargo_owner?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  pickup_address?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  delivery_address?: string;

  @IsOptional()
  @IsDateString()
  work_date?: string;

  @IsOptional()
  @IsString()
  @Matches(TIME_REGEX, { message: 'start_time must be HH:MM (24h)' })
  start_time?: string;

  @IsOptional()
  @IsString()
  @Matches(TIME_REGEX, { message: 'end_time must be HH:MM (24h)' })
  end_time?: string;

  @IsOptional()
  @IsString()
  route_name?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
