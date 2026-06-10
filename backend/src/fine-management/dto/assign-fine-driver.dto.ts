import { IsOptional, IsString, MinLength } from 'class-validator';

export class AssignFineDriverDto {
  @IsString()
  @MinLength(1)
  driver_id!: string;

  @IsOptional()
  @IsString()
  matched_work_session_id?: string;

  @IsOptional()
  @IsString()
  matched_assignment_id?: string;

  @IsOptional()
  @IsString()
  note?: string;
}
