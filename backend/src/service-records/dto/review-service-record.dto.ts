import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

/** Ret nedeni icin en kisa anlamli metin — "x" bir neden degildir. */
export const MIN_SERVICE_REJECTION_REASON = 10;

export class ReviewServiceRecordDto {
  @IsIn(['approve', 'reject'])
  decision!: 'approve' | 'reject';

  /**
   * Ret icin ZORUNLU, onay icin opsiyonel.
   *
   * Zorunlulugu servis katmani uyguluyor: `decision`e bagli bir kural
   * dekorator ile ifade edilemiyor ve iki yerde yazilirsa biri unutulur.
   */
  @IsOptional()
  @IsString()
  @MinLength(MIN_SERVICE_REJECTION_REASON)
  @MaxLength(1000)
  reason?: string;

  /** Muhasebenin opsiyonel notu. HTML olarak RENDER EDILMEZ. */
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}
