import { IsOptional, IsString } from 'class-validator';

export class AcknowledgeFineDto {
  @IsOptional()
  @IsString()
  ack_metadata?: string;
}
