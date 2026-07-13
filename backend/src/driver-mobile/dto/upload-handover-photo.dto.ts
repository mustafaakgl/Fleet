import { Type } from 'class-transformer';
import { IsISO8601, IsNumber, IsOptional, IsString, IsUUID } from 'class-validator';

export class UploadHandoverPhotoDto {
  @IsISO8601()
  taken_at!: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  gps_lat?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  gps_lng?: number;

  @IsOptional()
  @IsString()
  device_info?: string;

  @IsOptional()
  @IsUUID()
  client_request_id?: string;
}
