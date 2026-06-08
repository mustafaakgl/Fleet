/** Prisma model names (PascalCase) that carry a direct `tenantId` column. */
export const TENANT_SCOPED_MODELS = new Set([
  'User',
  'Driver',
  'Vehicle',
  'Company',
  'Assignment',
  'TransportRequest',
  'CalendarEvent',
  'Request',
  'Document',
  'VehicleHandover',
  'Accident',
  'CompanyEmail',
  'Notification',
  'Reminder',
  'MorningCheckin',
  'ServiceRecord',
  'Conversation',
  'AuditLog',
  'DriverLocationHistory',
  'DriverLocationLatest',
  'CustomerAssignmentMessage',
  'UserInvitation',
  'WorkSession',
  'VehicleEquipment',
]);

export function isTenantScopedModel(model: string): boolean {
  return TENANT_SCOPED_MODELS.has(model);
}
