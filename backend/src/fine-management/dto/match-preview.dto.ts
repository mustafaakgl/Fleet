import { IsDateString, IsInt, IsOptional, IsString, Min, MinLength } from 'class-validator';

export class FineMatchPreviewDto {
  @IsString()
  @MinLength(1)
  vehicle_id!: string;

  @IsDateString()
  violation_at!: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  tolerance_minutes?: number;
}
