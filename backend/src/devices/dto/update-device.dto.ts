import { DeviceModel } from '@prisma/client';
import { IsEnum, IsOptional, IsString, ValidateIf } from 'class-validator';

export class UpdateDeviceDto {
  @IsOptional()
  @IsEnum(DeviceModel)
  model?: DeviceModel;

  @ValidateIf((_, value) => value !== undefined && value !== null)
  @IsString()
  vehicleId?: string | null;
}
