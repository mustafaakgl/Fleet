export type StorageBucket =
  | 'documents'
  | 'vehicles'
  | 'license-photos'
  | 'defect-photos'
  | 'fine-documents'
  | 'message-attachments'
  | 'invoice-documents'
  | 'datev-exports'
  | 'payroll-exports'
  /**
   * Yakit fisleri. `documents`ten AYRI: fis bir mali belgedir ve kendi saklama
   * suresine tabidir; genel belge klasorune karistirmak, bir DSGVO silme
   * talebinde neyin silinecegini belirsiz birakirdi.
   */
  | 'fuel-receipts';

export abstract class StorageService {
  /** Internal storage path persisted in the database (not publicly served). */
  abstract buildStoredPath(bucket: StorageBucket, storedFileName: string): string;

  abstract buildDocumentDownloadPath(documentId: string): string;

  abstract buildVehiclePhotoDownloadPath(vehicleId: string): string;

  abstract buildMessengerAttachmentDownloadPath(attachmentId: string): string;
}
