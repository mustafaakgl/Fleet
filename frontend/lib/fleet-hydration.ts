import { toLocalCalendarDate } from '@/lib/calendar-date';
import { DEFAULT_VACATION_ENTITLEMENT } from '@/lib/calendar-vacation';
import { inferAssignmentSource } from '@/lib/planning-assignment';
import { getDriverRiskScore } from '@/lib/utils';
import {
  assignmentsApi,
  calendarApi,
  companyEmailsApi,
  driversApi,
  leaveRequestsApi,
  morningCheckinsApi,
  transportRequestsApi,
} from '@/lib/api';
import type {
  CalendarStatusCode,
  CalendarStatusSource,
  CompanyEmailDraft,
  FleetAssignment,
  FleetCalendarStatus,
  FleetDriver,
  FleetRequest,
  MorningCheckin,
  MorningCheckinStatus,
  PlanningStatus,
  RequestStatus,
  RequestType,
  TransportRequest,
} from '@/context/FleetDataContext';

function formatDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function addDays(base: Date, days: number) {
  const value = new Date(base);
  value.setDate(value.getDate() + days);
  return value;
}

const DEFAULT_DEPARTMENT = 'Operations';

function mapAssignmentStatus(status: string): PlanningStatus {
  if (status === 'in_progress') return 'In Progress';
  if (status === 'cancelled' || status === 'completed') return 'Unavailable';
  return 'Planned';
}

const STATUS_PRIORITY: Record<PlanningStatus, number> = {
  'In Progress': 3,
  Planned: 2,
  Unavailable: 1,
};

/** UI safety net: one assignment per driver per calendar day. */
function dedupeAssignmentsByDriverDay(rows: FleetAssignment[]): FleetAssignment[] {
  const byKey = new Map<string, FleetAssignment>();
  for (const row of rows) {
    const key = `${row.driverId}:${row.date}`;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, row);
      continue;
    }
    const keepCurrent =
      (STATUS_PRIORITY[row.status] ?? 0) >= (STATUS_PRIORITY[existing.status] ?? 0);
    byKey.set(key, keepCurrent ? row : existing);
  }
  return [...byKey.values()];
}

export interface FleetHydrationResult {
  drivers: FleetDriver[];
  calendarStatuses: FleetCalendarStatus[];
  assignments: FleetAssignment[];
  transportRequests: TransportRequest[];
  morningCheckins: MorningCheckin[];
  requests: FleetRequest[];
  companyEmailDrafts: CompanyEmailDraft[];
  errors: string[];
}

const DEFAULT_PAGE_LIMIT = 100;
const MAX_PAGES = 30;

async function loadAllDriversPaginated(limit = DEFAULT_PAGE_LIMIT) {
  const rows: Awaited<ReturnType<typeof driversApi.list>>['data'] = [];
  let page = 1;
  let total = 0;

  while (page <= MAX_PAGES) {
    const response = await driversApi.list({ page, limit });
    rows.push(...response.data);
    total = response.total;
    if (rows.length >= total || response.data.length === 0) {
      break;
    }
    page += 1;
  }

  return rows;
}

async function loadAllAssignmentsPaginated(limit = DEFAULT_PAGE_LIMIT) {
  const rows: Awaited<ReturnType<typeof assignmentsApi.list>>['data'] = [];
  let page = 1;
  let total = 0;

  while (page <= MAX_PAGES) {
    const response = await assignmentsApi.list({ page, limit });
    rows.push(...response.data);
    total = response.total ?? rows.length;
    if (rows.length >= total || response.data.length === 0) {
      break;
    }
    page += 1;
  }

  return rows;
}

