import { IsEmail, IsEnum, IsOptional, IsString, MinLength } from 'class-validator';
import { UserRole, UserStatus } from '@prisma/client';
import { IsStrongPassword } from '../../common/validators/is-strong-password.decorator';

export class CreateUserDto {
  @IsString()
  @MinLength(1)
  full_name!: string;

  @IsEmail()
  email!: string;

  @IsString()
  @IsStrongPassword()
  password!: string;

  @IsEnum(UserRole)
  role!: UserRole;

  @IsOptional()
  @IsEnum(UserStatus)
  status?: UserStatus;

  @IsOptional()
  @IsString()
  language?: string;
}
