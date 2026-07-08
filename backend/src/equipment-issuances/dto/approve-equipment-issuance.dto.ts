import { IsOptional, IsString, MaxLength } from 'class-validator';

export class ApproveEquipmentIssuanceDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
