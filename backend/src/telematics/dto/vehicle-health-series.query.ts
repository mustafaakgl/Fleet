import { IsIn, IsOptional } from 'class-validator';

export class VehicleHealthSeriesQueryDto {
  @IsOptional()
  @IsIn(['24h', '7d'])
  window: '24h' | '7d' = '24h';
}
