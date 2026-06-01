import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateConversationDto {
  @IsString()
  driverId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  subject?: string;
}
