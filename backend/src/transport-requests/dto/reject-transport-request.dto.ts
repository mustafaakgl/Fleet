import { IsOptional, IsString } from 'class-validator';

export class RejectTransportRequestDto {
  @IsOptional()
  @IsString()
  reason?: string;
}
