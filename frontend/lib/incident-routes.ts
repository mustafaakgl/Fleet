import type { DashboardCriticalAlert } from '@/lib/types';
import { einsatzplanHref, officeQueueHref } from '@/lib/office-deep-links';

export type IncidentKind = 'vehicle_accident' | 'cargo_damage';

export function incidentListPath(kind: IncidentKind): string {
  return kind === 'vehicle_accident' ? '/accidents' : '/cargo-damage';
}

export function incidentDetailHref(kind: IncidentKind, id?: string): string {
  const params = new URLSearchParams({ status: 'reported,under_review' });
  if (id) params.set('id', id);
  return `${incidentListPath(kind)}?${params.toString()}`;
}

export function storedNotificationIncidentHref(
  type: string,
  relatedEntityId?: string | null,
): string | undefined {
  if (type === 'accident') {
    return incidentDetailHref('vehicle_accident', relatedEntityId ?? undefined);
  }
  if (type === 'cargo_damage') {
    return incidentDetailHref('cargo_damage', relatedEntityId ?? undefined);
  }
  return undefined;
}

export function criticalAlertHref(alert: DashboardCriticalAlert, office = false): string {
  if (alert.type === 'open_vehicle_accident') {
    return incidentDetailHref('vehicle_accident', alert.relatedEntityId);
  }
  if (alert.type === 'open_cargo_damage') {
    return incidentDetailHref('cargo_damage', alert.relatedEntityId);
  }
  if (alert.relatedEntityType === 'document') return '/documents?status=expiring_soon,expired';
  if (alert.relatedEntityType === 'vehicle_handover') {
    return office
      ? einsatzplanHref({ office: true, tab: 'betrieb', view: 'vehicle-handovers' })
      : '/assignments?panel=tagesplanung&view=vehicle-handovers';
  }
  if (alert.relatedEntityType === 'company_email') {
    return office
      ? einsatzplanHref({ office: true, tab: 'betrieb', view: 'company-notifications' })
      : '/assignments?panel=company_notifications&view=company-notifications';
  }
  if (alert.relatedEntityType === 'assignment') {
    return office
      ? einsatzplanHref({ office: true, tab: 'heute', view: 'daily-overview' })
      : '/assignments?panel=tagesplanung&view=daily-overview';
  }
  return office ? officeQueueHref() : '/dashboard';
}
