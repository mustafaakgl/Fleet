import { IsIn, IsISO8601, IsOptional } from 'class-validator';

export class DriverScoresQueryDto {
  @IsOptional()
  @IsISO8601()
  from?: string;

  @IsOptional()
  @IsISO8601()
  to?: string;

  @IsOptional()
  @IsIn(['all', 'device', 'phone'])
  source?: 'all' | 'device' | 'phone';
}

export class DriverTripsQueryDto {
  @IsOptional()
  @IsISO8601()
  from?: string;

  @IsOptional()
  @IsISO8601()
  to?: string;

  @IsOptional()
  @IsIn(['all', 'device', 'phone'])
  source?: 'all' | 'device' | 'phone';
}
