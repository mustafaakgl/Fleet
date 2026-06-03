import { IsDateString, IsString, Matches, MinLength } from 'class-validator';

const TIME_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;

export class CreateDriverTransportRequestDto {
  @IsString()
  @MinLength(1)
  vehicleId!: string;

  @IsString()
  @MinLength(1)
  companyId!: string;

  @IsString()
  @MinLength(1)
  cargoName!: string;

  @IsString()
  @MinLength(1)
  cargoOwner!: string;

  @IsString()
  @MinLength(1)
  pickupAddress!: string;

  @IsString()
  @MinLength(1)
  deliveryAddress!: string;

  @IsDateString()
  requestedDate!: string;

  @IsString()
  @Matches(TIME_REGEX, { message: 'startTime must be HH:MM' })
  startTime!: string;

  @IsString()
  @Matches(TIME_REGEX, { message: 'endTime must be HH:MM' })
  endTime!: string;

  @IsString()
  notes?: string;
}
