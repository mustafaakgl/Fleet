import { IsIn } from 'class-validator';

export class VehicleHealthSeriesQueryDto {
  @IsIn(['24h', '7d'])
  window!: '24h' | '7d';
}
