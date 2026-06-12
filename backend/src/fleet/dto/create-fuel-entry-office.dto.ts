import { IsOptional, IsString, MinLength } from 'class-validator';
import { CreateFuelEntryDto } from './create-fuel-entry.dto';

export class CreateFuelEntryOfficeDto extends CreateFuelEntryDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  driverId?: string;
}
