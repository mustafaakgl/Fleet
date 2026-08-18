import { IsBoolean, IsDateString, IsNumber, IsOptional, IsString, Matches, Min, MinLength } from 'class-validator';

// Empty string is allowed and means "all-day assignment" (no fixed times).
const TIME_REGEX = /^(([01]\d|2[0-3]):[0-5]\d)?$/;

export class CreateAssignmentDto {
  @IsString()
  @MinLength(1)
  driver_id!: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  vehicle_id?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  vehicle_plate?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  company_id?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  company_name?: string;

  @IsString()
  @MinLength(1)
  cargo_name!: string;

  @IsString()
  @MinLength(1)
  cargo_owner!: string;

  @IsString()
  @MinLength(1)
  pickup_address!: string;

  @IsString()
  @MinLength(1)
  delivery_address!: string;

  /**
   * Kullanici adresi oneri listesinden sectiyse dogrulanmis Location kimligi.
   * Doluysa sunucu adresi yeniden aramaz — kesin koordinat zaten kayitli.
   * Bos ise (elle yazma, ice aktarma) eski cozumleme yolu isler.
   */
  /**
   * Gelirin para birimi — YALNIZCA siparis yolundan doluyor.
   *
   * Bos ise kiracinin `baseCurrency`si kullanilir. Istemcinin serbestce
   * gonderdigi bir deger DEGIL: `transport-orders` controller'i siparisin
   * o andaki para birimini geciyor ve finansal rol kontrolu orada yapiliyor.
   */
  @IsOptional()
  @IsString()
  @Matches(/^[A-Z]{3}$/)
  currency?: string;

  @IsOptional()
  @IsString()
  pickup_location_id?: string;

  @IsOptional()
  @IsString()
  delivery_location_id?: string;

  @IsDateString()
  work_date!: string;

  @IsOptional()
  @IsString()
  @Matches(TIME_REGEX, { message: 'start_time must be HH:MM (24h)' })
  start_time?: string;

  @IsOptional()
  @IsString()
  @Matches(TIME_REGEX, { message: 'end_time must be HH:MM (24h)' })
  end_time?: string;

  @IsOptional()
  @IsString()
  route_name?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  expected_daily_revenue?: number;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsBoolean()
  acknowledge_license_compliance_warning?: boolean;

  @IsOptional()
  @IsBoolean()
  acknowledge_vehicle_defect_warning?: boolean;
}
