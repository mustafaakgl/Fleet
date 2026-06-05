import { IsEmail, IsEnum, IsOptional, IsString, MinLength, ValidateIf } from 'class-validator';
import { UserRole, UserStatus } from '@prisma/client';
import { IsStrongPassword } from '../../common/validators/is-strong-password.decorator';

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  full_name?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @ValidateIf((_, value) => value !== undefined && value !== '')
  @IsString()
  @IsStrongPassword()
  password?: string;

  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;

  @IsOptional()
  @IsEnum(UserStatus)
  status?: UserStatus;

  @IsOptional()
  @IsString()
  language?: string;
}
