import type { FleetRequest, RequestStatus, SonstigeAbwesenheitType } from '@/context/FleetDataContext';

export type AntragStatus = 'offen' | 'angenommen' | 'abgelehnt' | 'storniert';
export type AntragSource = 'manual' | 'request_auto';

export interface AntragFromRequest {
  id: string;
  requestId: string;
  antragsdatum: string;
  driverId: string;
  driverName: string;
  department: string;
  antragsart: 'Urlaubstag' | 'Sonstiger Abwesenheit';
  sonstigeAbwesenheit?: SonstigeAbwesenheitType;
  kommentar: string;
  bearbeitungsdatum: string;
  bearbeitetVon: string;
  vertretung: string;
  anmerkungen: string;
  calendarStatus: string;
  dateFrom: string;
  dateTo: string;
  dauer: string;
  status: AntragStatus;
  source: AntragSource;
}

function toDateOnly(value: string) {
  return value.split(' ')[0] ?? value;
}

function calculateDauer(dateFrom: string, dateTo: string) {
  const from = new Date(`${dateFrom}T00:00:00`);
  const to = new Date(`${dateTo}T00:00:00`);
  const diffMs = Math.max(0, to.getTime() - from.getTime());
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24)) + 1;
  return `${days} T`;
}

function getBearbeitungsdatum(request: FleetRequest) {
  if (request.status === 'Approved' || request.status === 'Rejected' || request.status === 'Cancelled') {
    return toDateOnly(request.submittedAt);
  }
  return '-';
}

function getBearbeitetVon(request: FleetRequest) {
  if (request.status === 'Approved' || request.status === 'Rejected' || request.status === 'Cancelled') {
    return request.responsibleDepartment;
  }
  return '-';
}

function mapRequestStatus(status: RequestStatus): AntragStatus {
  if (status === 'Approved') return 'angenommen';
  if (status === 'Rejected') return 'abgelehnt';
  if (status === 'Cancelled') return 'storniert';
  return 'offen';
}

function mapSonstigeToCalendarStatus(type?: SonstigeAbwesenheitType) {
  if (type === 'Krankenstand') return 'KT';
  if (type === 'Sonderurlaub') return 'UT';
  if (type === 'Pflegefreistellung') return 'UT';
  if (type === 'Schulung') return 'SCH';
  if (type === 'Homeoffice') return 'HO';
  if (type === 'Geschäftsreise') return 'GR';
  return 'SA';
}

export function isCalendarRelevantRequest(request: FleetRequest) {
  return (
    request.type === 'Urlaub beantragen'
    || request.type === 'Krankheit melden'
    || request.type === 'Sonstige Abwesenheit'
  );
}

export function createAntragFromRequest(request: FleetRequest): AntragFromRequest | null {
  if (!isCalendarRelevantRequest(request)) return null;
  if (!request.dateFrom) return null;

  if (request.type === 'Urlaub beantragen') {
    const dateTo = request.dateTo ?? request.dateFrom;
    return {
      id: `antrag-${request.id}`,
      requestId: request.id,
      antragsdatum: toDateOnly(request.submittedAt),
      driverId: request.driverId,
      driverName: request.driverName,
      department: request.department,
      antragsart: 'Urlaubstag',
      kommentar: request.notes,
      bearbeitungsdatum: getBearbeitungsdatum(request),
      bearbeitetVon: getBearbeitetVon(request),
      vertretung: '-',
      anmerkungen: request.uploadedDocument === '-' ? '-' : request.uploadedDocument,
      calendarStatus: 'UT',
      dateFrom: request.dateFrom,
      dateTo,
      dauer: calculateDauer(request.dateFrom, dateTo),
      status: mapRequestStatus(request.status),
      source: 'request_auto',
    };
  }

  if (request.type === 'Krankheit melden') {
    const dateTo = request.dateTo ?? request.dateFrom;
    return {
      id: `antrag-${request.id}`,
      requestId: request.id,
      antragsdatum: toDateOnly(request.submittedAt),
      driverId: request.driverId,
      driverName: request.driverName,
      department: request.department,
      antragsart: 'Sonstiger Abwesenheit',
      sonstigeAbwesenheit: 'Krankenstand',
      kommentar: request.notes,
      bearbeitungsdatum: getBearbeitungsdatum(request),
      bearbeitetVon: getBearbeitetVon(request),
      vertretung: '-',
      anmerkungen: request.uploadedDocument === '-' ? '-' : request.uploadedDocument,
      calendarStatus: 'KT',
      dateFrom: request.dateFrom,
      dateTo,
      dauer: calculateDauer(request.dateFrom, dateTo),
      status: mapRequestStatus(request.status),
      source: 'request_auto',
    };
  }

  const dateTo = request.dateTo ?? request.dateFrom;
  return {
    id: `antrag-${request.id}`,
    requestId: request.id,
    antragsdatum: toDateOnly(request.submittedAt),
    driverId: request.driverId,
    driverName: request.driverName,
    department: request.department,
    antragsart: 'Sonstiger Abwesenheit',
    sonstigeAbwesenheit: request.sonstigeAbwesenheitType,
    kommentar: request.notes,
    bearbeitungsdatum: getBearbeitungsdatum(request),
    bearbeitetVon: getBearbeitetVon(request),
    vertretung: '-',
    anmerkungen: request.uploadedDocument === '-' ? '-' : request.uploadedDocument,
    calendarStatus: mapSonstigeToCalendarStatus(request.sonstigeAbwesenheitType),
    dateFrom: request.dateFrom,
    dateTo,
    dauer: calculateDauer(request.dateFrom, dateTo),
    status: mapRequestStatus(request.status),
    source: 'request_auto',
  };
}

export function createAntraegeFromRequests(requests: FleetRequest[]) {
  return requests
    .map((request) => createAntragFromRequest(request))
    .filter((item): item is AntragFromRequest => Boolean(item));
}
