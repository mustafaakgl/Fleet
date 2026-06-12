import { IsString, MinLength } from 'class-validator';

export class StartFleetTripDto {
  @IsString()
  @MinLength(1)
  vehicleId!: string;
}
