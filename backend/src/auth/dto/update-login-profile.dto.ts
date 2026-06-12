import { IsEmail, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateLoginProfileDto {
  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5)
  language?: string;
}
