export const DRIVER_UPLOAD_DOCUMENT_TYPES = [
  'Driving License',
  'Passport',
  'ADR Certificate',
  'Medical Certificate',
  'Work Permit',
  'Other',
] as const;

export const DRIVER_SELF_UPLOAD_REQUIRED_TYPES = ['Driving License', 'Passport'] as const;

export function driverDocumentTypeLabelKey(type: string): string {
  const slug = type
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
  return `driverPortal.documents.type_${slug}`;
}
