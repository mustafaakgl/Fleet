import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CancelEquipmentIssuanceDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
