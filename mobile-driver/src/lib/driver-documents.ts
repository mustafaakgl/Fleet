export const DRIVER_UPLOAD_DOCUMENT_TYPES = [
  'Driving License',
  'Passport',
  'ADR Certificate',
  'Medical Certificate',
  'Work Permit',
  'Other',
] as const;

export type DriverUploadDocumentType = (typeof DRIVER_UPLOAD_DOCUMENT_TYPES)[number];

export function documentTypeLabelKey(type: string): string {
  const slug = type
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
  return `documents.type_${slug}`;
}
