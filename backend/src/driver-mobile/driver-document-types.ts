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

/** Uploaded by HR/office — drivers view on mobile, not self-upload. */
export const DRIVER_OFFICE_DOCUMENT_TYPES = ['Contract', 'Salary Document'] as const;

/** Required before the driver can use the app (self-upload). */
export const DRIVER_SELF_UPLOAD_REQUIRED_TYPES = ['Driving License', 'Passport'] as const;

/** Required for compliance checks in the office documents module. */
export const DRIVER_REQUIRED_DOCUMENT_TYPES = [
  ...DRIVER_SELF_UPLOAD_REQUIRED_TYPES,
  ...DRIVER_OFFICE_DOCUMENT_TYPES,
] as const;

export function isDriverUploadDocumentType(value: string): value is DriverUploadDocumentType {
  return (DRIVER_UPLOAD_DOCUMENT_TYPES as readonly string[]).includes(value);
}
