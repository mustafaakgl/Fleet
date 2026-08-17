export type DriverNotifyKey =
  | 'request_approved'
  | 'request_rejected'
  | 'assignment_created'
  | 'checkin_added_to_einsatzplan'
  | 'messenger_message'
  | 'transport_approved'
  | 'transport_rejected'
  | 'license_check_due'
  | 'license_check_reminder'
  | 'license_check_approved'
  | 'license_check_rejected'
  | 'license_expiry_soon'
  | 'departure_check_reminder'
  | 'defect_confirm_due'
  | 'fine_assigned'
  | 'equipment_issuance_created'
  | 'equipment_issuance_reminder'
  | 'equipment_issuance_approved'
  | 'work_session_corrected'
  | 'tacho_infringement'
  | 'tacho_infringement_ack_reminder'
  | 'tacho_download_due'
  /**
   * Yakit fisi inceleme sonucu (Faz 7).
   *
   * Bildirim YALNIZCA ilgili surucuye gidiyor; muhasebedeki her kullaniciya
   * haber vermek gurultu olurdu, kuyrugu zaten ekranda goruyorlar.
   */
  | 'fuel_receipt_approved'
  | 'fuel_receipt_rejected'
  /**
   * Onaylanmis fis muhasebe tarafindan geri alindi (Faz 9).
   *
   * Metin bilincli olarak GENEL: sebep kodu ve muhasebe aciklamasi
   * gonderilmiyor. O metin ic degerlendirme icerebilir ve surucunun bir
   * hatasi olmayabilir — burada surucudan istenen bir sey yok, yalnizca
   * bilgi veriliyor.
   */
  | 'fuel_receipt_reversed';
