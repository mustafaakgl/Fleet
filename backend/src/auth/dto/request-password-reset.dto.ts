import { IsString, MinLength } from 'class-validator';

export class RequestPasswordResetDto {
  @IsString()
  @MinLength(1)
  user_id!: string;
}
