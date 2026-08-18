import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsEnum,
  IsNumber,
  IsISO8601,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import {
  ApprovalDecision,
  AutomationCorrectionCategory,
  AutomationProposalStatus,
  AutomationRejectionCategory,
} from '@prisma/client';

export class CreateEnrollmentDto {
  @IsString()
  @Length(1, 80)
  displayName!: string;

  /**
   * Istenen yetenekler. Sunucu bunlari REGISTRY ile suzer: taninmayan bir
   * yetenek sessizce dusurulur, uydurulmus bir yetkiye donusmez.
   */
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  capabilities!: string[];
}

export class ConnectorEnrollDto {
  @IsString()
  @Length(10, 200)
  enrollmentCode!: string;

  @IsOptional()
  @IsString()
  @Length(1, 60)
  connectorVersion?: string;

  @IsOptional()
  @IsString()
  @Length(1, 20)
  protocolVersion?: string;

  @IsOptional()
  @IsString()
  @Length(1, 60)
  platform?: string;

  @IsOptional()
  @IsString()
  @Length(1, 30)
  architecture?: string;
}

export class ConnectorHeartbeatDto {
  @IsOptional()
  @IsString()
  @Length(1, 60)
  connectorVersion?: string;

  @IsOptional()
  @IsString()
  @Length(1, 20)
  protocolVersion?: string;

  @IsOptional()
  @IsString()
  @Length(1, 60)
  platform?: string;

  @IsOptional()
  @IsString()
  @Length(1, 30)
  architecture?: string;
}

export class LeaseTokenDto {
  @IsString()
  @Length(8, 100)
  leaseToken!: string;
}

/** Uc durumlu kontrol sonucu — `unknown` icin gerekce serviste ZORUNLU. */
export class AutomationCheckDto {
  @IsString()
  @Length(1, 80)
  code!: string;

  @IsEnum(['verified', 'failed', 'unknown'] as unknown as object)
  status!: 'verified' | 'failed' | 'unknown';

  @IsString()
  @Length(1, 160)
  messageKey!: string;

  @IsOptional()
  @IsObject()
  messageParams?: Record<string, string | number>;

  @IsOptional()
  @IsObject()
  evidence?: Record<string, string | number | boolean | null>;

  @IsOptional()
  @IsISO8601()
  dataAt?: string;

  @IsOptional()
  @IsString()
  @Length(1, 120)
  unknownReason?: string;
}

export class CompleteJobDto {
  @IsString()
  @Length(8, 100)
  leaseToken!: string;

  /** Whitelist disi bir tur serviste REDDEDILIR. */
  @IsString()
  @Length(1, 80)
  proposalType!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  proposalSchemaVersion?: number;

  /** Govde runtime sema dogrulamasindan gecer; fazla alan reddedilir. */
  @IsObject()
  payload!: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  confidence?: Record<string, number>;

  @IsOptional()
  @IsObject()
  evidence?: Record<string, unknown>;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AutomationCheckDto)
  checks?: AutomationCheckDto[];

  @IsOptional()
  @IsString()
  @Length(1, 80)
  modelVersion?: string;

  @IsOptional()
  @IsString()
  @Length(1, 80)
  promptVersion?: string;
}

export class FailJobDto {
  @IsString()
  @Length(8, 100)
  leaseToken!: string;

  /** Teknik hata SINIFI — saglayici mesaji degil. */
  @IsString()
  @Length(1, 80)
  failureClass!: string;
}

export class CreateAutomationJobDto {
  @IsString()
  @Length(1, 80)
  jobType!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  schemaVersion?: number;

  @IsObject()
  payload!: Record<string, unknown>;
}

export class ListProposalsQueryDto {
  @IsOptional()
  @IsEnum(AutomationProposalStatus)
  status?: AutomationProposalStatus;

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
}

export class CorrectionEventDto {
  @IsString()
  @Length(1, 120)
  fieldName!: string;

  @IsString()
  @Length(1, 60)
  fieldType!: string;

  /**
   * `@IsBoolean()` SART: global dogrulama whitelist modunda calisiyor ve
   * dekoratoru olmayan alan "tanimsiz ozellik" sayilip istegi dusuruyor.
   * Bu, E2E'nin yakaladigi gercek bir hataydi.
   */
  @IsBoolean()
  changed!: boolean;

  @IsEnum(AutomationCorrectionCategory)
  category!: AutomationCorrectionCategory;

  @IsOptional()
  @IsBoolean()
  criticalLowConfidence?: boolean;

  @IsOptional()
  @IsBoolean()
  verifiedByReviewer?: boolean;
}

/**
 * Servis faturasi onayinda INSANIN onayladigi degerler (Faz 13).
 *
 * Ajanin urettigi taslak degil, kullanicinin ekranda gordugu ve kabul ettigi
 * degerler kaydediliyor. `costBasis` ZORUNLU: `ServiceRecord.costAmount`in net
 * mi brut mu oldugu repoda acik olmadigi icin karar sessizce verilmiyor.
 */
export class ServiceInvoiceFinalizationDto {
  @IsString()
  @Length(1, 64)
  vehicleId!: string;

  @IsEnum(['net', 'gross'] as unknown as object)
  costBasis!: 'net' | 'gross';

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(1_000_000)
  costAmount!: number;

  /** EUR VARSAYILMIYOR — zorunlu. */
  @IsString()
  @Length(3, 3)
  currency!: string;

  @IsISO8601()
  serviceDate!: string;

  @IsString()
  @Length(1, 200)
  repairCompany!: string;

  @IsString()
  @Length(1, 120)
  serviceType!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(3_000_000)
  mileageKm?: number;

  @IsOptional()
  @IsString()
  @Length(1, 1000)
  notes?: string;
}

/**
 * Karar.
 *
 * ACIKLAMA KOSULLU ZORUNLU (bkz. core/review-policy): rutin onayda opsiyonel,
 * redde / kritik dusuk guvenli alan degistirilmeden onaylandiginda / politika
 * gerektirdiginde zorunlu. Zorunluluk SERVISTE karara gore uygulaniyor; DTO
 * burada yalnizca bicimi sinirliyor.
 */
export class DecideProposalDto {
  @IsISO8601()
  expectedUpdatedAt!: string;

  @IsEnum(ApprovalDecision)
  decision!: ApprovalDecision;

  @IsOptional()
  @IsString()
  @Length(1, 1000)
  note?: string;

  /** Redde ZORUNLU (serviste dogrulaniyor); `other` ayrica aciklama ister. */
  @IsOptional()
  @IsEnum(AutomationRejectionCategory)
  rejectionCategory?: AutomationRejectionCategory;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CorrectionEventDto)
  corrections?: CorrectionEventDto[];

  /** Servis faturasi onayinda ZORUNLU (serviste dogrulaniyor). */
  @IsOptional()
  @ValidateNested()
  @Type(() => ServiceInvoiceFinalizationDto)
  serviceInvoice?: ServiceInvoiceFinalizationDto;
}
