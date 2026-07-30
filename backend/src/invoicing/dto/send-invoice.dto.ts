import { IsBoolean, IsIn, IsOptional } from 'class-validator';

export class SendInvoiceDto {
  /**
   * Overrides the attachment default. Left unset, the XML rides along exactly when the
   * customer's e-invoicing preference makes it the legally original document (XRechnung);
   * for ZUGFeRD the CII is already embedded inside the PDF.
   */
  @IsOptional() @IsBoolean() includeXml?: boolean;

  /** Preferred cover-letter language for customer delivery mail. Defaults to German. */
  @IsOptional() @IsIn(['de', 'en', 'tr']) language?: 'de' | 'en' | 'tr';
}
