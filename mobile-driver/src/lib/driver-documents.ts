export const DRIVER_UPLOAD_DOCUMENT_TYPES = [
  'Driving License',
  'Passport',
  'ADR Certificate',
  'Medical Certificate',
  'Work Permit',
  'Equipment',
  'Other',
] as const;

export type DriverUploadDocumentType = (typeof DRIVER_UPLOAD_DOCUMENT_TYPES)[number];

/** Must be uploaded before using the app (matches backend). */
export const DRIVER_SELF_UPLOAD_REQUIRED_TYPES = ['Driving License', 'Passport'] as const;

export const DRIVER_OFFICE_DOCUMENT_TYPES = ['Contract', 'Salary Document'] as const;

export const DRIVER_REQUIRED_DOCUMENT_TYPES = [
  ...DRIVER_SELF_UPLOAD_REQUIRED_TYPES,
  ...DRIVER_OFFICE_DOCUMENT_TYPES,
] as const;

export type DriverRequiredDocumentType = (typeof DRIVER_REQUIRED_DOCUMENT_TYPES)[number];

export function documentTypeLabelKey(type: string): string {
  const slug = type
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
  return `documents.type_${slug}`;
}
