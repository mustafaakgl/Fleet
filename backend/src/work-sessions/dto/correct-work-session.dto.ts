import { Type } from 'class-transformer';
import { IsDateString, IsOptional, IsString, MinLength } from 'class-validator';

export class CorrectWorkSessionDto {
  @IsDateString()
  ended_at!: string;

  @IsString()
  @MinLength(3)
  reason!: string;

  @IsOptional()
  @Type(() => String)
  @IsString()
  note?: string;
}