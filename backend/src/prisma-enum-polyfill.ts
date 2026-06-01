type EnumShape = Record<string, string>;

function asEnum(values: readonly string[]): EnumShape {
  return Object.freeze(
    values.reduce<EnumShape>((acc, value) => {
      acc[value] = value;
      return acc;
    }, {}),
  );
}

const enumPolyfills: Record<string, EnumShape> = {
  UserRole: asEnum(['admin', 'boss', 'accounting', 'office', 'driver']),
  UserStatus: asEnum(['active', 'inactive']),
  DriverStatus: asEnum(['active', 'on_leave', 'sick', 'inactive', 'terminated']),
  RiskLevel: asEnum(['green', 'yellow', 'red']),
  VehicleStatus: asEnum(['active', 'maintenance', 'broken', 'inactive']),
  AssignmentStatus: asEnum(['planned', 'confirmed', 'in_progress', 'completed', 'cancelled']),
  TransportRequestStatus: asEnum(['pending', 'approved', 'rejected', 'needs_review']),
  CalendarStatus: asEnum(['AT', 'UT', 'KT', 'FT', 'HO', 'SCH', 'GR', 'AZ', 'SZ', 'US', 'FR', 'WE', 'AB', 'MT']),
  CalendarSource: asEnum(['assignment', 'leave', 'manual']),
  RequestType: asEnum(['vacation', 'sick_leave', 'training', 'business_trip', 'doctor_appointment', 'special_leave', 'overtime_compensation', 'free_day', 'other']),
  RequestStatus: asEnum(['pending', 'approved', 'rejected', 'cancelled', 'needs_review']),
  DocumentOwnerType: asEnum(['driver', 'vehicle', 'company', 'request', 'accident', 'cargo_damage', 'vehicle_handover', 'assignment', 'service_record']),
  DocumentStatus: asEnum(['valid', 'expiring_soon', 'expired', 'missing', 'archived']),
  HandoverType: asEnum(['pickup', 'return']),
  HandoverPhotoStatus: asEnum(['not_required', 'missing', 'uploaded', 'approved', 'rejected']),
  HandoverStatus: asEnum(['pending', 'completed']),
  IncidentType: asEnum(['vehicle_accident', 'cargo_damage']),
  IncidentStatus: asEnum(['reported', 'under_review', 'resolved', 'rejected']),
  CompanyEmailStatus: asEnum(['draft', 'draft_ready', 'needs_review', 'sent', 'failed']),
  NotificationType: asEnum(['transport_request', 'request', 'document', 'handover', 'accident', 'cargo_damage', 'company_email', 'reminder', 'system']),
  NotificationPriority: asEnum(['low', 'medium', 'high', 'critical']),
  NotificationStatus: asEnum(['unread', 'read']),
  ReminderStatus: asEnum(['open', 'sent', 'resolved', 'ignored']),
  ReminderType: asEnum(['license_expiry', 'passport_expiry', 'tuv_expiry', 'sp_expiry', 'insurance_expiry', 'document_expiry', 'custom']),
  MorningCheckinStatus: asEnum(['confirmed', 'waiting_for_review', 'missing_vehicle_plate', 'missing_company', 'conflict', 'added_to_einsatzplan', 'rejected']),
};

try {
  // Prisma 6 no longer exports runtime enums at top-level.
  // Legacy code still imports them from @prisma/client, so we backfill once on boot.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const prismaClient = require('@prisma/client') as Record<string, unknown>;
  for (const [key, value] of Object.entries(enumPolyfills)) {
    if (prismaClient[key] === undefined) {
      prismaClient[key] = value;
    }
  }
} catch {
  // noop: if prisma client cannot be loaded, regular startup errors will surface.
}
