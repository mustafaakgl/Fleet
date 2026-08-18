import { Type } from 'class-transformer';
import {
  IsEnum,
  IsISO8601,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
} from 'class-validator';
import {
  FuelReconciliationReviewOutcome,
  FuelReconciliationReviewState,
  FuelReconciliationRiskLevel,
} from '@prisma/client';

export const MIN_RECONCILIATION_REVIEW_NOTE = 5;
export const MAX_RECONCILIATION_REVIEW_NOTE = 1000;

/** Mutabakat listesi filtreleri. */
export class ListFuelReconciliationsQueryDto {
  @IsOptional()
  @IsEnum(FuelReconciliationRiskLevel)
  riskLevel?: FuelReconciliationRiskLevel;

  @IsOptional()
  @IsEnum(FuelReconciliationReviewState)
  reviewState?: FuelReconciliationReviewState;

  @IsOptional()
  @IsString()
  @Length(1, 64)
  vehicleId?: string;

  @IsOptional()
  @IsISO8601()
  from?: string;

  @IsOptional()
  @IsISO8601()
  to?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;

  /**
   * Varsayilan `risk`: en agir kayit once. Tarihe gore siralamak, tek bir
   * `high_attention` kaydini gunluk gurultunun altinda birakabilirdi.
   */
  @IsOptional()
  @IsEnum(['risk', 'newest', 'oldest'] as unknown as object)
  sort?: 'risk' | 'newest' | 'oldest';
}

/**
 * Inceleme karari.
 *
 * NOT ZORUNLU: kararin gerekcesi kaydin kendisinde kalmali. "duplicate"
 * denip hicbir sey yazilmamis bir kayit, alti ay sonra hicbir seye
 * cevap veremez.
 */
export class ReviewFuelReconciliationDto {
  /** Optimistic concurrency — mevcut `updatedAt + updateMany` deseni. */
  @IsISO8601()
  expectedUpdatedAt!: string;

  @IsEnum(FuelReconciliationReviewOutcome)
  outcome!: FuelReconciliationReviewOutcome;

  @IsString()
  @Length(MIN_RECONCILIATION_REVIEW_NOTE, MAX_RECONCILIATION_REVIEW_NOTE)
  note!: string;
}
