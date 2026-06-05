import type { FleetAssignment } from '@/context/FleetDataContext';

export const PLANNING_DRAFT_PREFIX = 'planning-draft:';

export function isPlanningDraftAssignmentId(id: string): boolean {
  return id.startsWith(PLANNING_DRAFT_PREFIX);
}

export function buildPlanningDraftId(driverId: string, date: string): string {
  return `${PLANNING_DRAFT_PREFIX}${driverId}:${date}`;
}

export function parsePlanningDraftId(id: string): { driverId: string; date: string } | null {
  if (!isPlanningDraftAssignmentId(id)) return null;
  const rest = id.slice(PLANNING_DRAFT_PREFIX.length);
  const separatorIndex = rest.lastIndexOf(':');
  if (separatorIndex <= 0) return null;
  return {
    driverId: rest.slice(0, separatorIndex),
    date: rest.slice(separatorIndex + 1),
  };
}

export function createPlanningPlaceholder(
  driverId: string,
  date: string,
  department: string,
): FleetAssignment {
  return {
    id: buildPlanningDraftId(driverId, date),
    date,
    driverId,
    department,
    availability: 'Available',
    vehicle: '',
    company: '',
    routeJob: '',
    pickupAddress: '',
    deliveryAddress: '',
    startTime: '07:00',
    endTime: '15:00',
    status: 'Planned',
    source: 'manual',
    expectedRevenue: 0,
    notes: '',
  };
}

export function inferAssignmentSource(notes?: string | null): FleetAssignment['source'] {
  if (!notes) return 'manual';
  if (notes.includes('morning check-in')) return 'mobile_checkin';
  if (notes.includes('transport request')) return 'transport_request';
  return 'manual';
}
