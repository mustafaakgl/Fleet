import { IsNumber, Min } from 'class-validator';

export class OdometerCorrectionDto {
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  odometerKm!: number;
}
