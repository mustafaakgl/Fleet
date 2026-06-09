import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

const DEPARTMENTS = ['dispatch', 'hr', 'accounting', 'maintenance', 'general'] as const;

export class ListConversationsQueryDto {
  @IsOptional()
  @IsString()
  driverId?: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string;

  @IsOptional()
  @IsString()
  @IsIn(DEPARTMENTS)
  department?: string;

  @IsOptional()
  @IsString()
  limit?: string;
}