export async function hydrateFleetData(
  departmentByDriverId?: Map<string, string>,
): Promise<FleetHydrationResult> {
  const dept = (driverId: string) => departmentByDriverId?.get(driverId) ?? DEFAULT_DEPARTMENT;
  const errors: string[] = [];

  let drivers: FleetDriver[] = [];
  try {
    const driverRows = await loadAllDriversPaginated();
    drivers = driverRows.map((d) => ({
      id: d.id,
      name: `${d.first_name} ${d.last_name}`.trim(),
      department: dept(d.id),
      accidentCount: d.accident_count ?? 0,
      riskScore: getDriverRiskScore(d.accident_count ?? 0),
      vacationEntitlementDays: d.vacation_entitlement_days ?? DEFAULT_VACATION_ENTITLEMENT,
      vacationCarryOverDays: d.vacation_carry_over_days ?? 0,
    }));
  } catch {
    errors.push('drivers');
  }

  let calendarStatuses: FleetCalendarStatus[] = [];
  try {
    const now = new Date();
    const from = formatDate(addDays(now, -90));
    const to = formatDate(addDays(now, 90));
    const events = await calendarApi.list({ from, to });
    const allowed = new Set(['UT', 'KT', 'FT', 'AT', 'HO', 'GR', 'SCH', 'US', 'FR', 'AB', 'WE', 'MT', 'AZ', 'SZ']);
    const sourceMap: Record<string, CalendarStatusSource> = {
      manual: 'manual',
      leave: 'request',
      assignment: 'assignment',
    };
    calendarStatuses = events
      .filter((e) => allowed.has(e.status))
      .map((e) => ({
        id: e.id,
        driverId: e.driverId,
        date: (e.date ?? '').slice(0, 10),
        status: e.status as CalendarStatusCode,
        source: sourceMap[e.source] ?? 'manual',
        requestId: e.requestId ?? undefined,
        assignmentId: e.assignmentId ?? undefined,
      }));
  } catch {
    errors.push('calendar');
  }

  let assignments: FleetAssignment[] = [];
  try {
    const assignmentRows = await loadAllAssignmentsPaginated();
    const activeRows = assignmentRows.filter((a) => a.status !== 'cancelled');
    assignments = dedupeAssignmentsByDriverDay(
      activeRows.map((a) => ({
        id: a.id,
        date: (a.work_date ?? '').slice(0, 10),
        driverId: a.driver.id,
        department: dept(a.driver.id),
        availability: 'Available',
        vehicle: a.vehicle.plate_number,
        company: a.company_name,
        routeJob:
          [a.pickup_address, a.delivery_address].filter(Boolean).join(' → ')
          || a.route_name
          || '',
        routeName: a.route_name,
        cargoName: a.cargo_name,
        cargoOwner: a.cargo_owner,
        pickupAddress: a.pickup_address,
        deliveryAddress: a.delivery_address,
        startTime: a.start_time,
        endTime: a.end_time,
        notes: a.notes ?? '',
        status: mapAssignmentStatus(a.status),
        source: inferAssignmentSource(a.notes),
        expectedRevenue:
          a.expected_daily_revenue
          ?? a.company_default_daily_revenue
          ?? 0,
      })),
    );
  } catch {
    errors.push('assignments');
  }

  let transportRequests: TransportRequest[] = [];
  try {
    const apiTransport = await transportRequestsApi.list();
    transportRequests = apiTransport.map((t) => ({
      id: t.id,
      driverId: t.driverId,
      date: (t.requestedDate ?? '').slice(0, 10),
      submittedAt: t.requestedDate ?? '',
      vehicleId: t.vehicleId,
      companyId: t.companyId,
      cargoName: t.cargoName,
      cargoOwner: t.cargoOwner,
      pickupAddress: t.pickupAddress,
      deliveryAddress: t.deliveryAddress,
      startTime: t.startTime,
      endTime: t.endTime,
      routeName: undefined,
      notes: t.notes ?? undefined,
      status: t.status,
      conflictReason: t.conflictReason ?? undefined,
      source: 'mobile_app',
    }));
  } catch {
    errors.push('transportRequests');
  }

  let morningCheckins: MorningCheckin[] = [];
  try {
    const today = formatDate(new Date());
    const apiCheckins = await morningCheckinsApi.list({ date: today });
    const statusMap: Record<string, MorningCheckinStatus> = {
      confirmed: 'Confirmed',
      waiting_for_review: 'Waiting for Review',
      missing_vehicle_plate: 'Missing Vehicle Plate',
      missing_company: 'Missing Company',
      conflict: 'Conflict',
      added_to_einsatzplan: 'Added to Einsatzplan',
      rejected: 'Rejected',
    };
    morningCheckins = apiCheckins.map((c) => ({
      id: c.id,
      driverId: c.driver_id,
      date: toLocalCalendarDate(c.date ?? ''),
      submittedAt: c.submitted_at ?? '',
      vehiclePlate: c.vehicle_plate ?? '',
      company: c.company_name ?? '',
      cargoName: c.cargo_name ?? undefined,
      cargoQuantity: c.cargo_quantity ?? undefined,
      status: statusMap[c.status] ?? 'Waiting for Review',
      conflictReason: c.conflict_reason ?? undefined,
      source: 'mobile_app',
      notes: c.notes,
      assignmentId: c.assignment_id ?? undefined,
    }));
  } catch {
    errors.push('morningCheckins');
  }

  let requests: FleetRequest[] = [];
  try {
    const apiLeave = await leaveRequestsApi.list();
    const reqStatusMap: Record<string, RequestStatus> = {
      pending: 'Pending',
      approved: 'Approved',
      rejected: 'Rejected',
      cancelled: 'Cancelled',
      needs_review: 'Needs Review',
    };
    const typeMap: Record<string, RequestType> = {
      vacation: 'Urlaub beantragen',
      sick_leave: 'Krankheit melden',
      training: 'Sonstige Abwesenheit',
      business_trip: 'Sonstige Abwesenheit',
      doctor_appointment: 'Sonstige Abwesenheit',
      special_leave: 'Sonstige Abwesenheit',
      overtime_compensation: 'Sonstige Abwesenheit',
      free_day: 'Sonstige Abwesenheit',
      uniform_delivery: 'Arbeitskleidung bestätigen',
      other: 'Sonstige Abwesenheit',
    };
    requests = apiLeave.map((r) => ({
      id: r.id,
      driverId: r.driverId,
      driverName: r.driver ? `${r.driver.firstName} ${r.driver.lastName}` : r.driverId,
      department: dept(r.driverId),
      type: typeMap[r.type] ?? 'Sonstige Abwesenheit',
      dateFrom: (r.startDate ?? '').slice(0, 10),
      dateTo: (r.endDate ?? '').slice(0, 10),
      status: reqStatusMap[r.status] ?? 'Pending',
      responsibleDepartment: 'HR',
      submittedAt: r.createdAt ?? new Date().toISOString(),
      notes: r.reason ?? '',
      uploadedDocument: '',
    }));
  } catch {
    errors.push('requests');
  }

  let companyEmailDrafts: CompanyEmailDraft[] = [];
  try {
    const apiEmails = await companyEmailsApi.list();
    const draftStatusMap: Record<string, CompanyEmailDraft['status']> = {
      draft_ready: 'draft_ready',
      needs_review: 'needs_review',
      draft: 'needs_review',
    };
    companyEmailDrafts = apiEmails
      .filter((e) => e.status === 'draft_ready' || e.status === 'needs_review' || e.status === 'draft')
      .map((e) => ({
        id: e.id,
        companyId: e.companyId,
        date: (e.date ?? '').slice(0, 10),
        subject: e.subject,
        body: e.body,
        status: draftStatusMap[e.status] ?? 'needs_review',
        lastUpdatedAt: e.lastSentAt ?? new Date().toISOString(),
      }));
  } catch {
    errors.push('companyEmails');
  }

  return {
    drivers,
    calendarStatuses,
    assignments,
    transportRequests,
    morningCheckins,
    requests,
    companyEmailDrafts,
    errors,
  };
}
