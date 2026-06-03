/** Document types a driver may upload from the mobile app. */
export const DRIVER_UPLOAD_DOCUMENT_TYPES = [
  'Driving License',
  'Passport',
  'ADR Certificate',
  'Medical Certificate',
  'Work Permit',
  'Other',
] as const;

export type DriverUploadDocumentType = (typeof DRIVER_UPLOAD_DOCUMENT_TYPES)[number];

/** Required for compliance checks in the office documents module. */
export const DRIVER_REQUIRED_DOCUMENT_TYPES = ['Driving License', 'Passport'] as const;

export function isDriverUploadDocumentType(value: string): value is DriverUploadDocumentType {
  return (DRIVER_UPLOAD_DOCUMENT_TYPES as readonly string[]).includes(value);
}
