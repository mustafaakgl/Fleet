import { IsEmail, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { IsStrongPassword } from '../../common/validators/is-strong-password.decorator';

export class SetupTenantDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  fleet_name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  slug?: string;

  @IsOptional()
  @IsEmail()
  contact_email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  contact_phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  address?: string;

  @IsString()
  @MinLength(2)
  @MaxLength(120)
  admin_full_name!: string;

  @IsEmail()
  admin_email!: string;

  @IsStrongPassword()
  admin_password!: string;
}
