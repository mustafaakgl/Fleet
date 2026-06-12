import { IsDateString, IsOptional } from 'class-validator';

export class DriverScoreQueryDto {
  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;
}
