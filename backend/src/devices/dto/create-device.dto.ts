import { DeviceModel } from '@prisma/client';
import { IsEnum, IsOptional, IsString, Length, Matches } from 'class-validator';

export class CreateDeviceDto {
  @IsString()
  @Length(8, 32)
  @Matches(/^[0-9A-Za-z_-]+$/)
  imei!: string;

  @IsEnum(DeviceModel)
  model!: DeviceModel;

  @IsOptional()
  @IsString()
  vehicleId?: string;
}
