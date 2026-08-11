import { IsBoolean, IsOptional } from 'class-validator';

export class SendCompanyEmailDto {
  /**
   * Zaten gonderilmis bir postayi bilerek tekrar gonderir.
   *
   * Varsayilan kapali: musteriye ayni bildirimin iki kez gitmesi geri alinamaz,
   * bu yuzden tekrar acik bir istek olmali. Cron ve toplu gonderim bunu vermez.
   */
  @IsOptional()
  @IsBoolean()
  allowResend?: boolean;
}
