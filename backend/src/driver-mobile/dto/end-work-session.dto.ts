import { IsIn, IsOptional } from 'class-validator';

export const WORK_SESSION_END_REASONS = ['manual', 'app_background', 'logout'] as const;
export type WorkSessionEndReasonInput = (typeof WORK_SESSION_END_REASONS)[number];

export class EndWorkSessionDto {
  @IsOptional()
  @IsIn(WORK_SESSION_END_REASONS)
  reason?: WorkSessionEndReasonInput;
}
