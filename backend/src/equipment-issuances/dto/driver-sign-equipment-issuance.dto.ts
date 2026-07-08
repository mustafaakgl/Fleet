import { IsNotEmpty, IsString } from 'class-validator';

export class DriverSignEquipmentIssuanceDto {
  @IsString()
  @IsNotEmpty()
  signatureDataUrl!: string;
}
