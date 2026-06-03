export type OfficeEinsatzTab = 'heute' | 'morgen' | 'betrieb';

/** Legacy admin query params (non-office Einsatzplan). */
export type EinsatzplanPanel = 'tagesplanung' | 'urlaubsplaner' | 'company_notifications';
export type EinsatzplanView =
  | 'daily-overview'
  | 'planning'
  | 'morning-checkins'
  | 'vehicle-handovers'
  | 'company-notifications';

export function officeAssignmentsHref(options?: {
  tab?: OfficeEinsatzTab;
  date?: string;
  view?: EinsatzplanView;
  transportId?: string;
}): string {
  const params = new URLSearchParams();
  if (options?.tab) params.set('tab', options.tab);
  if (options?.date) params.set('date', options.date);
  if (options?.view) params.set('view', options.view);
  if (options?.transportId) params.set('transport', options.transportId);
  const query = params.toString();
  return query ? `/assignments?${query}` : '/assignments';
}

/** Resolves office tab from legacy panel/view query params. */
export function resolveOfficeTabFromQuery(search: URLSearchParams): OfficeEinsatzTab {
  const tab = search.get('tab');
  if (tab === 'heute' || tab === 'morgen' || tab === 'betrieb') return tab;

  const view = search.get('view');
  const panel = search.get('panel');
  if (panel === 'company_notifications' || view === 'company-notifications') return 'betrieb';
  if (
    view === 'morning-checkins'
    || view === 'vehicle-handovers'
    || view === 'planning'
    || search.get('transport')
  ) {
    return 'betrieb';
  }
  if (panel === 'tagesplanung' || view === 'daily-overview') return 'heute';
  return 'heute';
}

export function einsatzplanHref(options?: {
  date?: string;
  panel?: EinsatzplanPanel;
  view?: EinsatzplanView;
  transportId?: string;
  /** When true, use office tab URLs instead of legacy panel= params. */
  office?: boolean;
  tab?: OfficeEinsatzTab;
}): string {
  if (options?.office || options?.tab) {
    const tab =
      options.tab
      ?? (options.view === 'daily-overview' || options.panel === 'tagesplanung' ? 'heute' : 'betrieb');
    return officeAssignmentsHref({
      tab,
      date: options.date,
      view: options.view,
      transportId: options.transportId,
    });
  }

  const params = new URLSearchParams();
  if (options?.date) params.set('date', options.date);
  if (options?.panel) params.set('panel', options.panel);
  if (options?.view) params.set('view', options.view);
  if (options?.transportId) params.set('transport', options.transportId);
  const query = params.toString();
  return query ? `/assignments?${query}` : '/assignments';
}

export function liveTrackingHref(driverId?: string, assignmentId?: string): string {
  const params = new URLSearchParams();
  if (driverId) params.set('driver', driverId);
  if (assignmentId) params.set('assignment', assignmentId);
  const query = params.toString();
  return query ? `/live-tracking?${query}` : '/live-tracking';
}

export function officeQueueHref(category?: string): string {
  if (!category) return '/office/queue';
  return `/office/queue?category=${encodeURIComponent(category)}`;
}

export function assignmentDetailHref(assignmentId: string, date?: string): string {
  return einsatzplanHref({ date, panel: 'tagesplanung', view: 'daily-overview', transportId: undefined });
}
