declare module 'react-native-document-scanner-plugin' {
  export enum ScanDocumentResponseStatus {
    Success = 'success',
    Cancel = 'cancel',
  }

  export enum ResponseType {
    Base64 = 'base64',
    ImageFilePath = 'imageFilePath',
  }

  export type ScanDocumentOptions = {
    croppedImageQuality?: number;
    maxNumDocuments?: number;
    responseType?: ResponseType;
  };

  export type ScanDocumentResponse = {
    scannedImages?: string[];
    status?: ScanDocumentResponseStatus;
  };

  export default class DocumentScanner {
    static scanDocument(options?: ScanDocumentOptions): Promise<ScanDocumentResponse>;
  }
}
