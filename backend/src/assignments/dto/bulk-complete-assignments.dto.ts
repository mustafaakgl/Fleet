import { ArrayMaxSize, ArrayNotEmpty, IsArray, IsString } from 'class-validator';

export const BULK_COMPLETE_MAX_ASSIGNMENTS = 200;

export class BulkCompleteAssignmentsDto {
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(BULK_COMPLETE_MAX_ASSIGNMENTS)
  @IsString({ each: true })
  assignment_ids!: string[];
}
